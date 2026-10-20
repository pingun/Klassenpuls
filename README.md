# Klassenpuls – Live-Abstimmungen für den Unterricht

Version 0.8

Liveabstimmung: Lehrkräfte erstellen wiederverwendbare Umfragen,
Schüler machen per QR-Code ohne Konto mit, die Ergebnisse erscheinen live am Beamer.

**Fragetypen:** Multiple Choice (Einzel/Mehrfach) · Ranking · Skala (Aussagen bewerten) · Offene Frage (Pinnwand oder Wortwolke) · Bild anheften (Pins auf ein hochgeladenes Bild)
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

## Stile

Es gibt 8 Stile (Schul-Klassik, Nordisch, Waldgrün, Graphit dunkel, Akademie-Blau, Terrakotta,
Pflaume und Salbei, Hoher Kontrast). Admins legen unter **Verwaltung** den **Schulstandard** fest.
Jeder Lehrer kann unter **Einstellungen** einen eigenen Standardstil wählen; im Editor kann jede Umfrage
einen eigenen Stil bekommen. Reihenfolge: Stil der Umfrage → Stil des Lehrers → Schulstandard → Schul-Klassik.
Lehrerseiten nutzen den Stil des Lehrers, Beamer und Schülerhandys den Stil der Umfrage, Startseite und Login den Schulstandard.
Die Paletten stehen zentral in `src/themes.js`.

## PowerPoint-Add-in

Fragen und Live-Ergebnisse direkt auf PowerPoint-Folien (PowerPoint für Windows / Microsoft 365 und
PowerPoint im Browser). Eine Folie = eine Frage; beim Folienwechsel in der Bildschirmpräsentation schaltet
die Abstimmung automatisch mit. Beim ersten Klassenpuls-Folie startet automatisch ein Durchlauf.

- Manifest: `public/powerpoint/klassenpuls-manifest.xml` (Download auch unter *Einstellungen* in der App).
  In PowerPoint: *Einfügen → Add-ins → Meine Add-ins → Mein Add-in hochladen*.
- Code: `office.html` und `src/office/`. Ohne PowerPoint lässt sich die Oberfläche im Browser testen:
  `office.html` (Bearbeiten-Ansicht) bzw. `office.html?view=read&slide=…` (simulierte Präsentation).
- Das Manifest enthält die feste Adresse `https://pingun.github.io/Klassenpuls/`. Zieht die App um,
  müssen die Adressen im Manifest angepasst und das Add-in neu hochgeladen werden.
- Anmeldung im Add-in per E-Mail und Passwort (Microsoft-Anmeldung dort noch nicht).

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

## Bedienung am Beamer

→ / Leertaste / PageDown = nächste Frage · ← / PageUp = zurück (funktioniert mit Presenter-Fernbedienungen)
R = Ergebnisse ein/aus · Q = QR-Code groß · F = Vollbild

Jeder Start einer Umfrage ist ein eigener **Durchlauf** (z. B. „8b“, „9a“) mit eigenem Code –
die Ergebnisse bleiben getrennt und sind unter „Durchläufe & Ergebnisse“ jederzeit abrufbar.
