# Curriculum Compass

An unofficial, tailored view of the curricula of FH Salzburg (Salzburg University of Applied Sciences).
Pick a programme in the navigation, choose your major or specialisation, pick your electives, and see what you take
each semester, the SWS and ECTS totals, and the content and learning outcomes of every course.

Curriculum Compass is not a service of FH Salzburg. If anything differs from the official study regulations, the
regulations apply.

**Live:** https://simonschnezzer.github.io/curriculum-compass/

## What it covers

39 degree programmes in all six departments: Applied Social Sciences, Business and Tourism, Creative Technologies,
Design and Green Engineering, Health Sciences, Information Technologies and Digitalisation.
Not included (no course list published): the academic courses Child and Youth Care and Mental Health Nursing, and the
new Information Technologies bachelor. The app lists them under "Not included yet".

Links can point to a programme and selection, e.g. `#/mma-m/film` or `#/cis-b/game/ai`.

## Saved in the browser

- **Local storage** (`curriculum-compass`): last programme, majors per programme, picked electives, expanded courses,
  scroll position. Nothing leaves the browser.
- **Offline cache** (service worker, `sw.js`): the app and all curricula, so it opens without internet. The data
  (about 3.6 MB) is too big for local storage, so it lives in the browser's Cache Storage instead.

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

### Updating the data

```sh
python3 scripts/update_data.py              # all departments
python3 scripts/update_data.py --only bt    # one department
```

This downloads the curriculum pages, rewrites `data/*.json` with today's date and prints the ECTS per semester for
every track combination. Lines marked `<-- check` do not add up to 30 per semester; check them against the brochure.
Each department module documents its rules; `scripts/curricula/core.py` holds the parser and data model.

## Hosting

Plain static files (HTML, CSS, JavaScript, JSON), no build step, no server code, and only relative paths. Any static
web host works, at the domain root or in a sub-folder: copy the repository files (without `scripts/`) and serve them.
The offline cache needs HTTPS (or `localhost`). Currently published with GitHub Pages from `main`.

Run locally:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.
