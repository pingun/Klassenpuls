-- Klassenpuls – Datenbankschema (bereits in deinem Supabase-Projekt eingespielt).
-- Nur nötig, wenn du ein neues Supabase-Projekt aufsetzt: im SQL-Editor komplett ausführen.

create table public.allowed_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  description text,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.polls(owner_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  position int not null default 0,
  type text not null check (type in ('multiple_choice','ranking','scale','open')),
  prompt text not null check (length(prompt) between 1 and 500),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object')
);
create index on public.questions(poll_id, position);

create or replace function public.gen_session_code() returns text
language plpgsql volatile set search_path = '' as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.sessions s where s.code = c and s.status = 'live');
  end loop;
  return c;
end $$;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text,
  code text not null,
  status text not null default 'live' check (status in ('live','ended')),
  current_index int not null default 0,
  show_results boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index sessions_live_code on public.sessions(code) where status = 'live';
create index on public.sessions(owner_id);
create index on public.sessions(poll_id);
alter table public.sessions alter column code set default public.gen_session_code();

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid not null,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, question_id, participant_id)
);
create index on public.responses(question_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- erlaubt, solange es noch keinen Admin gibt (erste Registrierung = Admin)
create or replace function public.is_email_domain_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_domains d
    where lower(split_part(p_email, '@', 2)) = d.domain
  ) or not exists (select 1 from public.profiles where is_admin);
$$;

create or replace function public.enforce_teacher_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_email_domain_allowed(new.email) then
    raise exception 'E-Mail-Domain ist nicht zugelassen' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger enforce_teacher_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_teacher_domain();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, not exists (select 1 from public.profiles where is_admin));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.allowed_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.polls enable row level security;
alter table public.questions enable row level security;
alter table public.sessions enable row level security;
alter table public.responses enable row level security;

create policy "domains read" on public.allowed_domains for select to authenticated using (true);
create policy "domains admin insert" on public.allowed_domains for insert to authenticated with check ((select public.is_admin()));
create policy "domains admin delete" on public.allowed_domains for delete to authenticated using ((select public.is_admin()));

create policy "profiles read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles admin update" on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "polls read" on public.polls for select to authenticated
  using (owner_id = (select auth.uid()) or is_shared);
create policy "polls insert" on public.polls for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "polls update" on public.polls for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "polls delete" on public.polls for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "questions read" on public.questions for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and (p.owner_id = (select auth.uid()) or p.is_shared)));
create policy "questions write" on public.questions for all to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.polls p where p.id = poll_id and p.owner_id = (select auth.uid())));

create policy "sessions owner" on public.sessions for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.polls p where p.id = poll_id and (p.owner_id = (select auth.uid()) or p.is_shared)));

create policy "responses owner read" on public.responses for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));
create policy "responses owner delete" on public.responses for delete to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));

