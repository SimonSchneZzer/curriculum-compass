# MMA Study Planner

An unofficial, tailored view of the curriculum of the **MultiMediaArt master programme** at FH Salzburg.
Pick your specialisation (Audio, Communication Design, Film, Producing) and see what you take each
semester, the SWS and ECTS totals, and the content and learning outcomes of every course.

**Live:** https://simonschnezzer.github.io/mma-study-planner/

## Data

All curriculum data lives in [`data/curriculum.json`](data/curriculum.json). The field `dataAsOf` shows when it was
taken from the public curriculum page; the site displays this date at the top.

Each course has a `category`:

| category | meaning |
|---|---|
| `compulsory` | taken by all students |
| `thesis` | master thesis, taken by all students |
| `specialisation` | only for the specialisation in `specialisation` |
| `elective` | free elective open to everyone, choose one per semester |

Notes on the data:
- Two typos in course titles from the source were fixed ("Presentationion", "Environnements"). Course codes are kept as published.
- The source legend does not explain the course type `EX`.
- The published curriculum has no Producing version of the Master Project, so Producing totals are below 30 ECTS per semester.

To update the data, edit the JSON and set `dataAsOf` to the date of the new copy.

## Run locally

The page loads the JSON with `fetch`, so it needs a local web server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

No build step, no dependencies: plain HTML, CSS and JavaScript, published with GitHub Pages from `main`.
