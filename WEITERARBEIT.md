# RLP RP – einfache Anleitung: Was ist fertig und was fehlt?

**Stand: 8. November 2026**

Diese Anleitung ist für Menschen ohne Programmiererfahrung. Fachbegriffe werden möglichst einfach erklärt. Sie enthält außerdem einen Abschnitt für eine zukünftige KI, die am Projekt weiterarbeitet.

## Das Wichtigste in einer Minute

Deine Website besteht aus drei Teilen:

1. **Die sichtbare Website** ist das, was Besucher im Browser sehen.
2. **Der Webserver** erledigt Dinge im Hintergrund, zum Beispiel Anmeldung, Tickets und Admin-Funktionen.
3. **Die Datenbank** merkt sich Konten und Tickets.

Was schon eingerichtet und getestet ist:

- Die Datenbank liegt bei **Neon**.
- Der Webserver kann mit dieser Neon-Datenbank sprechen.
- Die wichtigsten Abläufe wurden getestet: Konto erstellen, nach einem Server-Neustart wieder anmelden und ein Ticket erstellen, ansehen und schließen.
- GitHub Pages zeigt eine **Vorschau des Designs**.
- Vercel bietet einen Hobby-Tarif für persönliche, nicht kommerzielle Projekte. Er hat Nutzungslimits; bei Überschreitung pausieren Funktionen, statt automatisch einen kostenpflichtigen Tarif zu starten.

Was noch fehlt:

- Die Änderungen dieser Anleitung müssen zu GitHub hochgeladen werden.
- Das GitHub-Repository muss im persönlichen Vercel-Hobby-Konto verbunden werden.
- Bei Vercel müssen die privaten Neon- und Admin-Zugangsdaten eingetragen und der Dienst gestartet werden.
- Die Hobby-Nutzung ist nur für persönliche, nicht kommerzielle Projekte erlaubt. Falls das für RLP RP nicht zutrifft, Vercel Hobby nicht verwenden.

**Kurz gesagt:** Die Datenbank ist bereit, aber die voll funktionsfähige Website ist noch nicht öffentlich online.

## Ein einfacher Vergleich

Stell dir die Website wie ein Restaurant vor:

- Die Website ist der Gastraum, den Besucher sehen.
- Der Webserver ist die Küche, die Anmeldungen und Tickets bearbeitet.
- Neon ist das Lager, in dem Konten und Tickets gespeichert werden.
- GitHub ist der Ort, an dem der Bauplan und der Programmcode aufbewahrt werden.
- Ein Webhost ist das Gebäude, in dem die Küche rund um die Uhr arbeitet.

Der Gastraum (GitHub Pages) und das Lager (Neon) sind vorhanden. Das Gebäude für die Küche (der Webhost für den Webserver) muss noch eingerichtet werden.

## Was ist mit „kostenlos online“?

Einige Anbieter haben kostenlose oder günstige Tarife. Diese können aber Grenzen haben: Die Website kann nach einer Weile einschlafen, langsam starten oder ein monatliches Nutzungs-Limit erreichen. Anbieter können ihre Tarife ändern. Deshalb kann ich nicht versprechen, dass der Betrieb dauerhaft kostenlos ist.

Für den ersten Versuch brauchst du **keine eigene Domain**. Eine Domain ist eine eigene Internetadresse wie `meine-seite.de`. Zuerst reicht die kostenlose Internetadresse, die dir der Webhost gibt. Eine eigene Domain kannst du später hinzufügen.

## Was du noch machen musst – Schritt für Schritt

Du musst nicht alles auf einmal erledigen. Der wichtigste nächste Schritt ist, einen Webhost einzurichten.

### Schritt 1: Änderungen zu GitHub hochladen

Die aktualisierten Anleitungen liegen derzeit nur auf dem Computer. Vercel kann das Projekt erst einrichten, wenn die Änderungen in GitHub gespeichert und hochgeladen wurden.

Wenn du **GitHub Desktop** verwendest:

