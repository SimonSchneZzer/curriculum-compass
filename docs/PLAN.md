# Plan for later

Ideas we agreed on but postponed. Newest decisions first.

## 1. Notice when the FH Salzburg data changes — done (2026-11-17)

`scripts/check_data.py`, weekly on the home server with an ntfy message; see "Weekly data check" in the README.
The first run found two programmes we did not list (Speech and Language Therapy, Biomedical Technologies and
Analytics); both have no course list yet and are now under "Not included yet".

## 9. "What's new" for users

**Goal:** after a data update, users see what changed in *their* programme.

- **Depends on 1:** the update keeps a small change log per programme, e.g. `data/changes.json` with date,
  programme id and the changed course codes / ECTS.
- The app remembers in local storage which data version the user last saw.
- If a newer version touches their programme, it shows a short, dismissible hint ("2 courses changed in
  semester 3"). Changed rows get a brief highlight.

## 13. Own domain and hosting — done (2026-11-17)

Live at https://simon.schnetzer.at/compass/, the GitHub Pages address redirects there. How it is deployed: see
"Hosting" in the README. Visits are counted with the host's GoatCounter; a weekly summary goes to the maintainer via
ntfy. The data check (1) can run on the same server (no cron there: use a systemd user timer like
`visitor-summary.timer`, and ntfy for the notification).
