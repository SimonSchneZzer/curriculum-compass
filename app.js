"use strict";

/* Curriculum Compass — plain JS, no build step. All URLs are relative, so it runs on any static host.
   Design "Atlas": the page shows names and short facts; everything else lives in tooltips.
   All interface texts are in l10n/<language>.json; course data stays in the language of its source. */

const CONFIG = {
  // Where "Report it" leads. Change this when the app moves to another host or issue tracker.
  reportUrl: "https://github.com/SimonSchneZzer/curriculum-compass/issues/new",
  languages: ["en", "de"],
  // Privacy-friendly visit counter (GoatCounter, no cookies). Path on the same host where count.js and /count are
  // served; "" turns counting off. On a host without it the script simply fails to load.
  counter: "/c/",
  // Imprint and privacy notice of the host, linked at the end of the sidebar; "" hides the link.
  legalUrl: "/legal",
  // "Report a problem / Suggest an idea": the form sends straight to Web3Forms (mail to Simon). The access key can only
  // send to the stored address, the address itself is nowhere in the app. Same key as in Vorleser. key "" hides it.
  feedback: { key: "b8bf57d6-9254-472a-8d37-72aac7141ccd", endpoint: "https://api.web3forms.com/submit" },
};

const STORE_KEY = "curriculum-compass";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = window.matchMedia("(hover: hover)").matches;

let L10N = {};      // texts of the current language
let lang = "en";
let index;          // data/index.json
let prog;           // the programme shown, null on the start page
let sel = {};       // chosen track options, e.g. { major: "film", minor: "ai" }
let picks = {};     // picked elective options: { groupId or sync: [optionId, …] }
let searchIndex = null;
const cache = {};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

/* ---------- Localisation ---------- */

// t("sem.title", { n: 2 }) fills {placeholders}. Callers escape values that come from data.
function t(key, vars = {}) {
  const s = L10N[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}
const w = (word) => L10N["words." + word] ?? word; // data words like "Full-time"
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString(lang === "de" ? "de-AT" : "en", { maximumFractionDigits: 1 });
let checkedAt = null; // date of the last data check on the server (data/checked.json), if there is one
// " · checked …" when the data was checked after it was taken, else "".
const checkedNote = () => (checkedAt && prog && checkedAt > prog.dataAsOf ? t("prog.checked", { date: prettyDate(checkedAt) }) : "");
const prettyDate = (d) => new Date(d + "T12:00:00").toLocaleDateString(lang === "de" ? "de-AT" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
const season = (s) => t(s % 2 ? "sem.winter" : "sem.summer");
const semWord = () => (lang === "de" ? "Semester" : "semesters");
// Workload: ECTS × 25 h is the total (class time included). Class time: 1 SWS = one lesson of 45 minutes per teaching
// week (Austrian standard, e.g. KLRV: "Die Dauer einer Lehreinheit beträgt 45 Minuten") → SWS × 14 weeks × 0.75 h.
// Per day: a 5-day week over a semester of about 20 weeks (FH Salzburg: mid-Sep to end of Jan, mid-Feb to end of June);
// classes run 14 weeks. Shown as halves, e.g. 7½.
const SEMESTER_WEEKS = 20, TEACHING_WEEKS = 14, DAYS = 5, LESSON_H = 0.75;
const lessonsOf = (sws) => sws * TEACHING_WEEKS;          // lessons of 45 min over the semester
const classHours = (sws) => lessonsOf(sws) * LESSON_H;    // clock hours in class
const half = (x) => { const r = Math.round(x * 2) / 2; const i = Math.floor(r); return (i ? String(i) : r ? "" : "0") + (r - i ? "½" : ""); };
const perDay = (hours) => hours / SEMESTER_WEEKS / DAYS;
const hoursOf = (ects, sws) => {
  const total = Math.round(ects * 25), inClass = Math.round(classHours(sws));
  return { total, inClass, self: Math.max(0, total - inClass) };
};

async function loadL10n() {
  const wanted = (navigator.languages || [navigator.language || "en"]).map((l) => l.slice(0, 2).toLowerCase());
  lang = wanted.find((l) => CONFIG.languages.includes(l)) || "en";
  try {
    L10N = await (await fetch(`l10n/${lang}.json`)).json();
  } catch {
    lang = "en";
    L10N = await (await fetch("l10n/en.json")).json();
  }
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-l10n]").forEach((el) => { el.innerHTML = t(el.dataset.l10n); });
  document.querySelectorAll("[data-l10n-attr]").forEach((el) => {
    el.dataset.l10nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":");
      el.setAttribute(attr, t(key));
    });
  });
}

