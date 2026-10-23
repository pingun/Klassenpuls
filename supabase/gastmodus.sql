-- ============ Gastmodus: Abstimmungen ohne Konto ============
-- Gäste melden sich per Supabase „Anonymous Sign-in“ an (JWT-Claim is_anonymous = true).
-- Schalter: app_settings 'guest_mode' = { enabled: bool } (Standard: aus).
-- Gast-Abstimmungen: ungespeichert 24 h, nach „Speichern“ 3 Tage ab Speichern (8-stelliger Code), danach gelöscht.
-- Missbrauchsschutz: höchstens 5 Abstimmungen je Gast, 30 Fragen je Abstimmung, Begrenzungen je IP-Adresse
-- (nur als Hash gespeichert), keine eigenen Bild-Uploads, kein Zugriff auf geteilte Lehrer-Inhalte.
-- Migrationen "gastmodus" und "gastmodus_fix_guard"

create or replace function public.is_guest() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function public.guest_mode_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value ->> 'enabled')::boolean from public.app_settings s where s.key = 'guest_mode'), false);
$$;
grant execute on function public.guest_mode_enabled() to anon, authenticated;

-- Gäste haben keine E-Mail: Domain-Prüfung überspringen und kein Profil anlegen (damit auch nie Admin)
create or replace function public.enforce_teacher_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous then return new; end if;
  if exists (select 1 from public.admin_invites i
             where i.email = lower(new.email) and i.created_at > now() - interval '10 minutes') then
    return new;
  end if;
  if not public.is_email_domain_allowed(new.email) then
    raise exception 'E-Mail-Domain ist nicht zugelassen' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.admin_invites;
begin
  if new.is_anonymous then return new; end if;
  delete from public.admin_invites
   where email = lower(new.email) and created_at > now() - interval '10 minutes'
  returning * into inv;
  insert into public.profiles (id, email, full_name, is_admin, must_change_password)
  values (
    new.id, new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')), ''),
    coalesce(inv.make_admin, false) or not exists (select 1 from public.profiles where is_admin),
    inv.email is not null
  );
  return new;
end $$;

-- Begrenzung je IP-Adresse (Hash) bzw. – ohne IP – je Nutzer
create table public.guest_rate (
  key text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index on public.guest_rate (key, action, created_at);
alter table public.guest_rate enable row level security;

create or replace function public.guest_rate_check(p_action text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
declare h jsonb; ip text; k text;
begin
  h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  ip := btrim(split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-forwarded-for', ''), ',', 1));
  k := case when ip <> '' then 'ip:' || encode(sha256(convert_to('klassenpuls|' || ip, 'UTF8')), 'hex')
            when auth.uid() is not null then 'user:' || auth.uid()::text end;
  if k is null then return; end if; -- z. B. SQL-Editor
  if (select count(*) from public.guest_rate r where r.key = k and r.action = p_action and r.created_at > now() - p_window) >= p_max then
    raise exception 'Zu viele Versuche in kurzer Zeit. Bitte versuche es später noch einmal.' using errcode = 'P0001';
  end if;
  insert into public.guest_rate (key, action) values (k, p_action);
end $$;
revoke execute on function public.guest_rate_check(text, int, interval) from public, anon, authenticated;

-- Ablauf und Speichercode
alter table public.polls add column guest_code text unique check (guest_code ~ '^[0-9]{8}$');
alter table public.polls add column expires_at timestamptz;
create index on public.polls (expires_at) where expires_at is not null;

-- Gäste: Limits, Ablauf setzen, nichts teilen; Ablauf/Code ändert nur die Datenbank selbst (save/open)
create or replace function public.polls_guest_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare internal boolean := coalesce(current_setting('klassenpuls.internal', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if public.is_guest() then
      if not public.guest_mode_enabled() then raise exception 'Der Gastmodus ist ausgeschaltet' using errcode = 'P0001'; end if;
      if (select count(*) from public.polls p where p.owner_id = auth.uid()) >= 5 then
        raise exception 'Als Gast kannst du höchstens 5 Abstimmungen gleichzeitig haben.' using errcode = 'P0001';
      end if;
      perform public.guest_rate_check('poll', 30, interval '1 hour');
      new.expires_at := now() + interval '24 hours';
    else
      new.expires_at := null;
    end if;
    new.guest_code := null;
  elsif not internal then
    new.expires_at := old.expires_at;
    new.guest_code := old.guest_code;
    new.owner_id := old.owner_id;
  end if;
  if public.is_guest() then new.is_shared := false; end if;
  return new;
end $$;
create trigger polls_guest_guard before insert or update on public.polls
  for each row execute function public.polls_guest_guard();

create or replace function public.questions_guest_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_guest() and (select count(*) from public.questions q where q.poll_id = new.poll_id) >= 30 then
    raise exception 'Eine Gast-Abstimmung kann höchstens 30 Fragen haben.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger questions_guest_guard before insert on public.questions
  for each row execute function public.questions_guest_guard();

create or replace function public.sessions_guest_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_guest() then perform public.guest_rate_check('session', 60, interval '1 hour'); end if;
  return new;
end $$;
create trigger sessions_guest_guard before insert on public.sessions
  for each row execute function public.sessions_guest_guard();

-- Gäste sehen keine geteilten Inhalte der Lehrer und keine Domain-Liste
drop policy "polls read" on public.polls;
create policy "polls read" on public.polls for select to authenticated
  using (owner_id = (select auth.uid()) or (is_shared and not (select public.is_guest())));
drop policy "questions read" on public.questions;
create policy "questions read" on public.questions for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id
    and (p.owner_id = (select auth.uid()) or (p.is_shared and not (select public.is_guest())))));
drop policy "sessions owner" on public.sessions;
create policy "sessions owner" on public.sessions for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.polls p where p.id = poll_id
      and (p.owner_id = (select auth.uid()) or (p.is_shared and not (select public.is_guest())))));
drop policy "domains read" on public.allowed_domains;
create policy "domains read" on public.allowed_domains for select to authenticated using (not (select public.is_guest()));

-- Gäste laden keine eigenen Bilder hoch (nur Bildbibliothek)
drop policy "question images insert own folder" on storage.objects;
create policy "question images insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select public.is_guest()));

-- „Für 3 Tage speichern“: 8-stelligen Code vergeben (einmalig, die Frist verlängert sich nicht)
create or replace function public.save_guest_poll(p_poll uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.polls; c text;
begin
  select * into p from public.polls where id = p_poll and owner_id = auth.uid() for update;
  if not found then raise exception 'Abstimmung nicht gefunden' using errcode = 'P0001'; end if;
  if p.expires_at is null then raise exception 'Diese Abstimmung ist dauerhaft gespeichert' using errcode = 'P0001'; end if;
  if p.guest_code is null then
    loop
      c := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint) % 100000000)::text, 8, '0');
      exit when not exists (select 1 from public.polls where guest_code = c);
    end loop;
    perform set_config('klassenpuls.internal', '1', true);
    update public.polls set guest_code = c, expires_at = now() + interval '3 days' where id = p.id returning * into p;
    perform set_config('klassenpuls.internal', '', true);
  end if;
  return jsonb_build_object('code', p.guest_code, 'expires_at', p.expires_at);