1. Öffne GitHub Desktop und wähle das Projekt `notrufHamburgTulix`.
2. Schau dir unter **Changes** die Liste der geänderten Dateien an.
3. Füge die Änderungen in `README.md` und `WEITERARBEIT.md` hinzu und achte darauf, dass `render.yaml` entfernt wird. **Füge `.vscode/` nicht hinzu** – dieser Ordner war schon vorher vorhanden und gehört nicht zu dieser Änderung.
4. Achte darauf, dass keine Dateien namens `.env.local`, `.env`, `.neon` oder eine Datenbankdatei ausgewählt sind. Diese enthalten private Einstellungen oder Daten.
5. Schreibe unten links als Kurzbeschreibung zum Beispiel `Kostenloses Hosting erklären`.
6. Klicke **Commit to main** und danach **Push origin**.

Wenn du bei der Dateiliste unsicher bist, brich hier ab und bitte eine Person oder KI, die Änderungen mit dir gemeinsam zu prüfen. Niemals private Dateien hochladen. Der aktuelle Stand und die Dateien stehen weiter unten im Abschnitt „Hinweise für die nächste KI“.

### Schritt 2: Vercel-Hobby-Konto prüfen

Vercel Hobby kostet laut aktueller Preisseite 0 US-Dollar pro Monat und eignet sich nur für persönliche, **nicht kommerzielle** Projekte. Es gibt monatliche Nutzungslimits. Wenn sie erreicht sind, kann die Website bis zur nächsten Freigabe der Nutzungslimits pausieren. Verwende nur ein persönliches Hobby-Konto. Wähle keinen Pro-Tarif, aktiviere keine kostenpflichtigen Zusatzdienste und trage keine Zahlungsmethode ein, wenn du garantiert nichts bezahlen möchtest. Die Bedingungen und Preise können sich ändern; prüfe sie vor dem Start.

**Neon ist kein Webhost.** Neon speichert die Daten, Vercel führt den Express-Webserver aus. Wenn das Projekt Einnahmen erzielt oder als kommerziell eingestuft wird, darf der Hobby-Tarif laut Vercel nicht dafür verwendet werden.

### Schritt 3: Vercel mit GitHub verbinden