// Counts a number from its old to its new value once (no jump).
function countTo(el, value, text) {
  if (!el) return;
  const from = parseFloat(el.dataset.v ?? "NaN");
  el.dataset.v = value;
  if (reduceMotion || isNaN(from) || from === value) { el.textContent = text(value); return; }
  const start = performance.now(), dur = 550;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = text(p < 1 ? Math.round((from + (value - from) * e) * 10) / 10 : value);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Icons (inline stroke SVG) ---------- */

const ICON_PATHS = {
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19l7-7"/>',
  heart: '<path d="M20.5 8.5c0 5.5-8.5 11-8.5 11s-8.5-5.5-8.5-11A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5z"/><path d="M6.5 12h3l1.5-2.5 2 5 1.5-2.5h3"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bookmark: '<path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  cloudOff: '<path d="M3 3l18 18"/><path d="M8.5 6.2A6 6 0 0 1 17.7 10h.3a4 4 0 0 1 2.2 7.3M17 19H7a5 5 0 0 1-1.5-9.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  check: '<path d="M5 12.5l4 4L19 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  note: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><circle cx="11" cy="11" r="2"/>',
  camera: '<rect x="2.5" y="6" width="14" height="12" rx="2"/><path d="M16.5 10.5l5-3v9l-5-3z"/>',
  trend: '<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  gamepad: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4M15.5 11.5v.01M18 13.5v.01"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.5 3.5 0 0 0 9 18.5V4.5zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3.5 3.5 0 0 1-5 5.8V4.5z"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/><path d="M13 12l5 5"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
  building: '<rect x="4" y="3" width="12" height="18" rx="1.5"/><path d="M16 9h4v12h-4M8 7h4M8 11h4M8 15h4"/>',
  cog: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.compass}</svg>`;

const DEPT_ICONS = { as: "users", bt: "briefcase", ct: "sparkles", ed: "leaf", gw: "heart", it: "chip" };

const TRACK_ICONS = [
  [/audio|sound|music/i, "note"], [/film|cinema/i, "camera"], [/animation/i, "play"],
  [/web|mobile|internet/i, "globe"], [/game/i, "gamepad"], [/\bai\b|artificial|intelligence|machine|data/i, "brain"],
  [/interaction|hci|experience/i, "cursor"], [/security|privacy/i, "shield"],
  [/communication design|design|furniture|interior|typograph/i, "pen"],
  [/timber|wood|construction|building|existing/i, "building"], [/urban|city|cities/i, "globe"],
  [/system|engineering|process|operations|supply/i, "cog"], [/sustain|green|circular|eco|forest/i, "leaf"],
  [/health|care|nurs|psych|geriat|child|youth|family|acute|patient/i, "heart"], [/social|inequal|space|people/i, "users"],
  [/italian|spanish|german|french|language/i, "chat"], [/financ|value|people management|business|market/i, "chart"],
  [/produc|management|entrepreneur/i, "trend"],
];
const trackIcon = (name) => (TRACK_ICONS.find(([re]) => re.test(name)) || [null, "compass"])[1];

/* ---------- Local storage: everything the viewer chooses ---------- */

function readStore() {
  try {
    const st = JSON.parse(localStorage.getItem(STORE_KEY));
    if (st) return st;
    const old = JSON.parse(localStorage.getItem("ct-study-planner"));
    return old ? { last: old.last, sel: old.sel || {} } : {};
  } catch { return {}; }
}
const store = readStore();
["sel", "picks", "scroll", "open"].forEach((k) => { store[k] = store[k] || {}; });
let openSet = new Set(); // expanded courses of the programme shown

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
  }, 150);
}
function remember() {
  store.last = prog.id;
  store.sel[prog.id] = sel;
  store.picks[prog.id] = picks;
  store.open[prog.id] = [...openSet];
  persist();
}

/* ---------- URL: #/<programme>/<track option>…[?picks=…]  ·  #/ is the start page ---------- */

const allProgrammes = () => index.departments.flatMap((d) => d.programmes.map((p) => ({ ...p, dept: d })));
const findProgramme = (id) => allProgrammes().find((p) => p.id === id);

function readHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const shared = new URLSearchParams(query).get("picks");
  if (!parts.length) return { home: location.hash === "#/" || location.hash === "#" };
  if (parts.length === 1 && !findProgramme(parts[0])) return { id: "mma-m", opts: parts }; // old #film links
  return { id: parts[0], opts: parts.slice(1), shared };
}
const programmeHash = () => "#/" + [prog.id, ...prog.tracks.map((tr) => sel[tr.key])].join("/");
function writeHash() { history.replaceState(null, "", programmeHash()); }

/* ---------- Boot ---------- */

async function init() {
  await loadL10n();
  $("#menu-btn").innerHTML = icon("menu");
  initFeedback();
  $(".search-icon").outerHTML = icon("search");
  $("#prog-info").innerHTML = icon("info");
  $("#share").innerHTML = icon("share");
  // Optional, loaded in parallel: written by the weekly data check on the server; missing elsewhere, which is fine.
  const checked = fetch("data/checked.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.checkedAt) || null).catch(() => null);
  try {
    index = await (await fetch("data/index.json")).json();
  } catch {
    $("#home").hidden = false;
    $("#home-title").textContent = t("app.loadError");
    return;
  }
  checkedAt = await checked;
  buildSide();
  buildSearch();
  initTips();
  // An entrance animation keeps holding its values after it ends, which makes hover transitions jump.
  document.addEventListener("animationend", (e) => {
    if (e.animationName === "enter") { e.target.classList.remove("enter"); e.target.style.removeProperty("--i"); }
  });
  $("#share").addEventListener("click", sharePlan);

  await route(false);
  window.addEventListener("hashchange", () => route(true));
  window.addEventListener("scroll", () => {
    if (!prog) return;
    store.scroll[prog.id] = Math.round(window.scrollY);
    persist();
  }, { passive: true });

  $("#menu-btn").addEventListener("click", () => toggleSide(!document.body.classList.contains("side-open")));
  $("#scrim").addEventListener("click", () => toggleSide(false));

  const setOnline = () => {
    const off = !navigator.onLine;
    document.body.classList.toggle("is-offline", off);
    const btn = $("#saved");
    const had = btn.innerHTML;
    btn.innerHTML = icon(off ? "cloudOff" : "bookmark");
    if (had && !reduceMotion) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
  };
  window.addEventListener("online", setOnline);
  window.addEventListener("offline", setOnline);
  setOnline();
  registerOffline();
}

async function route(animate) {
  countVisit();
  const h = readHash();
  if (h.home || (!h.id && !findProgramme(store.last))) { await showHome(animate); return; }
  const id = h.id && findProgramme(h.id) ? h.id : store.last;
  if (prog && id === prog.id && !h.shared) { applyOpts(h.opts || []); return; }
  await openProgramme(id, h.id === id ? h.opts : null, animate, h.id === id ? h.shared : null);
}

/* ---------- Visit counter: one count per view, e.g. /compass/mma-m/film (never the picks) ---------- */

let counted = null;
let counterLoaded = false;
function countVisit() {
  if (!CONFIG.counter || location.protocol === "file:") return;
  const view = location.hash.replace(/^#\/?/, "").split("?")[0];
  const path = location.pathname.replace(/index\.html$/, "") + view;
  if (path === counted) return;
  counted = path;
  if (window.goatcounter && window.goatcounter.count) { window.goatcounter.count({ path }); return; }
  if (counterLoaded) return;
  counterLoaded = true;
  const s = document.createElement("script");
  s.src = CONFIG.counter + "count.js";
  s.async = true;
  s.dataset.goatcounter = CONFIG.counter + "count";
  s.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
  s.onload = () => window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path: counted });
  document.head.appendChild(s);
}

// Service worker: offline copy. On a known metered or slow connection only the programmes you open are kept.
function registerOffline() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
    const c = navigator.connection;
    const roomy = c && !c.saveData && c.type !== "cellular" && !/2g/.test(c.effectiveType || "");
    if (!roomy) return;
    const urls = allProgrammes().map((p) => new URL(p.file, location.href).href);
    reg.active && reg.active.postMessage({ type: "precache", urls });
  }).catch(() => { /* offline mode not available here */ });
}

async function getProgramme(id) {
  if (!cache[id]) cache[id] = await (await fetch(findProgramme(id).file)).json();
  return cache[id];
}

// Swaps the visible view (start page or programme) with the same fade as a programme change.
async function swapView(animate, build) {
  const views = [$("#home"), $("#page")];
  const visible = views.find((v) => !v.hidden);
  hideTip(true);
  if (animate && visible && !reduceMotion) {
    visible.classList.remove("in");
    visible.classList.add("out");
    await wait(180);
    visible.classList.remove("out");
  }
  const shown = build();
  views.forEach((v) => { v.hidden = v !== shown; });
  if (animate && !reduceMotion) { shown.classList.remove("in"); void shown.offsetWidth; shown.classList.add("in"); }
}

async function openProgramme(id, opts, animate, shared) {
  const data = await getProgramme(id);
  await swapView(animate, () => {
    prog = data;
    const stored = store.sel[id] || {};
    sel = {};
    prog.tracks.forEach((tr, i) => {
      const ids = tr.options.map((o) => o.id);
      const fromUrl = opts && opts[i];
      sel[tr.key] = ids.includes(fromUrl) ? fromUrl : ids.includes(stored[tr.key]) ? stored[tr.key] : ids[0];
    });
    picks = { ...(store.picks[id] || {}) };
    openSet = new Set(store.open[id] || []);
    if (shared) applyShared(shared);

    buildHeader();
    buildPickers();
    $("#overview").innerHTML = "";
    buildSemesters();
    render(false);
    updateSide();
    writeHash();
    remember();
    toggleSide(false);
    return $("#page");
  });
  window.scrollTo({ top: shared ? 0 : store.scroll[id] || 0, behavior: "auto" });
}

function applyOpts(opts) {
  let changed = false;
  prog.tracks.forEach((tr, i) => {
    if (opts[i] && tr.options.some((o) => o.id === opts[i]) && sel[tr.key] !== opts[i]) { sel[tr.key] = opts[i]; changed = true; }
  });
  if (changed) { render(true); remember(); }
}

/* ---------- Start page: what do you study? ---------- */

async function showHome(animate) {
  await swapView(animate, () => {
    prog = null;
    document.title = t("app.name");
    renderHomeDepts();
    updateSide();
    toggleSide(false);
    return $("#home");
  });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderHomeDepts() {
  const stage = $("#home-stage");
  stage.innerHTML = `<div class="home-grid">${index.departments.map((d, i) => `
    <button class="dept-tile ${reduceMotion ? "" : "enter"}" type="button" data-dept="${d.id}" style="--i:${i}; --bg: var(--${d.id}-bg); --fg: var(--${d.id}-fg)">
      <span class="dept-ico">${icon(DEPT_ICONS[d.id])}</span>
      <b>${esc(d.name)}</b>
      <small>${esc(t("home.programmes", { n: d.programmes.length }))}</small>
    </button>`).join("")}</div>`;
  stage.onclick = (e) => {
    const tile = e.target.closest(".dept-tile");
    if (tile) renderHomeProgrammes(tile.dataset.dept);
  };
}

function renderHomeProgrammes(deptId) {
  const stage = $("#home-stage");
  const d = index.departments.find((x) => x.id === deptId);
  leaveStage(() => {
    stage.innerHTML = `
      <button class="back ${reduceMotion ? "" : "enter"}" type="button">${icon("arrowLeft")}${esc(t("home.back"))}</button>
      <div class="home-dept ${reduceMotion ? "" : "enter"}" style="--bg: var(--${d.id}-bg); --fg: var(--${d.id}-fg)">
        <span class="dept-ico">${icon(DEPT_ICONS[d.id])}</span><h2>${esc(d.name)}</h2>
      </div>
      <ul class="home-list">${sideList(d.programmes, true)}</ul>`;
    if (!reduceMotion) stage.querySelectorAll(".home-list li").forEach((li, i) => { li.style.setProperty("--i", i + 2); li.classList.add("enter"); });
    stage.onclick = (e) => {
      if (e.target.closest(".back")) { leaveStage(renderHomeDepts); return; }
      const link = e.target.closest(".prog-link");
      if (link) { e.preventDefault(); openProgramme(link.dataset.id, null, true); }
    };
    $(".back", stage).focus({ preventScroll: true });
  });
}

function leaveStage(next) {
  const stage = $("#home-stage");
  if (reduceMotion || !stage.firstElementChild) { next(); return; }
  stage.querySelectorAll(".dept-tile, .home-list li, .back, .home-dept").forEach((el) => el.classList.add("leave"));
  setTimeout(next, 160);
}

/* ---------- Sidebar: departments with their programmes ---------- */

const degreeShort = (d) => (d.startsWith("Bachelor Professional") ? "BPr" : d.startsWith("Bachelor") ? "BA" : d.startsWith("Joint") ? "Joint MA" : "MA");
const DEGREE_RANK = (d) => (d.startsWith("Bachelor Professional") ? 1 : d.startsWith("Bachelor") ? 0 : d.startsWith("Joint") ? 3 : 2);

// Bachelor first, then Master; alphabetical inside; variants of one programme right under each other.
function sideList(list, big) {
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name) || DEGREE_RANK(a.degree) - DEGREE_RANK(b.degree)
    || (a.mode === "Full-time" ? 0 : 1) - (b.mode === "Full-time" ? 0 : 1) || a.language.localeCompare(b.language));
  const variant = (p, group) => {
    const twins = group.filter((q) => q.name === p.name && q.degree === p.degree);
    if (twins.length < 2) return "";
    return w(twins.some((q) => q.mode !== p.mode) ? p.mode : p.language);
  };
  return [["nav.bachelor", (p) => p.degree.startsWith("Bachelor")], ["nav.master", (p) => !p.degree.startsWith("Bachelor")]].map(([label, test]) => {
    const group = sorted.filter(test);
    if (!group.length) return "";
    return `<li class="list-head">${esc(t(label))}</li>` + group.map((p) => {
      const v = variant(p, group);
      const meta = big ? `<em>${esc([w(p.mode), w(p.language), `${p.semesters} ${semWord()}`].join(" · "))}</em>` : v ? `<em>${esc(v)}</em>` : "";
      return `<li><a class="prog-link" href="#/${p.id}" data-id="${p.id}" ${big ? "" : 'data-tip="prog"'}><span>${esc(p.name)}${meta}</span><small>${degreeShort(p.degree)}</small></a></li>`;
    }).join("");
  }).join("");
}

function buildSide() {
  $("#side").innerHTML = index.departments.map((d) => `
    <div class="dept" data-dept="${d.id}" style="--fg: var(--${d.id}-fg)">
      <button class="dept-btn" type="button" aria-expanded="false">
        <span class="dept-ico" style="background: var(--${d.id}-bg); color: var(--${d.id}-fg)">${icon(DEPT_ICONS[d.id])}</span>
        <span>${esc(d.name)}</span>
      </button>
      <div class="dept-list"><div><ul>
        ${sideList(d.programmes)}
        ${(d.missing || []).length ? `<li class="list-head">${esc(t("nav.notIncluded"))}</li>` + d.missing.map((m) => `<li class="missing" data-tip="text" data-text="${esc(m.reason)}" tabindex="0">${esc(m.name)}</li>`).join("") : ""}
      </ul></div></div>
    </div>`).join("") + `<div class="side-foot">${CONFIG.feedback?.key ? `<button class="side-feedback" type="button" data-feedback="bug">${icon("chat")}<span>${esc(t("fb.open"))}</span></button>` : ""}${CONFIG.legalUrl ? `<a class="side-legal" href="${esc(CONFIG.legalUrl)}">${esc(t("nav.legal"))}</a>` : ""}</div>`;
  $("#side").addEventListener("click", (e) => {
    const btn = e.target.closest(".dept-btn");
    if (btn) {
      const dept = btn.parentElement;
      const open = !dept.classList.contains("open");
      document.querySelectorAll(".dept.open").forEach((d) => { if (d !== dept) setDept(d, false); });
      setDept(dept, open);
      return;
    }
    const link = e.target.closest(".prog-link");
    if (link) {
      e.preventDefault();
      if (!prog || link.dataset.id !== prog.id) openProgramme(link.dataset.id, null, true);
      else toggleSide(false);
    }
  });
}

function setDept(el, open) {
  el.classList.toggle("open", open);
  $(".dept-btn", el).setAttribute("aria-expanded", String(open));
}

function updateSide() {
  document.querySelectorAll(".dept").forEach((d) => setDept(d, Boolean(prog) && d.dataset.dept === prog.department));
  document.querySelectorAll("#side .prog-link").forEach((a) => {
    if (prog && a.dataset.id === prog.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function toggleSide(open) {
  document.body.classList.toggle("side-open", open);
  $("#menu-btn").setAttribute("aria-expanded", String(open));
}

/* ---------- Search: programmes (also by short names) and courses of all programmes ---------- */

let results = [], active = 0;

async function loadSearchIndex() {
  if (!searchIndex) {
    try { searchIndex = await (await fetch("data/search.json")).json(); } catch { searchIndex = []; }
  }
  return searchIndex;
}

// Search matches the start of words ("ma" finds "Master" but not "German"); short names like MMA or CIS count as words.
const tokens = (str) => String(str).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const hits = (q, words) => words.some((x) => x.startsWith(q));

function programmeWords(p) {
  return [...tokens(p.name), ...tokens(p.degree), degreeShort(p.degree).toLowerCase(), ...tokens(p.mode), ...tokens(w(p.mode)),
    ...tokens(p.language), ...tokens(w(p.language)), ...tokens(p.dept.name), ...(p.aliases || []).map((a) => a.toLowerCase())];
}

function findMatches(q) {
  const words = tokens(q);
  const progs = allProgrammes();
  const pw = Object.fromEntries(progs.map((p) => [p.id, programmeWords(p)]));
  const byId = Object.fromEntries(progs.map((p) => [p.id, p]));
  // Programmes: every word must match; an exact short name (MMA, CIS) ranks first.
  const pr = progs.map((p) => {
    if (!words.length || !words.every((x) => hits(x, pw[p.id]))) return null;
    const exact = words.some((x) => (p.aliases || []).some((a) => a.toLowerCase() === x));
    const starts = p.name.toLowerCase().startsWith(words[0]);
    return { kind: "programme", p, score: exact ? 0 : starts ? 1 : 2 };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name)).slice(0, 6);
  // Courses: at least one word must match the course title (or a full course code); the rest may narrow by programme.
  const cr = [];
  if (searchIndex && words.length) {
    for (const [pid, code, title, semester, track] of searchIndex) {
      const p = byId[pid];
      if (!p) continue;
      const tw = tokens(title);
      const codeL = code.toLowerCase();
      const own = (x) => hits(x, tw) || (x.length >= 6 && codeL.startsWith(x));
      if (!words.some(own)) continue;
      if (!words.every((x) => own(x) || hits(x, pw[pid]) || hits(x, tokens(track)))) continue;
      cr.push({ kind: "course", p, code, title, semester, track, score: tw[0] && tw[0].startsWith(words[0]) ? 0 : 1 });
    }
    cr.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
  }
  return { words, list: [...pr, ...cr.slice(0, 8)] };
}

function buildSearch() {
  const input = $("#search"), box = $("#search-results");
  box.setAttribute("aria-label", t("search.label"));
  const close = () => { box.classList.remove("open"); input.setAttribute("aria-expanded", "false"); };
  const go = (r) => {
    input.value = ""; close(); input.blur();
    if (r.kind === "programme") { if (!prog || r.p.id !== prog.id) openProgramme(r.p.id, null, true); }
    else goToCourse(r.p.id, r.code);
  };
  input.addEventListener("focus", loadSearchIndex);
  input.addEventListener("input", async () => {
    const q = input.value.trim();
    if (!q) { close(); return; }
    await loadSearchIndex();
    if (input.value.trim() !== q) return;
    const { words, list } = findMatches(q);
    results = list;
    active = 0;
    const hl = words.length === 1 ? words[0] : "";
    let html = "", lastKind = "";
    list.forEach((r, i) => {
      if (r.kind !== lastKind) { html += `<p class="result-head">${esc(t(r.kind === "programme" ? "search.programmes" : "search.courses"))}</p>`; lastKind = r.kind; }
      const d = r.p.dept;
      const ico = `<span class="dept-ico" style="background: var(--${d.id}-bg); color: var(--${d.id}-fg)">${icon(r.kind === "programme" ? DEPT_ICONS[d.id] : "book")}</span>`;
      const meta = r.kind === "programme"
        ? `${esc(w(r.p.degree))} · ${esc(w(r.p.mode))} · ${esc(d.name)}`
        : `${esc(r.p.name)} ${degreeShort(r.p.degree)} · ${esc(t("search.semester", { n: r.semester }))}${r.track ? " · " + esc(r.track) : ""}`;
      html += `<button class="result" type="button" role="option" aria-selected="${i === 0}" data-i="${i}">${ico}
        <span><b>${highlight(r.kind === "programme" ? r.p.name : r.title, hl)}</b><small>${meta}</small></span></button>`;
    });
    box.innerHTML = list.length ? html : `<p class="result-empty">${esc(t("search.none", { q }))}</p>`;
    if (!box.classList.contains("open") && !reduceMotion) box.querySelectorAll(".result").forEach((r, i) => { r.style.setProperty("--i", i); r.classList.add("enter"); });
    box.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; close(); return; }
    if (!results.length || !box.classList.contains("open")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      box.querySelectorAll(".result").forEach((r) => r.setAttribute("aria-selected", String(+r.dataset.i === active)));
      box.querySelector(`.result[data-i="${active}"]`).scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
  });
  box.addEventListener("click", (e) => { const r = e.target.closest(".result"); if (r) go(results[+r.dataset.i]); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#search-box")) close(); });
}

function highlight(text, q) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
}

// Opens the programme, switches to the course's specialisation if needed, and points at the course.
async function goToCourse(pid, code) {
  if (!prog || prog.id !== pid) await openProgramme(pid, null, true);
  const c = byCode(code);
  if (!c) return;
  if (c.track && !matches(c.track)) {
    Object.entries(c.track).forEach(([k, v]) => { sel[k] = Array.isArray(v) ? v[0] : v; });
    writeHash(); remember(); render(false);
  }
  let el = $(`.row-title[data-code="${CSS.escape(code)}"]`)?.closest(".course");
  if (!el && c.group) {
    const g = prog.groups.find((x) => x.id === c.group);
    const o = g && g.options.find((x) => x.courses.includes(code));
    if (o) el = $(`.opt[data-group="${CSS.escape(g.id)}"][data-opt="${CSS.escape(o.id)}"]`);
    const entry = el && el.closest(".choice");
    if (entry && !entry.classList.contains("open")) { setOpen(entry, true); await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 450)); }
  }
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

/* ---------- Header, notes, sharing, pickers ---------- */

const deptName = () => index.departments.find((d) => d.id === prog.department).name;

function buildHeader() {
  $("#title").textContent = prog.name;
  $("#subtitle").textContent = t("prog.subtitle", { degree: w(prog.degree), department: deptName() });
  document.title = `${prog.name} (${w(prog.degree)}) · ${t("app.name")}`;
  const b = prog.source.brochure;
  $("#source").innerHTML = t("foot.source", {
    curriculum: esc(prog.source.curriculum),
    brochure: b ? t("foot.brochure", { url: esc(b.url), version: esc(b.version) }) : "",
    date: esc(prettyDate(prog.dataAsOf)),
    checked: esc(checkedNote()),
  });
  $("#report").innerHTML = CONFIG.feedback?.key ? t("foot.reportForm") : t("foot.report", { url: esc(reportUrl()) });
  $("#json-link").href = `data/${prog.id}.json`;
}

function reportUrl() {
  const vars = { programme: prog.name, degree: w(prog.degree), link: location.href.split("?")[0], date: prog.dataAsOf };
  const u = new URL(CONFIG.reportUrl);
  u.searchParams.set("title", t("report.title", vars));
  u.searchParams.set("body", t("report.body", vars));
  return u.href;
}

/* ---------- Report a problem / suggest an idea (Web3Forms, like Vorleser) ---------- */

const FB_LIMIT = 3, FB_WINDOW = 60 * 60 * 1000;   // at most 3 messages an hour from one browser
let fbKind = "bug";
function fbContext() {
  return [
    `${t("fb.ctxProgramme")}: ${prog ? `${prog.name} (${w(prog.degree)})` : "–"}`,
    `${t("fb.ctxPage")}: ${location.href}`,
    `${t("fb.ctxData")}: ${prog?.dataAsOf || "–"}`,
    `${t("fb.ctxLang")}: ${lang} · ${navigator.language}`,
    `${t("fb.ctxBrowser")}: ${navigator.userAgent}`,
    `${t("fb.ctxScreen")}: ${innerWidth}×${innerHeight}`,
  ].join("\n");
}
function fbSetKind(kind) {
  fbKind = kind;
  const d = $("#feedback");
  d.querySelectorAll(".fb-kind button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
  const on = d.querySelector(`.fb-kind button[data-kind="${kind}"]`), ink = d.querySelector(".fb-kind .ink");
  ink.style.width = `${on.offsetWidth}px`;
  ink.style.transform = `translateX(${on.offsetLeft - 4}px)`;
  $("#fb-msg").placeholder = t(kind === "bug" ? "fb.placeholderBug" : "fb.placeholderIdea");
  $("#fb-title").textContent = t(kind === "bug" ? "fb.titleBug" : "fb.titleIdea");
}
function openFeedback(kind = "bug", prefill = "") {
  const d = $("#feedback");
  d.classList.remove("sent");
  $("#fb-status").textContent = "";
  if (prefill && !$("#fb-msg").value) $("#fb-msg").value = prefill;
  $("#fb-ctx").textContent = fbContext();
  delete d.dataset.banner; fbBanner("");
  d.showModal();
  fbCheckLimit();
  fbSetKind(kind);
  setTimeout(() => $("#fb-msg").focus(), 30);
}
/** A clear notice at the top of the form (limit reached, sending failed, offline) instead of a small line. */
function fbBanner(text) {
  const b = $("#fb-banner");
  if (text) $("#fb-banner-text").textContent = text;
  b.classList.toggle("show", Boolean(text));
}
/** Limit reached? Then say from when the next message can be sent and block the button until then. */
function fbCheckLimit() {
  const recent = fbRecent(), d = $("#feedback");
  clearTimeout(fbCheckLimit.timer);
  if (recent.length < FB_LIMIT) { d.classList.remove("blocked"); if (d.dataset.banner === "limit") { fbBanner(""); delete d.dataset.banner; } return false; }
  const free = Math.min(...recent) + FB_WINDOW;
  const at = new Date(free).toLocaleTimeString(lang === "de" ? "de-AT" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  d.classList.add("blocked"); d.dataset.banner = "limit";
  fbBanner(t("fb.limitAt", { n: FB_LIMIT, time: at }));
  fbCheckLimit.timer = setTimeout(fbCheckLimit, free - Date.now() + 500);   // unblock by itself
  return true;
}
function fbRecent() {
  try { return JSON.parse(localStorage.getItem("compass-feedback") || "[]").filter((x) => Date.now() - x < FB_WINDOW); } catch { return []; }
}
async function sendFeedback(e) {
  e.preventDefault();
  const msg = $("#fb-msg").value.trim(), mail = $("#fb-mail").value.trim(), status = $("#fb-status");
  if (msg.length < 5) { status.textContent = t("fb.tooShort"); return $("#fb-msg").focus(); }
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { status.textContent = t("fb.badMail"); return $("#fb-mail").focus(); }
  if (fbCheckLimit()) return;
  const fields = {
    access_key: CONFIG.feedback.key, botcheck: $("#fb-bot").checked ? "true" : "",
    subject: `Curriculum Compass – ${fbKind === "bug" ? "Fehler" : "Idee"}${prog ? ` (${prog.name} ${w(prog.degree)})` : ""}`,
    from_name: "Curriculum Compass", Art: fbKind === "bug" ? "Fehler" : "Idee", Nachricht: msg,
    "Antwort an": mail || "(keine Angabe)", "Technische Infos": $("#fb-tech").checked ? fbContext() : "(nicht mitgeschickt)",
    ...(mail ? { email: mail, replyto: mail } : {}),
  };
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const d = $("#feedback");
  d.classList.add("sending");
  status.textContent = t("fb.sending");
  try {
    // plain form data (not JSON): a "simple" CORS request without preflight – Web3Forms blocks the preflight
    const r = await fetch(CONFIG.feedback.endpoint, { method: "POST", headers: { Accept: "application/json" }, body: form });
    const res = await r.json().catch(() => ({}));
    if (!r.ok || !res.success) throw new Error(res.message || r.status);
    try { localStorage.setItem("compass-feedback", JSON.stringify([...fbRecent(), Date.now()])); } catch {}
    d.classList.add("sent");
    status.textContent = "";
    fbBanner(""); delete d.dataset.banner;
    $("#fb-msg").value = "";
    setTimeout(() => { if (d.open && d.classList.contains("sent")) closeFeedback(); }, 2200);
  } catch {
    status.textContent = "";
    d.dataset.banner = "error";
    fbBanner(navigator.onLine ? t("fb.failed") : t("fb.offline"));
  } finally {
    d.classList.remove("sending");
  }
}
function closeFeedback() {
  const d = $("#feedback");
  if (!d.open) return;
  if (reduceMotion) return d.close();
  d.classList.add("closing");
  setTimeout(() => { d.classList.remove("closing"); d.close(); }, 200);
}
function initFeedback() {
  const d = $("#feedback");
  if (!d || !CONFIG.feedback?.key) return;
  d.querySelectorAll("[data-l10n]").forEach((el) => (el.textContent = t(el.dataset.l10n)));
  d.querySelectorAll(".fb-kind button").forEach((b) => (b.onclick = () => fbSetKind(b.dataset.kind)));
  $("#fb-form").addEventListener("submit", sendFeedback);
  $("#fb-cancel").onclick = closeFeedback;
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeFeedback(); });
  d.addEventListener("click", (e) => { if (e.target === d) closeFeedback(); });   // click on the backdrop
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-feedback]");
    if (!b) return;
    e.preventDefault();
    const ctx = b.dataset.feedback === "data" && prog ? t("fb.prefillData", { programme: `${prog.name} (${w(prog.degree)})` }) : "";
    openFeedback(b.dataset.feedback === "idea" ? "idea" : "bug", ctx);
  });
}

function renderNotes() {
  const notes = prog.notes.filter((n) => !n.semester && matches(n.onlyFor));
  const slot = $("#notes-slot");
  const html = notes.length
    ? `<div class="notes-inner"><button class="note-pill" type="button" data-tip="notes">${icon("info")}${esc(notes.length === 1 ? t("prog.notes1") : t("prog.notesN", { n: notes.length }))}</button></div>`
    : "";
  if (slot.dataset.html === html) return;
  slot.dataset.html = html;
  const old = $(".note-pill", slot);
  const show = () => {
    slot.innerHTML = html;
    void slot.offsetWidth;
    slot.classList.add("open");
    const pill = $(".note-pill", slot);
    if (pill && !reduceMotion) pill.classList.add("enter");
  };
  if (!old) { if (html) show(); return; }
  if (reduceMotion) { if (html) show(); else { slot.innerHTML = ""; slot.classList.remove("open"); } return; }
  // Fold the pill away together with its space; only then remove it (or put the new one in).
  old.classList.add("leave");
  slot.classList.remove("open");
  setTimeout(() => { if (slot.dataset.html !== html) return; slot.innerHTML = ""; if (html) show(); }, 380);
}

// The share link holds the programme, the specialisation and the picked electives.
function shareLink() {
  const entries = Object.entries(picks).filter(([, v]) => v && v.length);
  const q = entries.length ? "?picks=" + encodeURIComponent(entries.map(([k, v]) => `${k}:${v.join(",")}`).join(";")) : "";
  return location.href.split("#")[0] + programmeHash() + q;
}

async function sharePlan() {
  const url = shareLink();
  if (!canHover && navigator.share) {
    try { await navigator.share({ title: t("share.text", { programme: prog.name }), url }); } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t("share.copied"));
  } catch {
    toast(t("share.failed"));
  }
}

function applyShared(param) {
  const before = JSON.parse(JSON.stringify(picks));
  const next = {};
  param.split(";").forEach((part) => {
    const [k, v] = part.split(":");
    if (k && v) next[k] = v.split(",").filter(Boolean);
  });
  picks = next;
  toast(t("share.opened"), t("share.undo"), () => { picks = before; remember(); semesters().forEach((s) => { $(`#sem-${s} .slot`).dataset.html = ""; }); render(false); });
}