-- Öffentliche Funktionen für Schüler (ohne Login)
create or replace function public.get_live_state(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.sessions; q public.questions; total int; title text;
begin
  select * into s from public.sessions where code = p_code and status = 'live' limit 1;
  if not found then return null; end if;
  select p.title into title from public.polls p where p.id = s.poll_id;
  select count(*) into total from public.questions where poll_id = s.poll_id;
  select * into q from public.questions where poll_id = s.poll_id
    order by position, id offset s.current_index limit 1;
  return jsonb_build_object(
    'session_id', s.id, 'title', title, 'label', s.label,
    'current_index', s.current_index, 'total', total,
    'question', case when q.id is null then null else jsonb_build_object(
      'id', q.id, 'type', q.type, 'prompt', q.prompt, 'options', q.options, 'settings', q.settings) end
  );
end $$;

create or replace function public.submit_response(p_code text, p_question_id uuid, p_participant uuid, p_answer jsonb)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare s public.sessions; q public.questions; n int; v jsonb; mn int; mx int; txt text;
begin
  select * into s from public.sessions where code = p_code and status = 'live' limit 1;
  if not found then raise exception 'Die Umfrage ist nicht (mehr) aktiv'; end if;
  select * into q from public.questions where poll_id = s.poll_id
    order by position, id offset s.current_index limit 1;
  if q.id is null or q.id <> p_question_id then raise exception 'Diese Frage ist nicht mehr aktiv'; end if;
  n := jsonb_array_length(q.options);

  if q.type = 'multiple_choice' then
    v := p_answer->'choices';
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) < 1 then raise exception 'Ungültige Antwort'; end if;
    if not coalesce((q.settings->>'multiple')::boolean, false) and jsonb_array_length(v) > 1 then raise exception 'Nur eine Auswahl erlaubt'; end if;
    if exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e::text)::int < 0 or (e::text)::int >= n)
       or (select count(distinct e::text) from jsonb_array_elements(v) e) <> jsonb_array_length(v)
      then raise exception 'Ungültige Antwort'; end if;
    p_answer := jsonb_build_object('choices', v);
  elsif q.type = 'ranking' then
    v := p_answer->'order';
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> n
       or (select count(distinct (e::text)::int) from jsonb_array_elements(v) e where jsonb_typeof(e) = 'number' and (e::text)::int between 0 and n - 1) <> n
      then raise exception 'Ungültige Reihenfolge'; end if;
    p_answer := jsonb_build_object('order', v);
  elsif q.type = 'scale' then
    v := p_answer->'values';
    mn := coalesce((q.settings->>'min')::int, 1); mx := coalesce((q.settings->>'max')::int, 5);
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> n
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e::text)::numeric < mn or (e::text)::numeric > mx)
      then raise exception 'Ungültige Bewertung'; end if;
    p_answer := jsonb_build_object('values', v);
  elsif q.type = 'open' then
    txt := btrim(coalesce(p_answer->>'text', ''));
    if length(txt) < 1 or length(txt) > 200 then raise exception 'Bitte 1–200 Zeichen eingeben'; end if;
    p_answer := jsonb_build_object('text', txt);
  end if;

  insert into public.responses (session_id, question_id, participant_id, answer)
  values (s.id, q.id, p_participant, p_answer)
  on conflict (session_id, question_id, participant_id) do update set answer = excluded.answer, created_at = now();
  return true;
end $$;

revoke all on function public.get_live_state(text) from public;
revoke all on function public.submit_response(text, uuid, uuid, jsonb) from public;
revoke all on function public.is_email_domain_allowed(text) from public;
revoke all on function public.enforce_teacher_domain() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.gen_session_code() from public, anon;
grant execute on function public.get_live_state(text) to anon, authenticated;
grant execute on function public.submit_response(text, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.is_email_domain_allowed(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.gen_session_code() to authenticated;

alter publication supabase_realtime add table public.responses;
alter publication supabase_realtime add table public.sessions;

-- ============ Lehrer von Hand anlegen (Edge Function "manage-teachers") ============
alter table public.profiles add column full_name text;
alter table public.profiles add column must_change_password boolean not null default false;

-- Vorab-Freigabe für von Admins angelegte Konten. Nur der Server (Service Role) schreibt hier.
create table public.admin_invites (
  email text primary key,
  make_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from anon, authenticated;

create or replace function public.enforce_teacher_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
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
  delete from public.admin_invites
   where email = lower(new.email) and created_at > now() - interval '10 minutes'
  returning * into inv;
  insert into public.profiles (id, email, full_name, is_admin, must_change_password)
  values (
    new.id, new.email,
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    coalesce(inv.make_admin, false) or not exists (select 1 from public.profiles where is_admin),
    inv.email is not null
  );
  return new;
end $$;

create or replace function public.password_changed() returns void
language sql volatile security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

-- ============ Fragetyp "Bild anheften" ============
alter table public.questions drop constraint questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('multiple_choice','ranking','scale','open','pin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "question images select own folder" on storage.objects for select to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "question images insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "question images update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "question images delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Antwortprüfung für alle Fragetypen (NULL-sicher)
create or replace function public.submit_response(p_code text, p_question_id uuid, p_participant uuid, p_answer jsonb)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare s public.sessions; q public.questions; n int; v jsonb; mn int; mx int; txt text; px numeric; py numeric;
begin
  select * into s from public.sessions where code = p_code and status = 'live' limit 1;
  if not found then raise exception 'Die Umfrage ist nicht (mehr) aktiv'; end if;
  select * into q from public.questions where poll_id = s.poll_id
    order by position, id offset s.current_index limit 1;
  if q.id is null or q.id <> p_question_id then raise exception 'Diese Frage ist nicht mehr aktiv'; end if;
  if jsonb_typeof(p_answer) is distinct from 'object' then raise exception 'Ungültige Antwort'; end if;
  n := jsonb_array_length(q.options);

  if q.type = 'multiple_choice' then
    v := p_answer->'choices';
    if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) < 1 then raise exception 'Ungültige Antwort'; end if;
    if not coalesce((q.settings->>'multiple')::boolean, false) and jsonb_array_length(v) > 1 then raise exception 'Nur eine Auswahl erlaubt'; end if;
    if exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e::text)::numeric <> floor((e::text)::numeric) or (e::text)::numeric < 0 or (e::text)::numeric >= n)
       or (select count(distinct e::text) from jsonb_array_elements(v) e) <> jsonb_array_length(v)
      then raise exception 'Ungültige Antwort'; end if;
    p_answer := jsonb_build_object('choices', v);
  elsif q.type = 'ranking' then
    v := p_answer->'order';
    if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) <> n
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e::text)::numeric <> floor((e::text)::numeric))
       or (select count(distinct (e::text)::int) from jsonb_array_elements(v) e where (e::text)::int between 0 and n - 1) <> n
      then raise exception 'Ungültige Reihenfolge'; end if;
    p_answer := jsonb_build_object('order', v);
  elsif q.type = 'scale' then
    v := p_answer->'values';
    mn := coalesce((q.settings->>'min')::int, 1); mx := coalesce((q.settings->>'max')::int, 5);
    if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) <> n
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e::text)::numeric < mn or (e::text)::numeric > mx)
      then raise exception 'Ungültige Bewertung'; end if;
    p_answer := jsonb_build_object('values', v);
  elsif q.type = 'open' then
    txt := btrim(coalesce(p_answer->>'text', ''));
    if length(txt) < 1 or length(txt) > 200 then raise exception 'Bitte 1–200 Zeichen eingeben'; end if;
    p_answer := jsonb_build_object('text', txt);
  elsif q.type = 'pin' then
    if jsonb_typeof(p_answer->'x') is distinct from 'number' or jsonb_typeof(p_answer->'y') is distinct from 'number' then
      raise exception 'Bitte setze deinen Pin auf das Bild';
    end if;
    px := (p_answer->>'x')::numeric; py := (p_answer->>'y')::numeric;
    if px < 0 or px > 1 or py < 0 or py > 1 then raise exception 'Der Pin liegt außerhalb des Bildes'; end if;
    p_answer := jsonb_build_object('x', round(px, 4), 'y', round(py, 4));
  else
    raise exception 'Unbekannter Fragetyp';
  end if;

  insert into public.responses (session_id, question_id, participant_id, answer)
  values (s.id, q.id, p_participant, p_answer)
  on conflict (session_id, question_id, participant_id) do update set answer = excluded.answer, created_at = now();
  return true;
