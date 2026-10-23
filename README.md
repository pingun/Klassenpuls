# Klassenpuls – Live-Abstimmungen für den Unterricht

Version 0.8

Liveabstimmung: Lehrkräfte erstellen wiederverwendbare Umfragen,
Schüler machen per QR-Code ohne Konto mit, die Ergebnisse erscheinen live am Beamer.

**Fragetypen:** Multiple Choice (Einzel/Mehrfach) · Ranking · Skala (Aussagen bewerten) · Offene Frage (Pinnwand oder Wortwolke) · Bild anheften (Pins auf ein hochgeladenes Bild) · 4-Felder (Items auf zwei Achsen 1–10 einordnen) · Q&A (Teilnehmer stellen Fragen, bewerten sie mit Daumen hoch; optional mit Freigabe durch den Lehrer)
**Vorlagen:** „Erwartungen der Schüler managen“ (6 Fragen) und „Feedback zur Stunde“

# Verwendete Infrastruktur
a. DBMS: Diese Web-App verwendet Supabase als Datenbank-Backend.
b. Authentifizierung:
- Es muss ein SMTP-Server angegeben werden.
- Anmeldung mit Microsoft
c. Keine serverseitige Scriptsprache nötig
  
## zu 1. Einmalige Einstellungen im Supabase-Dashboard

1. **Authentication → URL Configuration:** „Site URL“ und „Redirect URLs“ auf die Adresse der App setzen.
2. **E-Mail-Bestätigung:** Entweder unter **Authentication → Emails → SMTP Settings** einen
   Schul-Mailserver eintragen (empfohlen) oder unter **Authentication → Sign In / Providers → Email**
   „Confirm email“ abschalten. Die Domain-Sperre greift in beiden Fällen.
3. Optional: **Leaked password protection** aktivieren.

## zu 2. Anmeldung mit Microsoft (optional)

Der Button „Mit Microsoft anmelden“ erscheint automatisch, sobald der Anbieter in Supabase aktiviert ist.
Die Domain-Freigabe gilt auch hier: Neue Konten entstehen nur für freigegebene Domains oder für
Lehrer, die ein Admin von Hand angelegt hat.

1. **Microsoft Entra ID** (portal.azure.com → Microsoft Entra ID → App-Registrierungen → Neue Registrierung)
   - Name: `Klassenpuls`
   - Unterstützte Kontotypen: **Nur Konten in diesem Organisationsverzeichnis** (nur die eigene Schule)
   - Umleitungs-URI (Web): `https://<projekt>.supabase.co/auth/v1/callback`
2. In der App-Registrierung:
   - **Zertifikate & Geheimnisse** → neuer geheimer Clientschlüssel → den *Wert* kopieren
   - **Tokenkonfiguration** → optionaler Anspruch (ID-Token) `email` und `xms_edov` hinzufügen
     (damit Supabase die E-Mail als bestätigt erkennt und bestehende Konten verknüpft)
   - Auf der Übersichtsseite die **Anwendungs-ID (Client)** und die **Verzeichnis-ID (Mandant)** notieren
3. **Supabase** → Authentication → Sign In / Providers → **Azure** aktivieren
   - Client ID = Anwendungs-ID, Secret = Wert des geheimen Schlüssels
   - Azure Tenant URL = `https://login.microsoftonline.com/<Verzeichnis-ID>`
4. **Supabase** → Authentication → URL Configuration: die Adresse der App bei „Redirect URLs“ eintragen.

Wer sich per Microsoft anmeldet, muss kein vorläufiges Passwort mehr ändern.

## Gastmodus: Abstimmungen ohne Konto (optional)

Ist der Gastmodus an, zeigt die Startseite den Button **„Abstimmung erstellen“**: Jeder kann mit einem Klick
eine Abstimmung anlegen und live starten – ohne Registrierung, mit allen Fragetypen.

- **Ablauf:** Ohne Speichern wird eine Gast-Abstimmung samt Ergebnissen nach **24 Stunden** gelöscht.
  „Für 3 Tage speichern“ vergibt einen **8-stelligen Code**; damit lässt sie sich auf jedem Gerät öffnen
  (auf der Startseite eingeben: 6 Ziffern = mitmachen, 8 Ziffern = gespeicherte Abstimmung öffnen).
  3 Tage nach dem Speichern wird alles gelöscht. Gibt ein angemeldeter Lehrer den Code ein, übernimmt er die
  Abstimmung dauerhaft in sein Konto. Aufgeräumt wird alle 15 Minuten (pg_cron-Job `klassenpuls-gaeste-aufraeumen`).
- **Schutz vor Missbrauch:** unsichtbares Captcha (Cloudflare Turnstile), höchstens 5 Abstimmungen je Gast,
  30 Fragen je Abstimmung, je IP-Adresse höchstens 30 neue Abstimmungen, 60 Starts und 20 Code-Eingaben pro Stunde
  (IP-Adressen werden nur als Hash gespeichert und nach einem Tag gelöscht). Gäste sehen keine geteilten Umfragen,
  keine Lehrerdaten und können keine eigenen Bilder hochladen (nur die Bildbibliothek).