let toastTimer;
function toast(text, actionLabel, action) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(text)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ""}`;
  if (actionLabel) $("button", el).onclick = () => { action(); el.classList.remove("show"); };
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), actionLabel ? 6000 : 2400);
}

function buildPickers() {
  $("#pickers").innerHTML = prog.tracks.map((tr, i) => `
    <section class="picker ${i ? "minor" : ""}" aria-label="${esc(w(tr.label))}">
      <h2 class="picker-label">${esc(t("prog.yourTrack", { track: w(tr.label) }))}${tr.fromSemester > 1 ? ` <small>${esc(t("prog.fromSemester", { n: tr.fromSemester }))}</small>` : ""}</h2>
      <div class="pills" role="radiogroup" aria-label="${esc(w(tr.label))}" data-key="${tr.key}">
        ${tr.options.map((o) => `<button class="pill" type="button" role="radio" data-id="${o.id}">${icon(trackIcon(o.name))}${esc(o.name)}</button>`).join("")}
      </div>
    </section>`).join("");
  document.querySelectorAll(".pills").forEach((group) => {
    const key = group.dataset.key;
    group.addEventListener("click", (e) => { const b = e.target.closest(".pill"); if (b) selectTrack(key, b.dataset.id); });
    group.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const ids = [...group.querySelectorAll(".pill")].map((b) => b.dataset.id);
      const next = ids[(ids.indexOf(sel[key]) + keys[e.key] + ids.length) % ids.length];
      selectTrack(key, next);
      group.querySelector(`[data-id="${next}"]`).focus();
    });
  });
}

function selectTrack(key, id) {
  if (sel[key] === id) return;
  sel[key] = id;
  writeHash();
  remember();
  render(true);
}

/* ---------- Data helpers ---------- */

const byCode = (code) => prog.courses.find((c) => c.code === code);
const sum = (list, key) => list.reduce((a, c) => a + c[key], 0);
const matches = (cond) => !cond || Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.includes(sel[k]) : sel[k] === v));
const trackOf = (key) => prog.tracks.find((tr) => tr.key === key);
const optionName = (key) => trackOf(key).options.find((o) => o.id === sel[key]).name;
const groupsIn = (s) => prog.groups.filter((g) => g.semester === s && matches(g.onlyFor));
const optionTotal = (o, key) => sum(o.courses.map(byCode), key);
const pickKey = (g) => g.sync || g.id;
const isTrackGroup = (g) => Boolean(g.onlyFor || g.linkedTrack);
const groupColor = (g) => (g.compulsory ? "core" : isTrackGroup(g) ? "spec" : "elec");
const isBudget = (g) => g.budget != null && g.options.length > 0;
const ownOption = (g) => g.linkedTrack && g.options.find((o) => o.track && o.track[g.linkedTrack] === sel[g.linkedTrack]);

function pickedOptions(g) {
  const own = ownOption(g);
  const ids = (picks[pickKey(g)] || []).filter((id) => g.options.some((o) => o.id === id) && (!own || id !== own.id));
  const chosen = ids.map((id) => g.options.find((o) => o.id === id));
  if (g.budget != null) return chosen;
  return own ? [own, ...chosen].slice(0, g.choose) : chosen.slice(0, g.choose);
}
const pickedEcts = (g) => pickedOptions(g).reduce((a, o) => a + optionTotal(o, "ects"), 0);
const isFull = (g) => (isBudget(g) ? pickedEcts(g) >= g.budget - 0.01 : pickedOptions(g).length >= g.choose);

function groupTotal(g, key) {
  if (!g.options.length) return g[key] || 0;
  if (isBudget(g)) return key === "ects" ? g.budget : g.budgetSws ?? pickedOptions(g).reduce((a, o) => a + optionTotal(o, key), 0);
  const picked = pickedOptions(g);
  const rest = g.options.filter((o) => !picked.includes(o)).map((o) => optionTotal(o, key)).sort((a, b) => b - a);
  return picked.reduce((a, o) => a + optionTotal(o, key), 0) + rest.slice(0, g.choose - picked.length).reduce((a, b) => a + b, 0);
}

function semesterParts(s) {
  const inSem = prog.courses.filter((c) => c.semester === s && !c.group);
  return {
    core: inSem.filter((c) => !c.track),
    tracks: prog.tracks.map((tr) => ({ track: tr, courses: inSem.filter((c) => c.track && c.track[tr.key] && matches(c.track)) })),
    groups: groupsIn(s),
  };
}

function totals(s) {
  const p = semesterParts(s);
  const r = { core: sum(p.core, "ects"), spec: 0, minor: 0, elec: 0, sws: sum(p.core, "sws") };
  p.tracks.forEach(({ courses }, i) => { r[i ? "minor" : "spec"] += sum(courses, "ects"); r.sws += sum(courses, "sws"); });
  p.groups.forEach((g) => { r[groupColor(g)] = (r[groupColor(g)] || 0) + groupTotal(g, "ects"); r.sws += groupTotal(g, "sws"); });
  r.ects = r.core + r.spec + r.minor + r.elec;
  return r;
}

const semesters = () => Array.from({ length: prog.semesters }, (_, i) => i + 1);
const perSemester = () => prog.ectsTotal / prog.semesters;

/* ---------- Render ---------- */

function render(animate) {
  document.querySelectorAll(".pills").forEach((g) => g.querySelectorAll(".pill").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === sel[g.dataset.key]))));
  renderNotes();
  renderOverview();
  semesters().forEach((s) => renderSlot(s, animate));
}

const RING = 94.25; // circumference of r = 15

function renderOverview() {
  const box = $("#overview");
  box.setAttribute("aria-label", t("a11y.semesters"));
  const first = !box.children.length;
  box.style.setProperty("--n", prog.semesters);
  box.classList.toggle("many", prog.semesters > 4);
  semesters().forEach((s, i) => {
    const r = totals(s);
    if (first) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "sem-card" + (reduceMotion ? "" : " enter");
      card.style.setProperty("--i", i);
      card.dataset.sem = s;
      card.dataset.tip = "semester";
      const seg = (k) => `<circle class="seg ${k}" cx="18" cy="18" r="15" fill="none" stroke-width="5" transform="rotate(-90 18 18)" stroke-dasharray="0 ${RING}"/>`;
      card.innerHTML = `<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15" fill="none" stroke-width="5"/>
        ${["core", "spec", "minor", "elec"].map(seg).join("")}</svg>
        <span><small>${esc(t("sem.title", { n: s }))}</small><b></b><em class="per-day">${icon("clock")}<span></span></em></span>`;
      card.addEventListener("click", () => document.getElementById("sem-" + s).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }));
      box.appendChild(card);
    }
    const card = box.querySelector(`[data-sem="${s}"]`);
    let start = 0;
    ["core", "spec", "minor", "elec"].forEach((k) => {
      const len = (r[k] || 0) / (r.ects || 1) * RING;
      const el = $(`.seg.${k}`, card);
      el.setAttribute("stroke-dasharray", `${Math.max(0, len - 1.2).toFixed(2)} ${RING}`);
      el.setAttribute("stroke-dashoffset", (-start).toFixed(2));
      el.style.opacity = len > 0.5 ? "1" : "0";
      start += len;
    });
    countTo($("b", card), r.ects, (v) => `${fmt(v)} ECTS`);
    $(".per-day span", card).textContent = t("sem.perDay", { n: half(perDay(hoursOf(r.ects, r.sws).total)) });
    card.classList.toggle("off", Math.abs(r.ects - perSemester()) > 0.01);
    const head = $(`#sem-${s} .sum`);
    countTo(head && $(".sum-v", head), r.ects, (v) => `${fmt(v)} ECTS`);
  });

  const choosable = semesters().flatMap(groupsIn).filter((g) => g.options.length);
  const need = choosable.reduce((a, g) => a + (isBudget(g) ? 1 : g.choose - (ownOption(g) ? 1 : 0)), 0);
  const have = choosable.reduce((a, g) => a + (isBudget(g) ? (isFull(g) ? 1 : 0) : pickedOptions(g).length - (ownOption(g) ? 1 : 0)), 0);
  const info = $("#picks-info");
  if (!need) { info.innerHTML = ""; return; }
  if (!$(".have", info)) {
    const label = t("sem.picked", { have: '<span class="have"></span>', need: '<span class="need"></span>' });
    info.innerHTML = `${icon("star")}<span data-tip="text" data-text="${esc(t("sem.pickedHint"))}" tabindex="0">${label}</span>`;
  }
  countTo($(".have", info), have, (v) => String(Math.round(v)));
  $(".need", info).textContent = need;
}