end $$;
grant execute on function public.save_guest_poll(uuid) to authenticated;

-- Gespeicherte Abstimmung mit Code öffnen (auf einem anderen Gerät). Gäste übernehmen sie bis zum Ablauf,
-- Lehrer übernehmen sie dauerhaft in ihr Konto.
create or replace function public.open_guest_poll(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.polls; c text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet' using errcode = 'P0001'; end if;
  perform public.guest_rate_check('open', 20, interval '1 hour');
  select * into p from public.polls where guest_code = c and expires_at > now() for update;
  if not found then raise exception 'Der Code ist ungültig oder abgelaufen.' using errcode = 'P0001'; end if;
  if p.owner_id = auth.uid() then return p.id; end if;
  if public.is_guest() and (select count(*) from public.polls where owner_id = auth.uid()) >= 5 then
    raise exception 'Als Gast kannst du höchstens 5 Abstimmungen gleichzeitig haben.' using errcode = 'P0001';
  end if;
  perform set_config('klassenpuls.internal', '1', true);
  if public.is_guest() then
    update public.polls set owner_id = auth.uid() where id = p.id;
  else
    update public.polls set owner_id = auth.uid(), guest_code = null, expires_at = null where id = p.id;
  end if;
  perform set_config('klassenpuls.internal', '', true);
  update public.sessions set owner_id = auth.uid() where poll_id = p.id;
  return p.id;
end $$;
grant execute on function public.open_guest_poll(text) to authenticated;

-- Aufräumen: abgelaufene Gast-Abstimmungen (samt Durchläufen und Ergebnissen), verwaiste Gastkonten, alte Zähler
create or replace function public.cleanup_guests() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.polls where expires_at < now();
  delete from auth.users u where u.is_anonymous and u.created_at < now() - interval '1 day'
    and not exists (select 1 from public.polls p where p.owner_id = u.id);
  delete from public.guest_rate where created_at < now() - interval '1 day';
end $$;
revoke execute on function public.cleanup_guests() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('klassenpuls-gaeste-aufraeumen', '*/15 * * * *', 'select public.cleanup_guests()');
