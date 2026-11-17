# Plan for later

Ideas we agreed on but postponed. Newest decisions first.

## 1. Notice when the FH Salzburg data changes

**Goal:** the data never goes stale without anyone noticing.

- Run `python3 scripts/update_data.py` regularly (e.g. once a week) against a temporary copy of `data/`.
- Compare the result with the published data, ignoring `dataAsOf`.
- Also check:
  - the brochure versions (the special cases rely on them, e.g. Producing in MultiMediaArt Master),
  - whether programmes were added to or removed from the department pages.
- **Nothing changed:** record a "last checked" date, so the app can show "data as of … · checked …".
- **Something changed:** do not publish automatically. Notify the maintainer with a short summary
  (e.g. "MultiMediaArt Bachelor: 2 courses added, semester 4 now 30 ECTS") and let them review and publish.
- If a page can no longer be parsed (FH changed its layout), the check fails and that is reported too.

**Where it can run:** a scheduled job on our own server (cron + e-mail or a chat message), or a GitHub Action
that opens a pull request or issue. Full automation is nice to have; a notification that someone acts on is enough.

## 9. "What's new" for users

**Goal:** after a data update, users see what changed in *their* programme.

- **Depends on 1:** the update keeps a small change log per programme, e.g. `data/changes.json` with date,
  programme id and the changed course codes / ECTS.
- The app remembers in local storage which data version the user last saw.
- If a newer version touches their programme, it shows a short, dismissible hint ("2 courses changed in
  semester 3"). Changed rows get a brief highlight.

## 13. Own domain and hosting

**Goal:** move from GitHub Pages to our own server/domain when it makes sense.

- The app is plain static files with relative paths only: copy the repository without `scripts/` and serve it.
  It works at the domain root or in a sub-folder.
- The offline mode needs HTTPS.
- Update `CONFIG.reportUrl` in `app.js` if issues should go somewhere other than GitHub.
- Old links keep working as long as the `#/…` paths stay the same; consider a redirect from the GitHub Pages
  address.
- Combine with 1: the server that hosts the app can also run the weekly data check.