function buildSemesters() {
  $("#semesters").innerHTML = semesters().map((s) => {
    const warns = prog.notes.filter((n) => n.semester === s);
    return `<section class="semester" id="sem-${s}" aria-labelledby="sem-${s}-t">
      <div class="sem-head">
        <h2 id="sem-${s}-t">${esc(t("sem.title", { n: s }))}</h2>
        <button class="sum" type="button" data-tip="semester" data-sem="${s}"><span class="sum-v"></span>${warns.length ? `<span class="warn-ico" data-tip="semnote" data-sem="${s}" aria-label="${esc(t("sem.note"))}">${icon("alert")}</span>` : ""}</button>
      </div>
      <div class="slot"></div>
    </section>`;
  }).join("");
  $("#picks-info").innerHTML = "";
  if (!$("#semesters").dataset.bound) {
    $("#semesters").dataset.bound = "1";
    $("#semesters").addEventListener("click", onSemesterClick);
  }
}

function onSemesterClick(e) {
  const course = e.target.closest(".course");
  if (course && e.target.closest(".row") && !e.target.closest("[data-tip]") && !String(window.getSelection() || "")) {
    setOpen(course, !course.classList.contains("open"));
    hideTip(true);
    return;
  }
  const opt = e.target.closest(".opt");
  if (opt && !opt.disabled) { togglePick(opt.dataset.group, opt.dataset.opt); return; }
  const clear = e.target.closest(".clear");
  if (clear) {
    const g = prog.groups.find((x) => x.id === clear.dataset.group);
    picks[pickKey(g)] = [];
    afterPick(g);
  }
}

