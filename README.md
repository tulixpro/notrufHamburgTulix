# RLP RP – Roblox Roleplay Portal

Responsives Community- und Supportportal für das deutsche Roblox-Rollenspiel RLP RP. Das Projekt verwendet HTML, CSS und JavaScript im Frontend sowie Node.js und Express. Lokal ohne `DATABASE_URL` wird SQLite verwendet; mit Neon-Umgebungsvariablen läuft das Backend auf PostgreSQL.

Für den aktuellen Projektstand, die vollständige Schritt-für-Schritt-Anleitung zum Onlinebetrieb und eine Übergabe an zukünftige Bearbeiter siehe [WEITERARBEIT.md](./WEITERARBEIT.md).

## Voraussetzungen

- Node.js 22.x
- npm

## Installation

```powershell
npm install
npm start
```

Öffne anschließend [http://localhost:3000](http://localhost:3000). Ohne `DATABASE_URL` wird die SQLite-Datenbank beim ersten Start automatisch unter `data/rlp-rp.sqlite` angelegt. Mit `DATABASE_URL` verbindet sich die App mit PostgreSQL und erstellt bzw. aktualisiert ihr Schema beim Start. Beispiel-News werden bei einer leeren Datenbank automatisch hinzugefügt.

**Wichtig unter Windows:** Das Projekt benötigt Node.js 22.x, weil die SQLite-Abhängigkeit ein natives Modul verwendet. Prüfe die Version mit `node --version`. Falls Node 26 installiert ist, kannst du zum Starten einmalig Node 22 über npm verwenden:

```powershell
npm exec --yes --package=node@22 -- npm start
```

Benutzerkonten bleiben in der jeweils ausgewählten Datenbank gespeichert. Die bestehende lokale SQLite-Datei wird beim Wechsel zu Neon nicht automatisch kopiert oder gelöscht. Sichere und migriere vorhandene Daten separat, bevor du Neon als produktive Datenbank verwendest. Verbindungs-URLs und lokale Datenbankdateien werden nicht in Git hochgeladen.

### Neon verwenden

Die Neon-Verbindung ist lokal in `.env.local` hinterlegt und wird beim Serverstart automatisch geladen. Die Anwendung verwendet die gepoolte `DATABASE_URL`; Schemaänderungen nutzen `DATABASE_URL_UNPOOLED` (direkte Verbindung). Beide Variablen werden von der Neon-Konfiguration bereitgestellt und dürfen nicht veröffentlicht oder eingecheckt werden. Auf einem Hosting-Anbieter müssen sie als geheime Umgebungsvariablen eingetragen werden.

Das Portal erstellt die Tabellen und den initialen Wartungsstatus automatisch. Für den ersten Produktivstart müssen außerdem `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_USERNAME` und `ADMIN_PASSWORD` als Umgebungsvariablen gesetzt sein. `ADMIN_EMAIL` ist optional. Ein bestehender lokaler SQLite-Administrator wird nicht nach Neon übertragen.

Für einen End-to-End-Test gegen Neon kannst du in PowerShell `$env:RLP_TEST_POSTGRES = "1"; npm test` ausführen. Dafür werden die URLs aus `.env.local` verwendet. Der Test legt ein zufällig benanntes Testkonto an und löscht es sowie seine Tickets und Aktionslogs danach wieder. Ohne diese Variable verwendet `npm test` eine isolierte temporäre SQLite-Datenbank und benötigt keine Neon-Zugangsdaten.

`npm run build` prüft die Syntax der Server-, Datenbank-, Schema- und Frontend-JavaScriptdateien. Das Projekt benötigt keinen separaten Bundler.

### Lokal ausprobieren

1. Starte die Website mit `npm start` und öffne `http://localhost:3000`.
2. Registriere ein Testkonto über **Anmelden → Konto erstellen**. Bei der Registrierung wirst du direkt zur Roblox-Verifizierung weitergeleitet.
3. Gib deinen Roblox-Benutzernamen ein und erstelle einen Prüfcode.
4. Öffne dein öffentliches Roblox-Profil, füge den Code vorübergehend in die Profilbeschreibung („About“) ein und speichere die Änderungen.
5. Kehre zum Portal zurück und wähle **Profil prüfen**. Bei Erfolg ist dein Roblox-Konto verbunden; Tickets sind ab dann freigeschaltet.

Die Roblox-Anmeldung erfolgt ausschließlich über den Profilnachweis. Das Portal fragt weder das Roblox-Passwort noch Roblox-Cookies ab. Beim Testen ein eigenes Testkonto verwenden. Für neu registrierte Nutzer gilt eine Passwortlänge von mindestens 12 Zeichen. Die Registrierung und Anmeldung erfolgen mit Benutzername und Passwort; neue Konten benötigen keine E-Mail-Adresse. Ohne hinterlegte E-Mail kann ein vergessenes Passwort nicht automatisch zurückgesetzt werden.

### Entwicklungs-Administrator

Im lokalen Entwicklungsmodus mit SQLite wird beim ersten Start ein Superadmin angelegt:

- E-Mail: `admin@rlp-rp.local`
- Passwort: `RLP-RP-Demo-2026!`

Ändere das Passwort nach der ersten Anmeldung. Das Demo-Konto wird weder in Produktion noch in einer Neon-Datenbank angelegt. Für Neon muss ein Superadmin ausdrücklich über `ADMIN_USERNAME` und `ADMIN_PASSWORD` (mindestens 12 Zeichen) eingerichtet werden.
Nach dem Login findest du **Admin** in der oberen Navigation oder im Profilmenü. Dort kannst du Benutzer, Rollen, Tickets, News, Aktivitäten und Systemeinstellungen verwalten. Direkt unter den Dashboard-Statistiken befindet sich der **Wartungsmodus**-Schalter; nur Superadmins sehen und verwenden ihn. Die Aktivierung sperrt normale Nutzer aus, beendet aber nicht den Serverprozess. Vor dem Umschalten erscheint eine Bestätigung, und Änderungen werden protokolliert.
In der Benutzerverwaltung kannst du Konten suchen und die komplette Liste einschließlich Roblox- und Dienstnummern-Daten als CSV exportieren. Der Export ist nur angemeldeten Admins zugänglich; Tabellenkalkulations-Formeln in exportierten Feldern werden entschärft. **Aktualisieren** lädt Dashboard und Spielstatus neu.

#### Eigenes Konto zum Admin machen

1. Erstelle zuerst ein normales Konto mit deinem Benutzernamen und Passwort.
2. Melde dich anschließend mit dem lokalen SQLite-Superadmin (`admin@rlp-rp.local`) an und öffne **Admin → Benutzerverwaltung**. Für Neon müssen stattdessen eigene Admin-Zugangsdaten als Umgebungsvariablen gesetzt sein.
3. Suche dein Konto und stelle in der Spalte **Rolle** `ADMIN` ein.
4. Melde dich ab und wieder mit deinem eigenen Konto an. Der Admin-Link erscheint nun in der Navigation.

Nur ein Superadmin kann Rollen vergeben. Für einen frischen Produktivbetrieb werden `ADMIN_USERNAME` und `ADMIN_PASSWORD` beim ersten Start verwendet, um das Superadmin-Konto anzulegen. `ADMIN_EMAIL` ist optional. Diese geheimen Zugangsdaten nicht veröffentlichen; vorhandene Datenbanken behalten ihre bestehenden Konten.

Im lokalen Entwicklungsmodus (`NODE_ENV` ist nicht `production`) erscheint im Admin-Dashboard außerdem ein Diagnose-Terminal. Erlaubte Befehle: `help`, `status`, `user`, `page`, `health`, `easteregg` und `clear`. Es führt absichtlich keinen frei eingegebenen JavaScript-Code aus und wird in Produktion ausgeblendet.

Das Diagnose-Terminal kann mit `health` anzeigen, ob SMTP konfiguriert ist. Ohne SMTP werden Sicherheitsmeldungen im Admin-Dashboard gespeichert, aber nicht per E-Mail verschickt.

#### Easter Egg

Gib auf der Website außerhalb von Eingabefeldern die Tastenkombination **↑ ↑ ↓ ↓ ← → ← → B A** ein, um den Hamburg-Nachtmodus freizuschalten. Im lokalen Admin-Diagnose-Terminal funktioniert dafür auch `easteregg`.

### Roblox-Konto verifizieren

1. Melde dich im Portal an und öffne **Mein Profil**.
2. Gib deinen Roblox-Benutzernamen ein und erstelle einen Prüfcode.
3. Öffne dein öffentliches Roblox-Profil. Bearbeite die Profilbeschreibung („About“), füge den Code ein und speichere.
4. Kehre zum Portal zurück und klicke **Profil prüfen**. Bei Erfolg ist das Konto verknüpft; entferne den Code anschließend wieder aus deiner Beschreibung.

Der Prüfcode läuft nach 15 Minuten ab. Ohne Verifizierung bleiben Support-Tickets gesperrt. Roblox-Passwörter oder Cookies werden nie abgefragt.

### Passwort und E-Mail

Neue Konten verwenden Benutzername und Passwort; eine E-Mail-Adresse ist optional und wird bei der Registrierung nicht abgefragt. Bestehende Konten können sich weiterhin mit ihrer bisherigen E-Mail-Adresse anmelden. Ohne E-Mail-Adresse gibt es keinen automatischen Passwort-Reset; bewahre dein Passwort sicher auf. E-Mail-Benachrichtigungen an Admins und Abteilungsentscheidungen benötigen `SMTP_URL` und `MAIL_FROM`. Lokal ohne SMTP erscheinen Reset-Links für ältere E-Mail-Konten im Server-Terminal; Sicherheitsmeldungen bleiben im Admin-Dashboard sichtbar.

Für echten E-Mail-Versand müssen gültige SMTP-Zugangsdaten vom E-Mail-Anbieter als Umgebungsvariablen gesetzt werden. Zugangsdaten nicht in den Quellcode oder ins Git-Repository schreiben. Beispiel (Werte durch die Angaben deines Anbieters ersetzen):

```powershell
$env:SMTP_URL = "smtps://BENUTZER:URL_CODIERTES_PASSWORT@smtp.example.de:465"
$env:MAIL_FROM = "RLP RP <portal@example.de>"
$env:PUBLIC_URL = "https://portal.example.de"
```

Warte nach dem Start auf „SMTP-Verbindung erfolgreich geprüft“ im Server-Terminal. Im Admin-Dashboard wird bei fehlender oder fehlerhafter Verbindung ausdrücklich angezeigt, dass keine E-Mails zugestellt werden können.

Das Passwort änderst du angemeldet über **Mein Profil → Passwort sicher ändern**. Es muss mindestens 14 Zeichen lang sein; nach der Änderung werden aktive Sitzungen abgemeldet. Verwende ein eigenes, nicht wiederverwendetes Passwort. Das bekannte lokale Demo-Passwort ist ausschließlich für Tests bestimmt und muss ersetzt werden.

### Als App installieren

Die Website ist eine Progressive Web App (PWA). Sie wird sicher aus dem Browser installiert; es gibt absichtlich keine herunterladbare EXE- oder APK-Datei.

- **Android:** Öffne die Website in Chrome und wähle **Als App installieren**. Falls der Browser keinen Installationsdialog anbietet: Menü **⋮ → App installieren** oder **Zum Startbildschirm hinzufügen**.
- **Windows 10/11:** Öffne sie in Edge (**⋯ → Apps → Diese Website als App installieren**) oder Chrome (**⋮ → Streamen, speichern und teilen → Seite als App installieren**).
- Eine Installation ist über HTTPS oder lokal über `localhost` möglich. Der App-Shell-Cache bietet die Oberfläche offline; Konto, Tickets und andere API-Funktionen brauchen weiterhin eine Internetverbindung.

## Konfiguration für den Betrieb

Setze mindestens ein eigenes JWT-Geheimnis und eigene Admin-Zugangsdaten. Beispiel für PowerShell:

```powershell
$env:NODE_ENV = "production"
$env:JWT_SECRET = "hier-ein-eigenes-zufaelliges-geheimnis-mit-mindestens-32-zeichen-eintragen"
$env:ADMIN_USERNAME = "RLPAdmin"
$env:ADMIN_PASSWORD = "ein-sicheres-einmaliges-passwort"
$env:ADMIN_EMAIL = "admin@deine-domain.de"
$env:PORT = "3000"
npm start
```

Wichtige Umgebungsvariablen:

| Variable | Verwendung |
| --- | --- |
| `JWT_SECRET` | Signaturschlüssel; in Produktion mindestens 32 Zeichen, geheim halten |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME` | Erstmaliger Superadmin, falls noch kein Admin existiert |
| `DATABASE_URL` | Gepoolte PostgreSQL-Verbindung für App-Abfragen |
| `DATABASE_URL_UNPOOLED` | Direkte PostgreSQL-Verbindung für Schemainitialisierung |
| `SMTP_URL` | SMTP-Verbindungs-URL für Passwort-Reset-, Sicherheits- und Dienst-E-Mails |
| `MAIL_FROM` | Verifizierte Absenderadresse für E-Mails (in Produktion erforderlich, wenn SMTP genutzt wird) |
| `PUBLIC_URL` | Öffentliche HTTPS-Basisadresse (z. B. `https://portal.de`) für Reset-Links in Produktion |
| `ROBLOX_PLACE_ID` | Place-ID des RLP-RP-Spiels; erstellt den direkten Spiel-Link |
| `ROBLOX_UNIVERSE_ID` | Universe-ID für die Live-Abfrage von Spielstatus und Spielerzahlen |
| `PORT` | HTTP-Port (Standard: `3000`) |
| `TRUST_PROXY=true` | Nur setzen, wenn die App hinter genau einem vertrauenswürdigen Reverse Proxy läuft |

### Kostenloses Online-Hosting

Der GitHub-Actions-Workflow führt bei Pushes auf `main` den Konto-/Datenbanktest aus und veröffentlicht danach die Dateien aus `public` als **statische Design-Vorschau** auf [GitHub Pages](https://tulixpro.github.io/notrufHamburgTulix/). Die Vorschau zeigt deutlich an, dass Anmeldung, Registrierung, Tickets und Admin-Funktionen dort deaktiviert sind. Wenn GitHub Pages noch die Repository-Dateien direkt veröffentlicht, leitet die `index.html` im Repository-Stamm zum Design unter `public/` weiter.

Für den vollständigen Betrieb ist in `render.yaml` ein kostenloser Node.js-Webdienst bei Render vorbereitet. Nach dem Hochladen dieser Datei zu GitHub kannst du bei Render **New → Blueprint** wählen und das Repository `tulixpro/notrufHamburgTulix` verbinden. Der Blueprint verwendet Node.js 22, baut mit `npm ci && npm run build`, startet mit `npm start` und prüft `/api/status`. Render kann kostenlose Dienste bei Inaktivität pausieren; Tarif, Verfügbarkeit und mögliche Limits vor dem Erstellen auf der Render-Seite prüfen.

Die Zugangsdaten werden beim Einrichten sicher bei Render eingetragen, niemals in Git-Dateien: `DATABASE_URL` (gepoolte Neon-Adresse), `DATABASE_URL_UNPOOLED` (direkte Neon-Adresse), `ADMIN_USERNAME` und `ADMIN_PASSWORD`. Render erzeugt `JWT_SECRET` automatisch. Die Startseite und die Funktionen für Anmeldung und Tickets laufen nach erfolgreichem Deployment über dieselbe Render-Adresse. Die lokale SQLite-Datei wird nicht übertragen; vorhandene Konten in Neon bleiben erhalten. Ein erstmaliger Superadmin wird beim Start angelegt, falls in der Datenbank noch keiner vorhanden ist.

GitHub Pages führt den Express-Server nicht aus. Neon stellt die Datenbank bereit, aber nicht automatisch einen öffentlich erreichbaren Express-Host.

Für den Passwort-Reset muss im Produktivbetrieb ein SMTP-Server konfiguriert sein, zum Beispiel über `SMTP_URL`. Ohne SMTP werden Reset-Links nur im Entwicklungsmodus im Server-Terminal ausgegeben. Der Link läuft nach 30 Minuten ab. Die Web-App sollte in Produktion ausschließlich über HTTPS erreichbar sein.

## Funktionen

- Öffentliche Startseite mit Serverstatus, Community-Informationen, Team- und News-Bereich
- Registrierung, Anmeldung, Profilbearbeitung und Passwort-Reset
- Roblox-Kontoverifizierung durch einen kurzlebigen Prüfcode im öffentlichen Profil; dieselbe Roblox-ID kann nicht mit mehreren Portal-Konten verknüpft werden
- Bewerbungen für Polizei, Feuerwehr und Rettungsdienst mit eindeutiger fiktiver RP-Dienstnummer und Admin-Freigabe
- Ticket-Erstellung, Verlauf, Antworten und Schließen mit privater Sichtbarkeit pro Nutzer
- Admin-Dashboard mit Statistiken, Benutzer-/Rollenverwaltung, Ticketverwaltung, News und Aktionsprotokoll
- Sicherheitsüberwachung bei fünf fehlgeschlagenen Logins in zehn Minuten, blockierten Admin-Zugriffen, auffälligen Anfrageraten, ungültigen CSRF-Anfragen und Admin-Login aus neuem Netzwerk; Meldungen sind im Admin-Dashboard bestätigbar
- Superadmin-Einstellungen für Discord-Einladung, Roblox Place-/Universe-ID und einen öffentlichen Startseiten-Hinweis
- Superadmin-Notfallsteuerung für den Wartungsmodus; normale Nutzer erhalten eine Wartungsseite
- Sicherheitsmeldungen bei gehäuften fehlgeschlagenen Logins, neuen Admin-Netzwerkzugriffen, Admin-Passwortänderungen und Rollenvergabe; Admins können Meldungen im Dashboard bestätigen
- Öffentlicher Installationsknopf und installierbare PWA für Android und Windows 10/11 mit Offline-App-Shell
- Deutsche FAQ, Serverinformationen und Regelwerk-Hinweis

## Sicherheit und Betrieb

- Passwörter werden mit bcrypt (12 Runden) gehasht; Sitzungstoken sind signierte JWTs in HttpOnly-, SameSite-Cookies.
- Zustandsändernde API-Aufrufe erfordern einen CSRF-Token. Authentifizierungs- und API-Schreibzugriffe sind rate-limitiert.
- Wiederholte auffällige Zugriffe werden mit einer HMAC-gehashten Netzwerkkennung dedupliziert. Sicherheitsmeldungen enthalten weder Klartext-IP noch E-Mail-Adresse; E-Mail-Alarme funktionieren nur mit konfiguriertem SMTP.
- Datenbankabfragen verwenden vorbereitete Statements. Eingaben werden serverseitig validiert und dynamische Inhalte im Frontend als Text ausgegeben.
- Helmet setzt unter anderem Content-Security-Policy- und weitere Sicherheitsheader.
- Die Notfallfunktion aktiviert einen Wartungsmodus, statt den Node-Prozess abrupt zu beenden; Admins behalten Zugriff. Aktivierung und Aufhebung werden protokolliert.
- Sichere Deployment-Praxis: HTTPS terminieren, starke individuelle Zugangsdaten nutzen, `JWT_SECRET` und SMTP-Zugangsdaten nicht einchecken und `data/` regelmäßig sichern.
- Hinterlege `ROBLOX_PLACE_ID` und `ROBLOX_UNIVERSE_ID` oder setze die IDs im Admin-Dashboard. Die Place-ID erstellt den direkten Spiel-Link, die Universe-ID aktiviert die Live-Abfrage von Spielstatus und Spielerzahlen. Die Discord-Einladung kann ebenfalls im Superadmin-Dashboard angepasst werden.
- Dienstnummern sind ausschließlich fiktive Kennungen für das Roblox-Rollenspiel. Die Sicherheitsüberwachung dieses Portals schützt nur die Website und ist kein Roblox-Spiel-Anti-Cheat. Spielschutz muss in den serverseitigen Scripts des eigenen Roblox-Erlebnisses umgesetzt werden (z. B. serverseitige Prüfung von RemoteEvents und Spielaktionen). Ein als Spieler beitretender Bot ist dafür nicht zuverlässig und sollte keine Roblox-Zugangsdaten verwenden; automatische Bans sollten nicht allein auf einem einzelnen verdächtigen Messwert beruhen.

## Projektstruktur

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── data/                 # wird beim Start erzeugt, nicht einchecken
├── server.js
├── database.js
├── schema.js
├── package.json
└── README.md
```
