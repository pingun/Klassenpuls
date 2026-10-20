# Klassenpuls – Live-Abstimmungen für den Unterricht

Version 0.7

Private Mentimeter-Alternative: Lehrer erstellen wiederverwendbare Umfragen,
Schüler machen per QR-Code ohne Konto mit, die Ergebnisse erscheinen live am Beamer.

**Fragetypen:** Multiple Choice (Einzel/Mehrfach) · Ranking · Skala (Aussagen bewerten) · Offene Frage (Pinnwand oder Wortwolke) · Bild anheften (Pins auf ein hochgeladenes Bild)
**Vorlagen:** „Erwartungen der Schüler managen“ (6 Fragen) und „Feedback zur Stunde“

## Starten (lokal / im Schul-WLAN)

Zuerst `.env.example` nach `.env` kopieren und die Supabase-Zugangsdaten eintragen.

```bash
npm install
npm run dev
```

Die Beamer-Ansicht dann über die **Netzwerk-Adresse** öffnen (z. B. `http://192.168.x.y:5173`),
nicht über `localhost` – sonst zeigt der QR-Code auf `localhost` und die Handys finden die Seite nicht.

## Dauerhaft veröffentlichen

```bash
npm run build
```

Den Ordner `dist/` auf einen beliebigen statischen Webspace legen (Netlify, Vercel, GitHub Pages,
Schul-Webserver …). In `.env` `VITE_PUBLIC_URL` auf die öffentliche Adresse setzen und neu bauen.

## Einmalige Einstellungen im Supabase-Dashboard

1. **Authentication → URL Configuration:** „Site URL“ und „Redirect URLs“ auf die Adresse der App setzen.
2. **E-Mail-Bestätigung:** Supabase verschickt ohne eigenen Mailserver nur Mails an Mitglieder
   des Supabase-Teams. Entweder unter **Authentication → Emails → SMTP Settings** einen
   Schul-Mailserver eintragen (empfohlen) oder unter **Authentication → Sign In / Providers → Email**
   „Confirm email“ abschalten. Die Domain-Sperre greift in beiden Fällen.
3. Optional: **Leaked password protection** aktivieren.

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