function slotHtml(s) {
  const p = semesterParts(s);
  let html = "";
  p.tracks.forEach(({ track, courses }, i) => {
    if (!courses.length) return;
    const cls = i ? "minor" : "spec";
    html += `<div class="group"><h3 class="group-head ${cls}">${icon(trackIcon(optionName(track.key)))}${esc(optionName(track.key))}</h3>
      <div class="rows">${courses.map((c) => rowHtml(c, cls)).join("")}</div></div>`;
  });
  const slotsCore = p.groups.filter((g) => !g.options.length && g.compulsory);
  if (p.core.length || slotsCore.length) {
    html += `<div class="group"><h3 class="group-head">${icon("users")}${esc(t("sem.everyone"))}</h3>
      <div class="rows">${p.core.map((c) => rowHtml(c, "core")).join("")}</div>
      ${slotsCore.length ? `<div class="cards" style="margin-top:8px">${slotsCore.map(slotCardHtml).join("")}</div>` : ""}</div>`;
  }
  const rest = p.groups.filter((g) => !(g.compulsory && !g.options.length));
  rest.filter((g) => !g.options.length).forEach((g) => { html += groupHtml(g); });
  // Choices (electives, master project, …): one entry each; it folds out to show the options to pick from.
  const choices = rest.filter((g) => g.options.length);
  if (choices.length) {
    html += `<div class="group"><h3 class="group-head elec">${icon("star")}${esc(t("sem.choices"))}</h3>
      <div class="rows">${choices.map(choiceHtml).join("")}</div></div>`;
  }
  return html;
}

