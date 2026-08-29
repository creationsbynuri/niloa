# Niloa Team Workspace — Supabase Version

Kurzfristige Lösung bis zum Wechsel auf Microsoft 365. Login läuft über
Name + optionale 4-stellige PIN, keine E-Mail nötig. Läuft live für alle
6 Teammitglieder gleichzeitig (Realtime-Sync über Supabase).

## Schritt 1 — Supabase-Projekt anlegen

1. Auf https://supabase.com registrieren (kostenlos) und ein neues Projekt anlegen
2. Im Projekt: **SQL Editor** öffnen → neues Query
3. Den kompletten Inhalt von `supabase-schema.sql` einfügen → **Run**
4. Unter **Project Settings → API** findet ihr:
   - **Project URL** (z. B. `https://xxxxx.supabase.co`)
   - **anon public key** (langer Text)

## Schritt 2 — App konfigurieren

1. Datei `app_script.js` öffnen
2. Ganz oben:
   ```js
   const SUPABASE_URL = "DEINE_SUPABASE_URL_HIER";
   const SUPABASE_ANON_KEY = "DEIN_SUPABASE_ANON_KEY_HIER";
   ```
   durch eure echten Werte aus Schritt 1 ersetzen
3. Speichern

## Schritt 3 — Lokal testen (optional)

Einfach `index.html` doppelklicken / im Browser öffnen. Funktioniert auch
ohne Server, da alles direkt mit Supabase spricht.

## Schritt 4 — Auf Vercel deployen

**Variante A — ohne GitHub (schnellster Weg):**
1. Auf https://vercel.com registrieren/einloggen
2. "Add New" → "Project" → "Deploy" → einfach den ganzen Ordner
   (`index.html` + `app_script.js`) per Drag & Drop hochladen
3. Vercel erkennt es automatisch als statische Seite, kein Build nötig
4. Ihr bekommt eine Live-URL (z. B. `niloa-workspace.vercel.app`)

**Variante B — mit GitHub (empfohlen für spätere Updates):**
1. Diesen Ordner in ein neues GitHub-Repo pushen
2. In Vercel: "Add New" → "Project" → GitHub-Repo auswählen → Deploy
3. Jede zukünftige Änderung, die ihr auf GitHub pusht, aktualisiert die
   Live-Seite automatisch

## Erste Nutzung

1. Live-URL öffnen
2. Beim ersten Mal: "Neues Teammitglied hinzufügen" für jede der 6 Personen
   einmal ausführen (Name + optionale PIN)
3. Danach kann sich jeder über die Namensliste einloggen

## Wichtige Einschränkungen (bitte lesen)

- **Keine echte Zugriffssicherheit.** Der `anon key` ist im Browser-Code
  sichtbar (normal bei Supabase, aber wichtig zu wissen). Die PIN schützt
  nur gegen versehentliche Verwechslung im Team, nicht vor jemandem, der
  gezielt reinschauen will. Keine sensiblen Daten wie Zahlungsinformationen
  hier eintragen.
- **Dokumente sind nur Links**, keine echten Datei-Uploads — Dateien bleiben
  in Google Drive / OneDrive / eurem künftigen SharePoint, hier wird nur der
  Link + Kategorie verwaltet.
- **Gedacht als Übergangslösung** bis zum Umstieg auf Microsoft 365 /
  SharePoint. Für dauerhaften Einsatz mit echten Nutzerkonten und
  Berechtigungen ist die Microsoft-Lösung der bessere Weg.

## Support

Bei Fragen zur Weiterentwicklung: einfach diesen Ordner in Claude Code
öffnen und weitere Anpassungen (Branding, neue Felder, etc.) anfragen.