1. Öffne [vercel.com](https://vercel.com/) und melde dich mit deinem GitHub-Konto an.
2. Wähle den kostenlosen **Hobby**-Tarif für dein persönliches Konto, nicht Pro oder Team.
3. Wähle das Repository `tulixpro/notrufHamburgTulix` und den Branch `main`.
4. Vercel erkennt Express und Node.js automatisch. Lass den Projektordner auf dem Repository-Stamm und den Build-Befehl auf `npm run build`.
5. Trage vor dem ersten Deployment die privaten Umgebungsvariablen ein.

### Schritt 4: Die privaten Einstellungen bei Vercel eintragen

Vercel hat im Projekt einen Bereich namens **Settings → Environment Variables**. Dort kann man geheime Einstellungen sicher speichern. Das ist wie ein privater Schlüsselbund.

Füge dort die folgenden Namen ein. Die **Werte** bekommst du aus Neon oder erstellst du selbst. Teile sie nicht mit anderen und schreibe sie nicht in GitHub-Dateien.

| Name | Was du als Wert eintragen musst |
|---|---|
| `NODE_ENV` | Genau `production` |
| `DATABASE_URL` | Die **gepoolte** Verbindungsadresse aus Neon. Sie enthält normalerweise `-pooler` im Servernamen. |
| `DATABASE_URL_UNPOOLED` | Die **direkte** Verbindungsadresse aus Neon. Sie enthält normalerweise kein `-pooler`. |
| `JWT_SECRET` | Ein neues, zufälliges Geheimnis mit mindestens 32 Zeichen. Nicht das Beispiel aus einer Anleitung verwenden. |
| `ADMIN_USERNAME` | Der Benutzername, mit dem du dich als erster Superadmin anmelden möchtest. |
| `ADMIN_PASSWORD` | Ein starkes, nur hierfür verwendetes Passwort mit mindestens 12 Zeichen. Am besten in einem Passwortmanager speichern. |

So findest du die beiden Neon-Adressen:

1. Öffne Neon und gehe in das bereits eingerichtete Projekt `shy-sun-03230640`.
2. Wähle den Branch `production`.
3. Öffne **Connect** oder die Verbindungsdetails.
4. Kopiere die Verbindungsadresse mit Verbindungspool nach `DATABASE_URL`.
5. Wähle die direkte Verbindung ohne Pool und kopiere sie nach `DATABASE_URL_UNPOOLED`.
6. Achte darauf, dass du beide Adressen bei Vercel als geheime Werte einträgst. Nicht in GitHub-Dateien einfügen.

Die Neon-Adressen sind wie Schlüssel für die Datenbank. Wer sie besitzt, kann möglicherweise auf gespeicherte Daten zugreifen. Niemals als Screenshot oder Chatnachricht verschicken.

Weitere Werte brauchst du nur, wenn du die jeweilige Funktion möchtest:

| Name | Nur nötig, wenn … |
|---|---|
| `ADMIN_EMAIL` | du echte E-Mail-Benachrichtigungen an dein Admin-Konto erhalten willst |
| `SMTP_URL` und `MAIL_FROM` | du E-Mails wie Sicherheitsmeldungen oder Passwort-Reset versenden willst |
| `PUBLIC_URL` | du den Passwort-Reset mit E-Mail verwendest; das ist die öffentliche HTTPS-Adresse deiner fertigen Website |
| `ROBLOX_PLACE_ID` | du möchtest, dass die Seite direkt auf dein Roblox-Spiel verlinkt |
| `ROBLOX_UNIVERSE_ID` | du den Roblox-Serverstatus und die Spielerzahl anzeigen willst |
| `PORT` | normalerweise nicht selbst setzen; der Webhost gibt diesen Wert vor |
| `TRUST_PROXY` | nur setzen, wenn der Webhost ausdrücklich sagt, dass es nötig ist |

Bei der Registrierung wird aktuell keine E-Mail-Adresse abgefragt. Ein Passwort-Reset per E-Mail funktioniert deshalb nur für ein Konto, dem eine echte E-Mail-Adresse zugeordnet ist. E-Mail-Versand funktioniert außerdem erst, wenn ein Mailanbieter (`SMTP_URL` und `MAIL_FROM`) eingerichtet wurde.

### Schritt 5: Website starten

1. Speichere die Einstellungen bei Vercel.
2. Klicke auf **Deploy**.
3. Warte, bis der Anbieter meldet, dass der Start erfolgreich war.
4. Öffne die Internetadresse, die Vercel anzeigt. Sie sollte mit `https://` anfangen.
5. Hänge `/api/status` an die Adresse an und öffne sie im Browser. Du solltest eine Status-Antwort sehen.
6. Öffne wieder die normale Adresse. Melde dich mit `ADMIN_USERNAME` und `ADMIN_PASSWORD` an und kontrolliere das Admin-Dashboard.

Beim ersten Start wird das Admin-Konto in Neon angelegt, falls noch keines vorhanden ist. Wenn du das Passwort später bei Vercel änderst, ändert sich das bestehende Konto **nicht automatisch**. Bewahre das ursprüngliche Passwort sicher auf und ändere es nach der Anmeldung über die Website.

### Schritt 6: Funktionen ausprobieren

Teste nach dem Start:

1. Erstelle ein normales Testkonto und melde dich wieder ab und an.
2. Verifiziere ein Roblox-Testkonto: Im Portal einen Prüfcode erstellen, ihn in die öffentliche Roblox-Profilbeschreibung setzen und im Portal bestätigen. Danach den Prüfcode wieder aus der Beschreibung entfernen.
3. Erstelle ein Ticket, öffne den Verlauf, schreibe eine Antwort und schließe das Ticket.
4. Wenn möglich, erstelle ein zweites normales Konto und kontrolliere, dass es das erste Ticket nicht sehen kann.
5. Teste den Wartungsmodus nur kurz und schalte ihn danach wieder aus. Während der Wartung können normale Nutzer die Seite nicht verwenden.
6. Prüfe auf der GitHub-Pages-Adresse: Sie bleibt die Design-Vorschau. Für Konten und Tickets verwendest du die Vercel-Adresse.

## Eigene Internetadresse – später, wenn gewünscht

Eine eigene Domain ist für den ersten Betrieb nicht notwendig. Wenn du später eine kaufst:

1. Füge die Domain zuerst bei Vercel hinzu.
2. Vercel zeigt dir an, welche DNS-Einträge du beim Domainanbieter eintragen musst. DNS-Einträge sind Einstellungen, die den Domainnamen zu Vercel leiten.
3. Warte, bis Vercel meldet, dass die sichere HTTPS-Verbindung aktiv ist.
4. Trage dann bei Vercel `PUBLIC_URL` mit deiner vollständigen HTTPS-Adresse ein.

Eine eigene Domain ist nicht notwendig. GitHub Pages und der Vercel-Dienst sind zwei getrennte Dinge.

## Was schon getestet wurde

- `npm run build`: erfolgreich. Das prüft, ob die JavaScript-Dateien syntaktisch in Ordnung sind.
- `npm test`: erfolgreich mit einer vorübergehenden lokalen SQLite-Datenbank.
- Neon-Test: erfolgreich mit der echten Neon-Datenbank. Geprüft wurden Konto-Erstellung, Anmeldung nach einem Neustart, News, Status und Tickets. Das Testkonto und die zugehörigen Testdaten werden danach entfernt.
- GitHub-Actions baut und testet den Code und veröffentlicht die statische Design-Vorschau.

Der Neon-Test wird auf dem Entwicklungscomputer in PowerShell so gestartet:

```powershell
$env:RLP_TEST_POSTGRES = "1"
npm test
Remove-Item Env:RLP_TEST_POSTGRES
```

Diese Prüfung ist für die Person gedacht, die am Code arbeitet. Sie ist nicht nötig, um die Website im Browser zu besuchen. Sie verwendet die lokalen Neon-Verbindungen in `.env.local`. Diese Datei nicht öffnen und ihren Inhalt nicht teilen.

## Dinge, die nicht automatisch passieren

- Lokale Konten und Tickets werden nicht automatisch nach Neon kopiert. Für die bisherigen SQLite-Daten wurde keine Übertragung gemacht.
- Die Website-Sicherheitsmeldungen überwachen nur die Website. Es gibt keinen Roblox-Spiel-Bot und kein echtes Roblox-Anti-Cheat.
- Die Dienstnummern POL/FW/RD sind fiktive Nummern für das Rollenspiel.
- Vercel muss noch mit GitHub verbunden und mit den privaten Umgebungsvariablen gestartet werden.
- Eine eigene Domain, E-Mail und echte Roblox-Spielstatus-Anzeige sind optional und brauchen zusätzliche Einstellungen.

## Schutz deiner Daten

Die privaten Verbindungsadressen, Passwörter und Sicherheitsschlüssel gehören **nicht** in GitHub, diese Anleitung, README-Dateien, Screenshots oder Chats.

- `.env.local`, `.env`, `.neon` und `data/` werden in diesem Projekt von Git ignoriert.
- `.env.example` ist nur eine leere Vorlage und darf keine echten Zugangsdaten enthalten.
- Wenn du aus Versehen ein echtes Passwort oder eine Datenbankadresse veröffentlichst, ändere/widerrufe sie sofort beim jeweiligen Anbieter. Nur die Datei wieder zu löschen reicht nicht.
- Neon und die lokale SQLite-Datei sind zwei getrennte Speicherorte. Lösche oder überschreibe die Datenbank nicht, wenn du nicht genau weißt, was darin liegt.

## Hinweise für die nächste KI

### Projektstand und Dateien

- Repository: `tulixpro/notrufHamburgTulix`, Branch `main`.
- Neon-Projekt: `shy-sun-03230640`, vorhandener Branch `production`.
- `server.js`: Express-Server und API.
- `database.js`: Auswahl zwischen SQLite lokal und PostgreSQL auf Neon.
- `schema.js`: Tabellenerstellung für beide Datenbanken.
- `scripts/auth-smoke.test.js`: Test für Registrierung, dauerhafte Speicherung und Login; mit `RLP_TEST_POSTGRES=1` zusätzlich Neon-E2E inklusive Ticketablauf.
- `scripts/database.test.js`: Tests für die Übersetzung von SQLite-SQL nach PostgreSQL.
- `.github/workflows/test.yml`: CI-Build, Tests und statische Pages-Vorschau.
- `WEITERARBEIT.md`: diese Einsteiger- und Übergabeanleitung.

### Sichere Arbeitsweise

1. Lies zuerst diese Datei und `README.md`.
2. Prüfe `git status`, bevor du etwas bearbeitest. `.vscode/` ist ein bereits vorhandener, fremder/untracked Ordner: nicht verändern oder löschen.
3. Lies niemals `.env.local` oder andere geheime Umgebungsdateien aus und gib keine Zugangsdaten aus.
4. Lösche, setze oder migriere keine Datenbank und führe keine produktiven Änderungen aus, ohne vorher die Zustimmung des Nutzers und ein Backup.
5. Bei Datenbankänderungen SQLite und PostgreSQL in `schema.js` gemeinsam aktuell halten.
6. Nach Codeänderungen `npm run build` und `npm test` ausführen; bei Datenbankänderungen zusätzlich den Neon-E2E-Test.
7. Der Nutzer möchte die vollständigen Funktionen ohne Kosten. Vercel Hobby ist eine mögliche Option für persönliche, nicht kommerzielle Nutzung mit Nutzungslimits. Keinen kostenpflichtigen Tarif starten und keine Geheimwerte veröffentlichen.
8. Klar sagen: Der Vercel-Dienst muss vom Nutzer mit GitHub verbunden und mit Geheimwerten eingerichtet werden.

### Befehle zum Prüfen

```powershell
npm run build
npm test
```

Neon-E2E-Test, sofern die lokale Neon-Konfiguration vorhanden ist:

```powershell
$env:RLP_TEST_POSTGRES = "1"
npm test
Remove-Item Env:RLP_TEST_POSTGRES
```

Das Projekt erwartet Node.js 22. Lokal ohne `DATABASE_URL` wird SQLite benutzt. Auf Vercel müssen mindestens `NODE_ENV`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DATABASE_URL` und `DATABASE_URL_UNPOOLED` sicher eingetragen werden.

### Kopierbarer Auftrag für eine spätere KI

> Bitte lies zuerst `WEITERARBEIT.md` und `README.md`; erkläre alles in einfachen Worten. Das Repository ist `tulixpro/notrufHamburgTulix`. Neon ist im bestehenden Projekt und Branch `production` eingerichtet und der Neon-E2E-Test war erfolgreich. GitHub Pages ist die kostenlose Design-Vorschau. Für das vollständige Portal kann Vercel Hobby verwendet werden, wenn das Projekt persönliche, nicht kommerzielle Nutzung ist; Nutzungslimits können zu einer Pause führen. Prüfe zuerst `git status`. Verändere oder lösche `.vscode/` nicht. Lies niemals geheime `.env`-Dateien aus und veröffentliche keine Zugangsdaten. Lösche oder migriere keine Datenbank und starte keinen kostenpflichtigen Dienst ohne Zustimmung. Bei Codeänderungen führe `npm run build` und `npm test` aus; bei Datenbankänderungen zusätzlich den Neon-E2E-Test. Sag klar, welche Schritte ich selbst bei GitHub, Neon oder Vercel erledigen muss.