// Allowed absence: class time = SWS × 14 teaching weeks (as everywhere in the app). Rounded DOWN to halves, so the
// app never promises more absence than the rule allows. One session a week → whole sessions, also rounded down.
const NO_ATTENDANCE_TYPES = new Set(["BP", "DP", "MP"]);
const floorHalf = (x) => { const r = Math.floor(x * 2 + 1e-9) / 2; const i = Math.floor(r); return (i ? String(i) : r ? "" : "0") + (r - i ? "½" : ""); };
function absenceHtml(c) {
  if (!(c.sws > 0) || NO_ATTENDANCE_TYPES.has(c.type)) return "";
  const lessons = lessonsOf(c.sws);
  const row = (p) => {
    const miss = Math.floor(lessons * (1 - p / 100) + 1e-9);          // whole lessons, rounded down
    return `<li><span class="abs-p">${p} %</span><span>${t("course.absenceRow", {
      u: `<b>${miss}</b>`, h: floorHalf(miss * LESSON_H), n: Math.floor(TEACHING_WEEKS * (1 - p / 100) + 1e-9), w: TEACHING_WEEKS })}</span></li>`;
  };
  return `<div class="absence"><h4 class="first">${esc(t("course.absence"))}</h4><ul>${row(75)}${row(50)}</ul>
    <p class="facts">${esc(t("course.absenceNote", { sws: fmt(c.sws), w: TEACHING_WEEKS, u: fmt(lessons), total: floorHalf(classHours(c.sws)) }))}</p></div>`;
}

// A course: one line with short facts (each explained in a tooltip); a click folds out the details.
// The facts are repeated in words inside the details, so one tab stop per course is enough.
function rowHtml(c, cls) {
  const key = c.code;
  const open = openSet.has(key);
  const id = "d-" + key.replace(/[^\w-]/g, "");
  return `<div class="course ${cls} ${open ? "open" : ""}" data-key="${esc(key)}">
    <div class="row">
      <i class="stripe"></i>
      <button class="row-title" type="button" aria-expanded="${open}" aria-controls="${id}" data-code="${esc(c.code)}">${esc(c.title)}</button>
      <span class="chip" data-tip="type" data-type="${esc(c.type)}">${esc(c.type)}</span>
      <span class="num sws" data-tip="sws" data-v="${c.sws}">${fmt(c.sws)} SWS</span>
      <span class="num assess" data-tip="assess" data-v="${esc(c.assessment)}">${esc(c.assessment === "final" ? t("course.exam") : t("course.cont"))}</span>
      <span class="num hours" data-tip="hours" data-ects="${c.ects}" data-sws="${c.sws}">${esc(t("course.hours", { n: hoursOf(c.ects, c.sws).total }))}</span>
      <span class="num ects" data-tip="ects" data-v="${c.ects}">${fmt(c.ects)} ECTS</span>
      <svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </div>
    <div class="details" id="${id}"><div><div class="inner">
      ${absenceHtml(c)}
      ${c.content ? `<h4 class="${absenceHtml(c) ? "" : "first"}">${esc(t("course.content"))}</h4><p>${esc(c.content)}</p>` : ""}
      ${c.learningOutcome ? `<h4>${esc(t("course.outcome"))}</h4><p>${esc(c.learningOutcome)}</p>` : ""}
      <p class="meta">${esc(c.module)} · ${esc(c.sourceCode || c.code)} · ${esc(w(c.language))}</p>
    </div></div></div>
  </div>`;
}

function ruleText(g) {
  if (!g.options.length) return "";
  if (isBudget(g)) return t("group.budget", { n: fmt(g.budget) });
  if (g.linkedTrack) return g.choose - 1 === 1 ? t("group.linkedOne") : t("group.linkedN", { n: g.choose - 1 });
  return g.choose === 1 ? t("group.pickOne") : t("group.pickN", { n: g.choose });
}

function groupHtml(g) {
  const head = `<h3 class="group-head ${groupColor(g) === "spec" ? "spec" : "elec"}">${icon(groupColor(g) === "spec" ? "compass" : "star")}${esc(g.label)}</h3>`;
  return `<div class="group">${head}<div class="cards">${slotCardHtml(g)}</div></div>`;
}

// Option label without the group's name in front ("Master Project - Development - FILM" → "Development - FILM").
function shortLabel(g, o) {
  const m = o.label.match(new RegExp(`^${g.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–:·]\\s*`, "i"));
  return m ? o.label.slice(m[0].length) : o.label;
}

// What the folded entry shows: the picks, or what is left to pick.
function choiceSummary(g) {
  const picked = pickedOptions(g);
  const names = picked.map((o) => esc(shortLabel(g, o))).join(", ");
  if (!picked.length) return `<span class="todo">${esc(ruleText(g))}</span>`;
  if (isFull(g)) return names;
  const left = isBudget(g) ? null : g.choose - picked.length;
  return `${names} <span class="todo">· ${esc(left ? t("group.left", { n: left }) : ruleText(g))}</span>`;
}