- Datenbank: `supabase/gastmodus.sql`.

**Einschalten:**
1. Supabase → *Authentication → Sign In / Providers* → **Allow anonymous sign-ins** einschalten.
2. Supabase → *Authentication → Attack Protection* → **Enable Captcha protection** → Anbieter *Turnstile*,
   den **Secret Key** aus Cloudflare eintragen. Erst einschalten, wenn die App-Version mit Captcha live ist –
   Supabase verlangt das Captcha dann auch bei der Lehrer-Anmeldung.
3. Optional: *Authentication → Rate Limits* → „Anonymous users“ (Standard 30 pro Stunde und IP) anpassen –
   an Schulen teilen sich oft viele Geräte eine IP-Adresse.
4. GitHub → *Settings → Secrets and variables → Actions → Variables*: `VITE_TURNSTILE_SITE_KEY` = Site Key aus
   Cloudflare (lokal in `.env`). Ohne diese Variable läuft die App ohne Captcha.
5. In Klassenpuls unter **Verwaltung → Gastmodus** „Abstimmungen ohne Konto erlauben“ anhaken.

## Stile

Es gibt 8 Stile (Schul-Klassik, Nordisch, Waldgrün, Graphit dunkel, Akademie-Blau, Terrakotta,
Pflaume und Salbei, Hoher Kontrast). Admins legen unter **Verwaltung** den **Schulstandard** fest.
Jeder Lehrer kann unter **Einstellungen** einen eigenen Standardstil wählen; im Editor kann jede Umfrage
einen eigenen Stil bekommen. Reihenfolge: Stil der Umfrage → Stil des Lehrers → Schulstandard → Schul-Klassik.
Lehrerseiten nutzen den Stil des Lehrers, Beamer und Schülerhandys den Stil der Umfrage, Startseite und Login den Schulstandard.
Die Paletten stehen zentral in `src/themes.js`.

## Rollen & Lehrer verwalten

- Die **erste** registrierte Person wird automatisch Admin.
- Admins legen unter **Verwaltung** Lehrer von Hand an (Name + E-Mail, beliebige Domain).
  Danach werden die Zugangsdaten mit einem vorläufigen Passwort angezeigt – mit Buttons zum
  Kopieren, für eine E-Mail und für Microsoft Teams. Beim ersten Login muss der Lehrer ein
  eigenes Passwort festlegen. „Passwort neu“ erzeugt jederzeit ein neues vorläufiges Passwort.
- Zusätzlich können Admins E-Mail-Domains für die Selbstregistrierung freigeben und weitere Admins ernennen.
- Unter **Bildbibliothek** pflegen Admins Bilder für den Fragetyp „Bild anheften“: mehrere Bilder auf
  einmal hochladen, benennen, einer Kategorie zuordnen und mit Tags versehen. Lehrer wählen daraus im
  Editor (mit Suche, Kategorie-Filter und großer Vorschau) oder laden ein eigenes Bild hoch.
  Pro Frage lassen sich ein **Ausschnitt** (Zoom + Verschieben) und die **Bildbreite auf dem Schülerhandy** einstellen.
- Das Anlegen läuft über die Supabase Edge Function `manage-teachers` (Quellcode in `supabase/functions/`).
  Sie prüft serverseitig, ob der Aufrufer Admin ist.
- Schüler brauchen kein Konto (anonyme Geräte-ID, eine Antwort pro Frage, änderbar).
- Einen freiwilligen Namen können Schüler nur bei Fragen angeben, in deren Auswertung er auftaucht: Offene Frage als Pinnwand (am Beamer) und Bild anheften (beim Darüberfahren über einen Pin). Bei allen anderen Fragen wird kein Name gespeichert.

## Bedienung am Beamer

→ / Leertaste / PageDown = nächste Frage · ← / PageUp = zurück (funktioniert mit Presenter-Fernbedienungen)
R = Ergebnisse ein/aus · Q = QR-Code groß · F = Vollbild

Bei **Q&A** zeigt der Beamer eine offene Frage nach der anderen (meiste Daumen zuerst). ↑ / ↓ blättern durch die Fragen, die **Eingabetaste** markiert die gezeigte Frage als beantwortet, die **Entf-Taste** löscht sie (beides rückgängig über „↶ Rückgängig“). Eine gelöschte Frage verschwindet sofort bei allen Schülern; wer sie gestellt hat, kann in dieser Runde keine weiteren Fragen stellen. Die Schüler sehen alle Fragen untereinander und können bei jeder einen Daumen hoch setzen; beantwortete stehen ausgegraut am Ende. Ist „Eingereichte Fragen moderieren“ an, erscheinen neue Fragen erst nach Freigabe über „⏳ zur Freigabe“ in der Fußleiste.

Jeder Start einer Umfrage ist ein eigener **Durchlauf** (z. B. „8b“, „9a“) mit eigenem Code –
die Ergebnisse bleiben getrennt und sind unter „Durchläufe & Ergebnisse“ jederzeit abrufbar.