end $$;

-- ============ Bildbibliothek (von Admins gepflegt) ============
create table public.library_images (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  url text not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  category text check (category is null or length(category) <= 60),
  tags text[] not null default '{}',
  width int,
  height int,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.library_images(category);
create index on public.library_images using gin(tags);
alter table public.library_images enable row level security;

create policy "library read" on public.library_images for select to authenticated using (true);
create policy "library admin insert" on public.library_images for insert to authenticated with check ((select public.is_admin()));
create policy "library admin update" on public.library_images for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "library admin delete" on public.library_images for delete to authenticated using ((select public.is_admin()));

create policy "library files admin select" on storage.objects for select to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = 'library' and (select public.is_admin()));
create policy "library files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = 'library' and (select public.is_admin()));
create policy "library files admin update" on storage.objects for update to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = 'library' and (select public.is_admin()));
create policy "library files admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = 'library' and (select public.is_admin()));

create or replace function public.image_usage_count(p_url text) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins'; end if;
  return (select count(*) from public.questions where settings->>'image_url' = p_url);
end $$;
revoke all on function public.image_usage_count(text) from public, anon;
grant execute on function public.image_usage_count(text) to authenticated;

-- ============ Anmeldung mit Microsoft ============
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.admin_invites;
begin
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

create or replace function public.clear_password_flag_for_sso() returns void
language sql volatile security definer set search_path = '' as $$
  update public.profiles p set must_change_password = false
   where p.id = auth.uid()
     and exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'azure');
$$;
revoke all on function public.clear_password_flag_for_sso() from public, anon;
grant execute on function public.clear_password_flag_for_sso() to authenticated;

-- ============ Freiwilliger Name der Schüler ============
-- (submit_response erhält zusätzlich p_name text default null und speichert ihn in participant_name;
--  vollständige Fassung siehe Migration "pollbox_participant_name")
alter table public.responses add column participant_name text check (participant_name is null or length(participant_name) between 1 and 40);