function choiceHtml(g) {
  const color = groupColor(g) === "spec" ? "spec" : "elec";
  const picked = pickedOptions(g);
  const own = ownOption(g);
  const key = "g:" + g.id;
  const open = openSet.has(key);
  const id = "d-" + key.replace(/[^\w-]/g, "");
  const opts = own ? [own, ...g.options.filter((o) => o !== own)] : g.options;
  const multi = g.choose > 1 || isBudget(g);
  return `<div class="course choice ${color} ${open ? "open" : ""} ${isFull(g) ? "full" : ""} ${picked.length ? "" : "empty"}" data-key="${esc(key)}" data-group="${g.id}">
    <div class="row">
      <i class="stripe"></i>
      <button class="row-title" type="button" aria-expanded="${open}" aria-controls="${id}">${esc(g.label)}<small class="pick-sum">${choiceSummary(g)}</small></button>
      <span class="num ects">${fmt(groupTotal(g, "ects"))} ECTS</span>
      <svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </div>
    <div class="details" id="${id}"><div><div class="inner">
      ${g.note ? `<p class="choice-note">${esc(g.note)}</p>` : ""}
      <div class="opts" role="group" aria-label="${esc(g.label)}">${opts.map((o) => {
        const on = picked.includes(o);
        const n = o.courses.length;
        return `<button class="opt ${multi ? "multi" : ""}" type="button" role="checkbox" aria-checked="${on}" ${own === o ? "disabled" : ""}
            data-group="${g.id}" data-opt="${esc(o.id)}" data-tip="option">
          <span class="box">${icon("check")}</span>
          <span class="lbl">${esc(shortLabel(g, o))}${own === o ? `<span class="tag">${esc(t("group.yourMajor"))}</span>` : ""}${n > 1 ? `<small>${esc(t("group.courses", { n }))}</small>` : ""}</span>
          <span class="e">${fmt(optionTotal(o, "ects"))} ECTS</span>
        </button>`;
      }).join("")}</div>
      <div class="clear-wrap ${picked.length - (own ? 1 : 0) > 0 ? "show" : ""}"><div><button class="clear" type="button" data-group="${g.id}">${esc(t("group.clear"))}</button></div></div>
    </div></div></div>
  </div>`;
}

function slotCardHtml(g) {
  return `<div class="slot-card" ${g.note ? `tabindex="0" data-tip="group" data-group="${g.id}"` : ""}><span class="lbl">${esc(g.label)}</span><span class="e">${fmt(g.ects)} ECTS</span></div>`;
}

function renderSlot(s, animate) {
  const slot = $(`#sem-${s} .slot`);
  const html = slotHtml(s);
  if (slot.dataset.html === html) return;
  slot.dataset.html = html;
  if (!animate || reduceMotion) { slot.innerHTML = html; return; }

  const PARTS = ".course, .opt, .slot-card, .group-head";
  const old = slot.querySelectorAll(PARTS);
  old.forEach((r) => r.classList.add("leave"));
  setTimeout(() => {
    const from = slot.offsetHeight;
    slot.innerHTML = html;
    const to = slot.scrollHeight;
    slot.classList.add("sizing");
    slot.style.height = from + "px";
    void slot.offsetHeight;
    slot.style.height = to + "px";
    slot.addEventListener("transitionend", function done(ev) {
      if (ev.propertyName !== "height") return;
      slot.style.height = "";
      slot.classList.remove("sizing");
      slot.removeEventListener("transitionend", done);
    });
    slot.querySelectorAll(PARTS).forEach((r, i) => { r.style.setProperty("--i", Math.min(i, 12)); r.classList.add("enter"); });
  }, old.length ? 160 : 0);
}

/* ---------- Picking electives ---------- */

// Series: the same choice in several semesters, recognised from the data (no extra field needed). Groups with the same
// label and onlyFor in different semesters whose options end in the same area – e.g. MMA Master "Master Project -
// Development - FILM" … "Master Project - Release - FILM". Picking an area carries it to the LATER semesters that are
// still empty or still followed the old area; a semester chosen differently on purpose is left alone.
const areaOf = (o) => { const p = (o?.label || "").split(/\s+[-–]\s+/); return p.length > 1 ? p[p.length - 1].trim() : null; };
const areaKey = (o) => areaOf(o)?.toLowerCase() ?? null;
function seriesOf(g) {
  if (g.sync || g.budget != null || g.choose !== 1) return [];
  const mine = new Set(g.options.map(areaKey).filter(Boolean));
  if (mine.size < 2) return [];
  return prog.groups.filter((x) => x !== g && x.label === g.label && x.semester > g.semester && x.choose === 1 && !x.sync
    && x.budget == null && JSON.stringify(x.onlyFor) === JSON.stringify(g.onlyFor) && x.options.filter((o) => mine.has(areaKey(o))).length >= 2);
}
function followSeries(g, before) {
  const now = pickedOptions(g)[0];
  const others = seriesOf(g);
  if (!now || !others.length) return;
  const prevId = (before[pickKey(g)] || [])[0];
  const prevArea = prevId ? areaKey(g.options.find((o) => o.id === prevId)) : null;
  const changed = [];
  others.forEach((x) => {
    const cur = pickedOptions(x)[0];
    if (cur && (areaKey(cur) === areaKey(now) || areaKey(cur) !== prevArea)) return;
    const match = x.options.find((o) => areaKey(o) === areaKey(now));
    if (!match) return;
    picks[pickKey(x)] = [match.id];
    changed.push(x);
  });
  if (!changed.length) return;
  changed.forEach(afterPick);
  const sems = new Intl.ListFormat(lang === "de" ? "de" : "en", { type: "conjunction" }).format(changed.map((x) => String(x.semester)).sort());
  toast(t("series.applied", { area: areaOf(now), sems }), t("share.undo"), () => {
    changed.forEach((x) => { picks[pickKey(x)] = [...(before[pickKey(x)] || [])]; afterPick(x); });
  });
}

function togglePick(gid, oid) {
  const g = prog.groups.find((x) => x.id === gid);
  const before = JSON.parse(JSON.stringify(picks));
  const own = ownOption(g);
  if (own && own.id === oid) return;
  const slots = g.choose - (own ? 1 : 0);
  let list = (picks[pickKey(g)] || []).filter((id) => id !== (own && own.id));
  if (list.includes(oid)) list = list.filter((id) => id !== oid);
  else if (isBudget(g)) {
    list.push(oid);
    const ects = (ids) => ids.reduce((a, id) => a + optionTotal(g.options.find((o) => o.id === id), "ects"), 0);
    while (list.length > 1 && ects(list) > g.budget + 0.01) list.shift();
  } else {
    list.push(oid);
    while (list.length > slots) list.shift();
  }
  picks[pickKey(g)] = list;
  afterPick(g);
  followSeries(g, before);
  // One to pick and now picked: the entry folds up a moment later and shows the pick.
  if (!isBudget(g) && slots === 1 && list.includes(oid)) {
    const el = document.querySelector(`.choice[data-group="${g.id}"]`);
    setTimeout(() => { if (el && el.isConnected && isFull(g)) setOpen(el, false); }, reduceMotion ? 0 : 420);
  }
}

function setOpen(course, open) {
  course.classList.toggle("open", open);
  $(".row-title", course).setAttribute("aria-expanded", String(open));
  open ? openSet.add(course.dataset.key) : openSet.delete(course.dataset.key);
  remember();
}

function afterPick(first) {
  prog.groups.filter((g) => pickKey(g) === pickKey(first)).forEach((g) => {
    const el = document.querySelector(`.choice[data-group="${g.id}"]`);
    if (!el) return;
    const picked = pickedOptions(g).map((o) => o.id);
    el.classList.toggle("full", isFull(g));
    el.classList.toggle("empty", !picked.length);
    $(".pick-sum", el).innerHTML = choiceSummary(g);
    $(".num.ects", el).textContent = `${fmt(groupTotal(g, "ects"))} ECTS`;
    el.querySelectorAll(".opt").forEach((o) => o.setAttribute("aria-checked", String(picked.includes(o.dataset.opt))));
    const clear = $(".clear-wrap", el);
    if (clear) clear.classList.toggle("show", picked.length - (ownOption(g) ? 1 : 0) > 0);
  });
  remember();
  renderOverview();
}

/* ---------- Tooltips: one shared element, content built on demand ---------- */

const tip = () => $("#tip");
let tipFor = null, showTimer = null, hideTimer = null, warm = false;
const typeName = (type) => (L10N["legend.types"] || {})[type] || index.legend.types[type] || t("course.typeUnknown");
const assessName = (a) => (L10N["legend.assessment"] || {})[a] || index.legend.assessment[a] || a;

