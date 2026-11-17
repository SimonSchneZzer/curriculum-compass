# Curriculum Compass

An unofficial, tailored view of the curricula of FH Salzburg (Salzburg University of Applied Sciences).
Pick a programme in the navigation, choose your major or specialisation, pick your electives, and see what you take
each semester, the SWS and ECTS totals, and the content and learning outcomes of every course.

Curriculum Compass is not a service of FH Salzburg. If anything differs from the official study regulations, the
regulations apply.

**Live:** https://simon.schnetzer.at/compass/ (the old GitHub Pages address redirects there)

## What it covers

39 degree programmes in all six departments: Applied Social Sciences, Business and Tourism, Creative Technologies,
Design and Green Engineering, Health Sciences, Information Technologies and Digitalisation.
Not included (no course list published): the academic courses Child and Youth Care and Mental Health Nursing, the
new Information Technologies and Speech and Language Therapy bachelors, and the joint master Biomedical Technologies
and Analytics. The app lists them under "Not included yet".

Links can point to a programme and selection, e.g. `#/mma-m/film` or `#/cis-b/game/ai`. The share button next to
the programme title adds the picked electives (`?picks=…`). `#/` is the start page ("What do you study?").

The search finds programmes (also by short names such as MMA, CIS, HCI or FH codes like CDE) and courses of all
programmes; it uses `data/search.json`. A course found this way is opened in its programme and briefly highlighted.

## Languages

All interface texts live in `l10n/en.json` and `l10n/de.json`; the app picks the browser language and falls back
to English. To add a language, copy `en.json`, translate it and add its code to `CONFIG.languages` in `app.js`.
Course titles and descriptions stay in the language of the FH Salzburg source.

## Interface notes

- **Choices** (electives, master project, specialisation picks): every choice is one entry under "Your choices" in its
  semester. Folded it shows the picks (or what is left to pick) and the ECTS; open it to pick. A choice with one pick
  folds itself after picking. Option names drop the choice's name in front ("Master Project - Development - FILM" →
  "Development - FILM").
- **Tooltips** only say what is not already visible nearby (no semester number, programme subtitle or option name).
  On touch screens they open as a card at the bottom that can be swiped down; action buttons (share) and programme
  links in the sidebar show none there.

## Saved in the browser

- **Local storage** (`curriculum-compass`): last programme, majors per programme, picked electives, expanded courses,
  scroll position. Nothing leaves the browser.
- **Offline cache** (service worker, `sw.js`): the app and the curricula you open, so it works without internet.
  On a known unmetered connection all curricula are cached in advance (about 3.6 MB, too big for local storage).
- "Report it" in the footer opens a prefilled issue (`CONFIG.reportUrl` in `app.js`).
- **Visit counter** (`CONFIG.counter`, default `/c/`): counts views like `/compass/mma-m/film` with the host's
  GoatCounter (no cookies, never the picks). Set it to `""` to turn counting off; on a host without it nothing happens.
- **Imprint & privacy** link at the end of the sidebar (`CONFIG.legalUrl`, default `/legal`, `""` hides it).

## Data

`data/index.json` lists departments, programmes and the shared legend. Every programme has its own file, e.g.
[`data/mma-m.json`](data/mma-m.json). `dataAsOf` shows when the data was taken from the FH Salzburg curriculum pages;
the app shows this date at the top.

- `tracks`: choices that hold for the whole programme (major, specialisation). A course with
  `"track": {"major": "film"}` only applies to that option; `{"major": ["a", "b"]}` belongs to several.
- `groups`: choices per semester. `choose` = how many options; an option can bundle several courses.
  `budget` = pick courses worth this many ECTS instead. `linkedTrack` = your own track is one of the picks.
  `onlyFor` = only for one track. `sync` = groups in several semesters that share one choice.
  A group without options is a slot the curriculum page does not list (free electives, courses at a partner
  university); `compulsory: true` marks such a slot as compulsory.
- `notes`: special cases and known problems in the source data, each with its source.
- `kind` of a course: `compulsory`, `elective`, `thesis` or `internship`. `sourceCode` is set when the page gave two
  different courses the same code and we had to make it unique.

Special cases are documented in the department modules in `scripts/curricula/departments/` and checked against the
programme brochures (PDFs on each programme page). Known problem in the source: the MultiMediaArt Bachelor page lists
wrong ECTS in semester 4 (shown in the app with a note).

### Weekly data check

`python3 scripts/check_data.py --state <file>` runs the update on a temporary copy and reports what changed, without
touching `data/`: changed courses per programme, programmes added to or removed from the department pages, and
changed brochures (PDF fingerprints, kept in the state file). Exit code 0 = unchanged, 1 = changed, 2 = the check
failed (e.g. a page can no longer be parsed).

On the home server it runs every Monday at 07:00 (`~/compass/check-data.sh`, systemd user timer
`compass-data-check.timer`) and sends the result to the maintainer via ntfy. Nothing is published automatically.
If nothing changed it writes `data/checked.json` (`{"checkedAt": "…"}`) next to the app, and the app shows
"checked …" after the data date. Without that file (any other host) the app simply shows the data date.

When the check reports changes: run `python3 scripts/update_data.py` locally, look at the diff and the ECTS totals,
commit, push, then `ssh homeserver '~/compass/deploy.sh'`.

### Updating the data

```sh
python3 scripts/update_data.py              # all departments
python3 scripts/update_data.py --only bt    # one department
```

This downloads the curriculum pages, rewrites `data/*.json` with today's date and prints the ECTS per semester for
every track combination. Lines marked `<-- check` do not add up to 30 per semester; check them against the brochure.
Each department module documents its rules; `scripts/curricula/core.py` holds the parser and data model.

## Plan for later

See [docs/PLAN.md](docs/PLAN.md): automatic data check, "what's new" for users, own domain and hosting.

## Hosting

Plain static files (HTML, CSS, JavaScript, JSON), no build step, no server code, and only relative paths. Any static
web host works, at the domain root or in a sub-folder: copy the repository files (without `scripts/`) and serve them.
The offline cache needs HTTPS (or `localhost`); the service worker only handles requests inside its own folder.

**Published at simon.schnetzer.at/compass/** (home server, `ssh homeserver`):

- `~/curriculum-compass` is a clone of this repo; `~/compass/deploy.sh` pulls `main` and copies only the app files
  (no `scripts/`, `docs/`) to `~/compass/site`, which the `compass-web` container (nginx, `~/compass/docker-compose.yml`)
  serves. After pushing to `main`: `ssh homeserver ~/compass/deploy.sh`.
- The shared Caddy (`~/ai-server/Caddyfile`, block `simon.schnetzer.at`) forwards `/compass/*` to that container.
  The portfolio on the same domain is untouched.
- GitHub Pages now publishes the `gh-pages` branch: only a redirect that keeps the `#/…` path, plus a service worker
  that removes the old offline copy. Saved picks from the old address stay there (local storage is per domain).

Run locally:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.