-- ============ Logos (Admin verwaltet, Lehrer wählt oder blendet aus; Anzeige mittig unten) ============
-- Tabellen logos und app_settings, profiles.logo_id und profiles.hide_logo ("kein Logo"), Funktionen effective_logo_url und set_my_logo,
-- get_live_state liefert zusätzlich logo_url. Vollständige Fassung: Migrationen "pollbox_logos" und "pollbox_logo_hide".

-- ============ Eigener Speicher für Logos (auch SVG) ============
-- SVG-Dateien werden vor dem Hochladen im Browser bereinigt (Skripte, Event-Handler, externe Verweise).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types, file_size_limit = excluded.file_size_limit, public = true;

create policy "logo bucket admin select" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (select public.is_admin()));
create policy "logo bucket admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (select public.is_admin()));
create policy "logo bucket admin update" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (select public.is_admin()));
create policy "logo bucket admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (select public.is_admin()));

-- ============ Logo pro Umfrage ausblenden ============
-- polls.hide_logo; get_live_state liefert dann logo_url = null (vollständige Fassung: Migration "pollbox_poll_hide_logo").
alter table public.polls add column hide_logo boolean not null default false;

-- ============ Beendete Durchläufe wieder öffnen ============
create or replace function public.reopen_session(p_session uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s public.sessions; new_code text;
begin
  select * into s from public.sessions where id = p_session and owner_id = auth.uid() for update;
  if not found then raise exception 'Durchlauf nicht gefunden'; end if;
  if s.status = 'live' then return s.code; end if;
  new_code := s.code;
  if exists (select 1 from public.sessions where code = s.code and status = 'live' and id <> s.id) then
    new_code := public.gen_session_code();
  end if;
  update public.sessions set status = 'live', ended_at = null, code = new_code where id = s.id;
  return new_code;
end $$;
revoke all on function public.reopen_session(uuid) from public, anon;
grant execute on function public.reopen_session(uuid) to authenticated;

-- ============ Stile (Standard pro Lehrkraft, abweichend pro Umfrage) ============
-- Die Farbpaletten selbst stehen in src/themes.js.
alter table public.profiles add column theme text check (theme is null or theme ~ '^[a-z]{2,20}$');
alter table public.polls add column theme text check (theme is null or theme ~ '^[a-z]{2,20}$');

create or replace function public.set_my_theme(p_theme text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.profiles set theme = nullif(p_theme, '') where id = auth.uid();
$$;
revoke all on function public.set_my_theme(text) from public, anon;
grant execute on function public.set_my_theme(text) to authenticated;
-- get_live_state liefert zusätzlich 'theme' = coalesce(polls.theme, profiles.theme der Lehrkraft)
-- (vollständige Fassung: Migration "pollbox_themes")

-- ============ Schulstandard-Stil (Admin) ============
-- app_settings 'default_theme' = {"theme": "<key>"}; Reihenfolge: Umfrage → Lehrkraft → Schulstandard → klassik
create or replace function public.school_theme() returns text
language sql stable security definer set search_path = '' as $$
  select s.value->>'theme' from public.app_settings s where s.key = 'default_theme';
$$;
revoke all on function public.school_theme() from public;
grant execute on function public.school_theme() to anon, authenticated;
-- get_live_state: 'theme' = coalesce(polls.theme, profiles.theme, school_theme()) (Migration "pollbox_school_theme")

-- ============ Fragetyp "4-Felder" (matrix) ============
-- options = Items, settings = { xLabel, yLabel, colors: [Hex je Item] }
-- Antwort: { values: [ [x, y] | null je Item ] } mit ganzen Zahlen 1–10; null = übersprungen; mindestens ein Item bewertet
alter table public.questions drop constraint questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('multiple_choice','ranking','scale','open','pin','matrix'));
-- submit_response: zusätzlicher Zweig für 'matrix' (vollständige Fassung: Migration "pollbox_matrix_question")

-- ============ Fragetyp "Q&A" (qa) ============
-- settings = { voting: bool (Standard true), moderate: bool (Standard false) }; keine Einträge in responses
-- Migration "qa_fragetyp"
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('multiple_choice','ranking','scale','open','pin','matrix','qa'));

create table public.qa_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid not null,
  text text not null check (length(text) between 1 and 300),
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.qa_questions(session_id, question_id);