function tipContent(el) {
  const d = el.dataset;
  switch (d.tip) {
    case "type": return { small: true, html: esc(typeName(d.type)) };
    case "sws": return { small: true, html: esc(t("course.sws", { n: fmt(lessonsOf(+d.v)), h: half(classHours(+d.v)) })) };
    case "assess": return { small: true, html: esc(assessName(d.v)) };
    case "ects": return { small: true, html: esc(t("course.ectsTip")) };
    case "hours": {
      const h = hoursOf(+d.ects, +d.sws);
      return { small: true, html: esc(t("course.hoursTip", { total: h.total, class: h.inClass, self: h.self })) };
    }
    case "programme": {
      const b = prog.source.brochure;
      // Degree and department are not repeated: they are the subtitle right under the title.
      return `<b class="t-title">${esc(t("prog.facts", { mode: w(prog.mode), language: w(prog.language), semesters: prog.semesters, ects: prog.ectsTotal }))}</b>
        <span class="t-muted">${(() => {
          const all = semesters().map(totals).reduce((x, r) => ({ ects: x.ects + r.ects, sws: x.sws + r.sws }), { ects: 0, sws: 0 });
          const h = hoursOf(all.ects, all.sws);
          const n = (v) => v.toLocaleString(lang === "de" ? "de-AT" : "en");
          return esc(t("prog.hours", { total: n(h.total), class: n(h.inClass) }));
        })()}</span>
        <span class="t-meta">${esc(t("prog.source", { date: prettyDate(prog.dataAsOf), checked: checkedNote() }))}${b ? esc(t("prog.sourceBrochure", { version: b.version })) : ""}</span>`;
    }
    case "semester": {
      const s = +d.sem, r = totals(s);
      const line = (color, label, v) => (v ? `<span class="t-line"><span><i style="background:${color}"></i>${esc(label)}</span><span>${fmt(v)} ECTS</span></span>` : "");
      const h = hoursOf(r.ects, r.sws);
      const dayLine = (color, label, hours) => `<span class="t-line"><span><i style="background:${color}"></i>${esc(label)}</span><span>${esc(t("sem.dayLine", { day: half(perDay(hours)), total: hours }))}</span></span>`;
      return `<b class="t-title">${esc(t("sem.dayTitle", { title: t("sem.term", { season: season(s), sws: fmt(r.sws) }), total: h.total }))}</b>
        ${dayLine("var(--accent)", t("sem.inClass"), h.inClass)}
        ${dayLine("var(--core)", t("sem.own"), h.self)}
        <span class="t-sep"></span>
        ${line("var(--core)", t("sem.everyone"), r.core)}
        ${prog.tracks.map((tr, i) => line(i ? "var(--minor)" : "var(--accent)", optionName(tr.key), i ? r.minor : r.spec)).join("")}
        ${line("var(--elec)", t("sem.electives"), r.elec)}
        <span class="t-meta">${esc(t("sem.assumption", { teach: half(r.sws * LESSON_H / DAYS) }))}</span>`;
    }
    case "notes": return prog.notes.filter((n) => !n.semester && matches(n.onlyFor)).map((n) => `<p>${esc(n.text)}</p>`).join("");
    case "semnote": return prog.notes.filter((n) => n.semester === +d.sem).map((n) => `<p>${esc(n.text)}</p>`).join("");
    case "group": { const g = prog.groups.find((x) => x.id === d.group); return esc(g.note || ""); }   // the name is on the card
    case "option": {
      const g = prog.groups.find((x) => x.id === d.group);
      const o = g.options.find((x) => x.id === d.opt);
      const cs = o.courses.map(byCode);
      if (cs.length === 1) {
        const c = cs[0];
        const text = c.content.length > 220 ? c.content.slice(0, 220).replace(/\s+\S*$/, "") + "…" : c.content;
        const h = hoursOf(c.ects, c.sws);
        // The title is on the option itself → only the facts and the content
        return `<span class="t-meta" style="margin:0 0 6px">${esc(typeName(c.type))} · ${fmt(c.sws)} SWS · ${esc(t("course.hours", { n: h.total }))} · ${esc(assessName(c.assessment))}</span>${text ? `<span class="t-muted">${esc(text)}</span>` : ""}`;
      }
      return `<ul class="t-flush">${cs.map((c) => `<li>${esc(c.title)} · ${fmt(c.ects)} ECTS</li>`).join("")}</ul>`;
    }
    case "saved": return esc(navigator.onLine ? t("status.saved") : t("status.offline"));
    case "prog": { const p = findProgramme(d.id); return { small: true, html: esc(`${w(p.degree)} · ${w(p.mode)} · ${w(p.language)} · ${p.semesters} ${semWord()}`) }; }
    case "text": return esc(d.text);
  }
  return "";
}

function showTip(el) {
  clearTimeout(hideTimer);
  const tEl = tip();
  let content;
  try { content = tipContent(el); } catch { content = ""; } // e.g. an element of a programme that is just being replaced
  const small = typeof content === "object" && content.small;
  if (typeof content === "object") content = content.html;
  if (!content) return;
  tEl.innerHTML = content;
  tEl.className = "tip" + (small ? " small" : "");
  tEl.style.transform = tEl.style.opacity = tEl.style.transition = "";   // rest of a swipe
  tipFor = el;
  el.setAttribute("aria-describedby", "tip");

  const sheet = !canHover && window.matchMedia("(max-width: 900px)").matches;
  if (sheet) {
    tEl.classList.add("sheet");
  } else {
    const r = el.getBoundingClientRect();
    const wdt = tEl.offsetWidth, h = tEl.offsetHeight;
    const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--top"), 10) || 64;
    const above = r.top - h - 12 > top + 4;
    const anchorX = r.left + Math.min(r.width / 2, 120);
    const left = Math.max(12, Math.min(window.innerWidth - wdt - 12, anchorX - wdt / 2));
    tEl.style.left = left + "px";
    tEl.style.top = (above ? r.top - h - 10 : r.bottom + 10) + "px";
    tEl.style.setProperty("--ax", Math.max(16, Math.min(wdt - 16, anchorX - left)) + "px");
    tEl.classList.add(above ? "above" : "below");
  }
  void tEl.offsetWidth;
  tEl.classList.add("show");
  warm = true;
}

function hideTip(now) {
  clearTimeout(showTimer);
  const tEl = tip();
  if (!tEl) return;
  const go = () => {
    tEl.classList.remove("show");
    if (tipFor) tipFor.removeAttribute("aria-describedby");
    tipFor = null;
    setTimeout(() => { if (!tipFor) warm = false; }, 300);
  };
  if (now) go(); else hideTimer = setTimeout(go, 80);
}

function initTips() {
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch" || !canHover) return;   // touch screens: stray mouse events while scrolling
    const el = e.target.closest("[data-tip]");
    if (!el || el === tipFor) return;
    clearTimeout(showTimer);
    // Only after resting on an element; while one is already open, the next follows a little faster.
    showTimer = setTimeout(() => showTip(el), warm ? 250 : 650);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch" || !canHover) return;   // touch screens: stray mouse events while scrolling
    const el = e.target.closest("[data-tip]");
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    clearTimeout(showTimer);
    if (el === tipFor) hideTip(false);
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && el.matches(":focus-visible")) showTip(el);
  });
  document.addEventListener("focusout", (e) => { if (e.target.closest("[data-tip]") === tipFor) hideTip(false); });
  document.addEventListener("click", (e) => {
    if (canHover) return;
    if (e.target.closest("#tip")) return;            // a tap on the card itself keeps it open
    const el = e.target.closest("[data-tip]");
    // On touch, labels of actions (share) and the facts behind a programme link are noise: the tap already acts.
    if (!el || el.dataset.tip === "prog" || el.hasAttribute("data-touch-silent")) { hideTip(true); return; }
    if (el === tipFor) { hideTip(true); return; }
    showTip(el);
  });
  window.addEventListener("scroll", () => { if (tipFor && canHover) hideTip(true); }, { passive: true });
  initSheetSwipe();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(true); });
}

// Touch: the card at the bottom follows the finger down; far or fast enough and it slides away, otherwise it springs back.
function initSheetSwipe() {
  const el = tip();
  let id = null, y0 = 0, dy = 0, last = 0, lastT = 0;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || !el.classList.contains("sheet") || !el.classList.contains("show") || id !== null) return;
    id = e.pointerId; dy = 0;
    y0 = last = e.clientY; lastT = e.timeStamp;
    try { el.setPointerCapture(id); } catch {}
    el.style.transition = "none";
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const raw = e.clientY - y0;
    dy = raw > 0 ? raw : raw / 6;                         // upwards only a little resistance
    if (e.timeStamp - lastT > 40) { last = e.clientY; lastT = e.timeStamp; }
    el.style.transform = `translateY(${dy}px)`;
    el.style.opacity = String(Math.max(0.35, 1 - Math.max(0, dy) / (el.offsetHeight * 1.6)));
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    const v = (e.clientY - last) / Math.max(1, e.timeStamp - lastT);   // px per ms over the last bit of the move
    if (dy > Math.min(90, el.offsetHeight * 0.35) || (v > 0.45 && dy > 12)) {
      const ms = reduceMotion ? 1 : Math.round(Math.max(140, Math.min(300, (el.offsetHeight + 24 - dy) / Math.max(v, 0.9))));
      el.style.transition = `transform ${ms}ms cubic-bezier(.2,.7,.3,1), opacity ${ms}ms ease-out`;
      el.style.transform = `translateY(${el.offsetHeight + 24}px)`;
      el.style.opacity = "0";
      setTimeout(() => { hideTip(true); el.style.transition = "none"; }, ms);
    } else if (dy) {
      el.style.transition = "transform .45s var(--spring), opacity .25s ease-out";
      el.style.transform = "";
      el.style.opacity = "";
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

init();