create table public.qa_votes (
  qa_question_id uuid not null references public.qa_questions(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (qa_question_id, participant_id)
);
create index on public.qa_votes(session_id);

alter table public.qa_questions enable row level security;
alter table public.qa_votes enable row level security;

-- Lehrer sehen, moderieren und löschen die Fragen ihrer Durchläufe; Schüler nur über die Funktionen unten
create policy "qa questions owner read" on public.qa_questions for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));
create policy "qa questions owner update" on public.qa_questions for update to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));
create policy "qa questions owner delete" on public.qa_questions for delete to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));
create policy "qa votes owner read" on public.qa_votes for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = (select auth.uid())));

-- aktive Q&A-Frage zum Code (oder Fehler)
create or replace function public.qa_active(p_code text, p_question_id uuid, out s public.sessions, out q public.questions)
language plpgsql stable security definer set search_path = '' as $$
begin
  select * into s from public.sessions where code = p_code and status = 'live' limit 1;
  if not found then raise exception 'Die Umfrage ist nicht (mehr) aktiv'; end if;
  select * into q from public.questions where poll_id = s.poll_id order by position, id offset s.current_index limit 1;
  if q.id is null or q.id <> p_question_id or q.type <> 'qa' then raise exception 'Diese Frage ist nicht mehr aktiv'; end if;
end $$;
revoke execute on function public.qa_active(text, uuid) from public, anon, authenticated;

create or replace function public.submit_qa_question(p_code text, p_question_id uuid, p_participant uuid, p_text text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare a record; txt text;
begin
  select * into a from public.qa_active(p_code, p_question_id);
  txt := btrim(coalesce(p_text, ''));
  if length(txt) < 1 or length(txt) > 300 then raise exception 'Bitte 1–300 Zeichen eingeben'; end if;
  if (select count(*) from public.qa_questions where session_id = (a.s).id and question_id = (a.q).id and participant_id = p_participant) >= 10 then
    raise exception 'Sie haben schon 10 Fragen gestellt';
  end if;
  insert into public.qa_questions (session_id, question_id, participant_id, text, approved)
  values ((a.s).id, (a.q).id, p_participant, txt, not coalesce(((a.q).settings->>'moderate')::boolean, false));
  return true;
end $$;

create or replace function public.toggle_qa_vote(p_code text, p_question_id uuid, p_participant uuid, p_qa uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.qa_active(p_code, p_question_id);
  if not coalesce(((a.q).settings->>'voting')::boolean, true) then raise exception 'Bewerten ist ausgeschaltet'; end if;
  if not exists (select 1 from public.qa_questions where id = p_qa and question_id = (a.q).id and session_id = (a.s).id and approved) then
    raise exception 'Frage nicht gefunden';
  end if;
  delete from public.qa_votes where qa_question_id = p_qa and participant_id = p_participant;
  if found then return false; end if;
  insert into public.qa_votes (qa_question_id, session_id, participant_id) values (p_qa, (a.s).id, p_participant);
  return true;
end $$;

-- Für Schüler: freigegebene Fragen (nur wenn Bewerten an) plus die eigenen, meiste Daumen zuerst
create or replace function public.get_qa_questions(p_code text, p_question_id uuid, p_participant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a record; voting boolean;
begin
  select * into a from public.qa_active(p_code, p_question_id);
  voting := coalesce(((a.q).settings->>'voting')::boolean, true);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'text', x.text, 'approved', x.approved, 'mine', x.participant_id = p_participant,
      'votes', x.votes, 'voted', x.voted) order by x.votes desc, x.created_at)
    from (
      select qq.id, qq.text, qq.approved, qq.participant_id, qq.created_at,
        (select count(*) from public.qa_votes v where v.qa_question_id = qq.id)::int as votes,
        exists (select 1 from public.qa_votes v where v.qa_question_id = qq.id and v.participant_id = p_participant) as voted
      from public.qa_questions qq
      where qq.session_id = (a.s).id and qq.question_id = (a.q).id
        and ((voting and qq.approved) or qq.participant_id = p_participant)
    ) x
  ), '[]'::jsonb);
end $$;

grant execute on function public.submit_qa_question(text, uuid, uuid, text) to anon, authenticated;
grant execute on function public.toggle_qa_vote(text, uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.get_qa_questions(text, uuid, uuid) to anon, authenticated;

alter publication supabase_realtime add table public.qa_questions;
alter publication supabase_realtime add table public.qa_votes;
