"use strict";

/* Curriculum Compass — plain JS, no build step. All URLs are relative, so it runs on any static host. */

const STORE_KEY = "curriculum-compass";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let index;          // data/index.json
let prog;           // the programme shown
let sel = {};       // selected track options, e.g. { major: "film", minor: "ai" }
let picks = {};     // picked elective options of this programme: { groupId: [optionId, …] }
let openSet = new Set(); // expanded courses of this programme
const cache = {};

const $ = (s) => document.querySelector(s);
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString("en", { maximumFractionDigits: 1 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const season = (s) => (s % 2 ? "Winter" : "Summer");
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
const CHECK = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- Local storage: everything the viewer chooses ---------- */

function readStore() {
  try {
    const st = JSON.parse(localStorage.getItem(STORE_KEY));
    if (st) return st;
    // Take over the selections saved by the earlier "CT Study Planner".
    const old = JSON.parse(localStorage.getItem("ct-study-planner"));
    return old ? { last: old.last, sel: old.sel || {} } : {};
  } catch { return {}; }
}
let store = readStore();
["sel", "picks", "open", "scroll"].forEach((k) => { store[k] = store[k] || {}; });

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
  }, 150);
}
function rememberProgramme() {
  store.last = prog.id;
  store.sel[prog.id] = sel;
  store.picks[prog.id] = picks;
  store.open[prog.id] = [...openSet];
  persist();
}

/* ---------- URL: #/<programme>/<track option>/<track option> ---------- */

const allProgrammes = () => index.departments.flatMap((d) => d.programmes.map((p) => ({ ...p, dept: d })));
const findProgramme = (id) => allProgrammes().find((p) => p.id === id);

function readHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length) return null;
  // Links from the first version used #film, #audio … for the MultiMediaArt master.
  if (parts.length === 1 && !findProgramme(parts[0])) return { id: "mma-m", opts: parts };
  return { id: parts[0], opts: parts.slice(1) };
}
function writeHash() {
  const opts = prog.tracks.map((t) => sel[t.key]);
  history.replaceState(null, "", "#/" + [prog.id, ...opts].join("/"));
}

/* ---------- Boot ---------- */

async function init() {
  try {
    index = await (await fetch("data/index.json")).json();
  } catch {
    $("#asof").textContent = "Could not load the curriculum data.";
    return;
  }
  buildMenu();
  const h = readHash();
  const id = h && findProgramme(h.id) ? h.id : findProgramme(store.last) ? store.last : "mma-m";
  await openProgramme(id, h && h.id === id ? h.opts : null, false);

  window.addEventListener("hashchange", async () => {
    const hh = readHash();
    if (!hh || !findProgramme(hh.id)) return;
    if (hh.id !== prog.id) await openProgramme(hh.id, hh.opts, true);
    else applyOpts(hh.opts);
  });
  window.addEventListener("resize", () => { document.querySelectorAll(".segmented").forEach(moveThumb); moveRailThumb(); });
  window.addEventListener("scroll", () => {
    if (!prog) return;
    store.scroll[prog.id] = Math.round(window.scrollY);
    persist();
  }, { passive: true });

  const setOnline = () => document.body.classList.toggle("is-offline", !navigator.onLine);
  window.addEventListener("online", setOnline);
  window.addEventListener("offline", setOnline);
  setOnline();
  registerOffline();
}

// Service worker: keeps the app and every curriculum available without internet.
function registerOffline() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
    const urls = allProgrammes().map((p) => new URL(p.file, location.href).href);
    reg.active && reg.active.postMessage({ type: "precache", urls });
  }).catch(() => { /* offline mode not available here */ });
}

async function getProgramme(id) {
  if (!cache[id]) cache[id] = await (await fetch(findProgramme(id).file)).json();
  return cache[id];
}

async function openProgramme(id, opts, animate) {
  const data = await getProgramme(id);
  const page = $("#page");
  if (animate && !reduceMotion) {
    page.classList.remove("in");
    page.classList.add("out");
    await wait(180);
  }
  prog = data;
  const stored = store.sel[id] || {};
  sel = {};
  prog.tracks.forEach((t, i) => {
    const ids = t.options.map((o) => o.id);
    const fromUrl = opts && opts[i];
    sel[t.key] = ids.includes(fromUrl) ? fromUrl : ids.includes(stored[t.key]) ? stored[t.key] : ids[0];
  });
  picks = { ...(store.picks[id] || {}) };
  openSet = new Set(store.open[id] || []);

  buildHeader();
  buildPickers();
  buildLegend();
  $("#overview").innerHTML = "";
  buildSemesters();
  render(false);
  updateMenu();
  writeHash();
  rememberProgramme();

  const y = store.scroll[id] || 0;
  if (animate) {
    page.classList.remove("out");
    if (!reduceMotion) { void page.offsetWidth; page.classList.add("in"); }
  }
  window.scrollTo({ top: y, behavior: "auto" });
}

function applyOpts(opts) {
  let changed = false;
  prog.tracks.forEach((t, i) => {
    if (opts[i] && t.options.some((o) => o.id === opts[i]) && sel[t.key] !== opts[i]) { sel[t.key] = opts[i]; changed = true; }
  });
  if (changed) { render(true); rememberProgramme(); }
}

/* ---------- Navigation: departments rail + programmes + search ---------- */

let railDept = null;

function buildMenu() {
  const rail = $("#rail");
  rail.innerHTML = `<span class="rail-thumb" aria-hidden="true"></span>` + index.departments.map((d) =>
    `<button type="button" role="tab" data-dept="${d.id}" aria-selected="false">${esc(d.name)}<small>${d.programmes.length}</small></button>`).join("");
  rail.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) showDept(b.dataset.dept, true);
  });
  rail.addEventListener("keydown", (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const ids = index.departments.map((d) => d.id);
    const next = ids[(ids.indexOf(railDept) + keys[e.key] + ids.length) % ids.length];
    showDept(next, true);
    rail.querySelector(`[data-dept="${next}"]`).focus();
  });

  const sw = $("#switcher");
  sw.addEventListener("click", () => toggleMenu(sw.getAttribute("aria-expanded") !== "true"));
  $("#scrim").addEventListener("click", () => toggleMenu(false));
  $("#programmes").addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item) return;
    toggleMenu(false);
    if (item.dataset.id !== prog.id) openProgramme(item.dataset.id, null, true);
  });
  const search = $("#search");
  search.addEventListener("input", () => renderSearch(search.value));
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); $("#programmes .menu-item")?.focus(); }
    if (e.key === "Enter") { e.preventDefault(); $("#programmes .menu-item")?.click(); }
  });
  document.addEventListener("keydown", (e) => {
    if (sw.getAttribute("aria-expanded") !== "true") return;
    if (e.key === "Escape") { toggleMenu(false); sw.focus(); return; }
    const items = [...document.querySelectorAll("#programmes .menu-item")];
    const at = items.indexOf(document.activeElement);
    if (at >= 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (e.key === "ArrowUp" && at === 0) { search.focus(); return; }
      items[Math.min(items.length - 1, at + (e.key === "ArrowDown" ? 1 : -1))].focus();
    }
  });
}

function itemHtml(p, i, query) {
  const name = query ? highlight(p.name, query) : esc(p.name);
  const meta = [p.degree.startsWith("Joint") ? "Joint degree" : null, p.mode, p.language, `${p.semesters} semesters`].filter(Boolean).join(" · ");
  return `<button class="menu-item ${reduceMotion ? "" : "enter"}" type="button" data-id="${p.id}" style="--i:${i}" aria-current="${prog && p.id === prog.id}">
    <b><i></i><em>${name}</em></b><span>${query ? esc(p.dept.name) + " · " : ""}${esc(meta)}</span></button>`;
}

function listHtml(list, query) {
  let i = 0;
  return [["Bachelor", (p) => p.degree.startsWith("Bachelor")], ["Master", (p) => !p.degree.startsWith("Bachelor")]]
    .map(([label, test]) => {
      const items = list.filter(test);
      return items.length ? `<div class="menu-group"><h3>${label}</h3>${items.map((p) => itemHtml(p, i++, query)).join("")}</div>` : "";
    }).join("");
}

function showDept(id, animate) {
  railDept = id;
  document.querySelectorAll("#rail button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dept === id)));
  moveRailThumb(!animate);
  const dept = index.departments.find((d) => d.id === id);
  const list = allProgrammes().filter((p) => p.dept.id === id);
  let html = listHtml(list, "");
  if (dept.missing && dept.missing.length) {
    html += `<div class="menu-group"><h3>Not included yet</h3>${dept.missing.map((m) => `<p class="menu-empty" style="padding:4px 12px">${esc(m.name)} — ${esc(m.reason)}</p>`).join("")}</div>`;
  }
  $("#programmes").innerHTML = html;
  $("#programmes").scrollTop = 0;
}

function moveRailThumb(instant) {
  const thumb = $(".rail-thumb");
  const b = railDept && document.querySelector(`#rail [data-dept="${railDept}"]`);
  if (!thumb || !b) return;
  if (instant) thumb.style.transition = "none";
  const horizontal = getComputedStyle($("#rail")).display === "flex";
  thumb.style.opacity = "1";
  if (horizontal) {
    thumb.style.width = b.offsetWidth + "px";
    thumb.style.height = "";
    thumb.style.transform = `translateX(${b.offsetLeft}px)`;
  } else {
    thumb.style.width = "";
    thumb.style.height = b.offsetHeight + "px";
    thumb.style.transform = `translateY(${b.offsetTop}px)`;
  }
  if (instant) { void thumb.offsetWidth; thumb.style.transition = ""; }
}

function highlight(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
}

function renderSearch(q) {
  q = q.trim();
  if (!q) { showDept(railDept, false); return; }
  const words = q.toLowerCase().split(/\s+/);
  const hits = allProgrammes().filter((p) => {
    const hay = `${p.name} ${p.degree} ${p.mode} ${p.language} ${p.dept.name}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  $(".rail-thumb").style.opacity = "0";
  document.querySelectorAll("#rail button").forEach((b) => b.setAttribute("aria-selected", "false"));
  $("#programmes").innerHTML = hits.length ? listHtml(hits, words.length === 1 ? q : "") : `<p class="menu-empty">No programme matches “${esc(q)}”.</p>`;
}

function toggleMenu(open) {
  const menu = $("#menu");
  $("#switcher").setAttribute("aria-expanded", String(open));
  $("#scrim").classList.toggle("show", open);
  menu.classList.toggle("open", open);
  if (open) {
    $("#search").value = "";
    showDept(prog.department, false);
    setTimeout(() => {
      moveRailThumb(true);
      const current = $('#programmes .menu-item[aria-current="true"]') || $("#programmes .menu-item");
      // Focus the search on wide screens; on phones that would pop up the keyboard.
      (window.matchMedia("(min-width: 641px)").matches ? $("#search") : current)?.focus({ preventScroll: true });
    }, 30);
  }
}

function updateMenu() {
  $("#switcher-degree").textContent = `${prog.degree} · ${deptName()}`;
  $("#switcher-name").textContent = prog.name;
  document.title = `${prog.name} (${prog.degree}) · Curriculum Compass`;
}

const deptName = () => index.departments.find((d) => d.id === prog.department).name;

/* ---------- Header, pickers, legend ---------- */

function buildHeader() {
  $("#title").textContent = prog.name;
  $("#eyebrow").textContent = `${prog.degree} · ${deptName()} · FH Salzburg`;
  $("#chips").innerHTML = [prog.mode, `Taught in ${prog.language}`, `${prog.semesters} semesters`, `${prog.ectsTotal} ECTS`]
    .map((c) => `<li>${esc(c)}</li>`).join("");
  const date = new Date(prog.dataAsOf + "T12:00:00");
  const pretty = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  $("#asof").innerHTML = `Data as of <strong><time datetime="${prog.dataAsOf}">${pretty}</time></strong>`;
  const b = prog.source.brochure;
  $("#source").innerHTML = `Source: <a href="${esc(prog.source.curriculum)}">curriculum page</a>` +
    (b ? ` and <a href="${esc(b.url)}">programme brochure</a> (version ${esc(b.version)})` : "") + " of FH Salzburg.";
  $("#json-link").href = `data/${prog.id}.json`;
}

function buildPickers() {
  const box = $("#pickers");
  box.innerHTML = prog.tracks.map((t, i) => `
    <section class="picker ${i ? "minor" : ""}" aria-label="${esc(t.label)}">
      <h2 class="label" id="picker-${t.key}">Your ${esc(t.label.toLowerCase())}${t.fromSemester > 1 ? ` <small>· from semester ${t.fromSemester}</small>` : ""}</h2>
      <div class="segmented ${t.options.length > 3 ? "four" : ""}" role="radiogroup" aria-labelledby="picker-${t.key}" data-key="${t.key}">
        <span class="thumb" aria-hidden="true"></span>
        ${t.options.map((o) => `<button type="button" role="radio" data-id="${o.id}">${esc(o.name)}</button>`).join("")}
      </div>
    </section>`).join("");
  box.querySelectorAll(".segmented").forEach((seg) => {
    const key = seg.dataset.key;
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) selectTrack(key, b.dataset.id);
    });
    seg.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const ids = [...seg.querySelectorAll("button")].map((b) => b.dataset.id);
      const next = ids[(ids.indexOf(sel[key]) + keys[e.key] + ids.length) % ids.length];
      selectTrack(key, next);
      seg.querySelector(`button[data-id="${next}"]`).focus();
    });
    const thumb = seg.querySelector(".thumb");
    thumb.style.transition = "none";
    moveThumb(seg);
    void thumb.offsetWidth;
    thumb.style.transition = "";
  });
}

function selectTrack(key, id) {
  if (sel[key] === id) return;
  sel[key] = id;
  writeHash();
  rememberProgramme();
  render(true);
}

function moveThumb(seg) {
  const btn = seg.querySelector(`button[data-id="${sel[seg.dataset.key]}"]`) || seg.querySelector("button");
  const thumb = seg.querySelector(".thumb");
  thumb.style.width = btn.offsetWidth + "px";
  thumb.style.height = btn.offsetHeight + "px";
  thumb.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
}

function buildLegend() {
  const l = index.legend;
  const used = [...new Set(prog.courses.map((c) => c.type))].sort();
  const rows = [["SWS", l.sws], ["ECTS", l.ects], ["Semesters", l.semester], ...used.map((t) => [t, l.types[t] || "Not defined in the source legend"])];
  $("#legend").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

/* ---------- Data helpers ---------- */

const byCode = (code) => prog.courses.find((c) => c.code === code);
const sum = (list, key) => list.reduce((a, c) => a + c[key], 0);
const matches = (cond) => !cond || Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.includes(sel[k]) : sel[k] === v));
const trackOf = (key) => prog.tracks.find((t) => t.key === key);
const optionName = (key) => trackOf(key).options.find((o) => o.id === sel[key]).name;
const groupsIn = (s) => prog.groups.filter((g) => g.semester === s && matches(g.onlyFor));
const optionTotal = (o, key) => sum(o.courses.map(byCode), key);
const pickKey = (g) => g.sync || g.id; // groups with the same sync share their picks across semesters
const isTrackGroup = (g) => Boolean(g.onlyFor || g.linkedTrack);
const groupColor = (g) => (g.compulsory ? "core" : isTrackGroup(g) ? "spec" : "elec");
const isBudget = (g) => g.budget != null && g.options.length > 0;
const pickedEcts = (g) => pickedOptions(g).reduce((a, o) => a + optionTotal(o, "ects"), 0);
const isFull = (g) => (isBudget(g) ? pickedEcts(g) >= g.budget - 0.01 : pickedOptions(g).length >= g.choose);
const ownOption = (g) => g.linkedTrack && g.options.find((o) => o.track && o.track[g.linkedTrack] === sel[g.linkedTrack]);

// Options the viewer picked in a group (the own major's option of a linked group always counts).
function pickedOptions(g) {
  const own = ownOption(g);
  const ids = (picks[pickKey(g)] || []).filter((id) => g.options.some((o) => o.id === id) && (!own || id !== own.id));
  const chosen = ids.map((id) => g.options.find((o) => o.id === id));
  if (g.budget != null) return chosen;
  return own ? [own, ...chosen].slice(0, g.choose) : chosen.slice(0, g.choose);
}

// ECTS/SWS a group adds: the picked options, and for choices still open the largest remaining option.
function groupTotal(g, key) {
  if (!g.options.length) return g[key] || 0;
  // "Courses worth N ECTS": the budget counts, whatever is picked.
  if (isBudget(g)) return key === "ects" ? g.budget : g.budgetSws ?? pickedOptions(g).reduce((a, o) => a + optionTotal(o, key), 0);
  const picked = pickedOptions(g);
  const rest = g.options.filter((o) => !picked.includes(o)).map((o) => optionTotal(o, key)).sort((a, b) => b - a);
  return picked.reduce((a, o) => a + optionTotal(o, key), 0) + rest.slice(0, g.choose - picked.length).reduce((a, b) => a + b, 0);
}

function semesterParts(s) {
  const inSem = prog.courses.filter((c) => c.semester === s && !c.group);
  return {
    core: inSem.filter((c) => !c.track),
    tracks: prog.tracks.map((t) => ({ track: t, courses: inSem.filter((c) => c.track && c.track[t.key] && matches(c.track)) })),
    groups: groupsIn(s),
  };
}

function totals(s) {
  const p = semesterParts(s);
  const t = { core: sum(p.core, "ects"), spec: 0, minor: 0, elec: 0, sws: sum(p.core, "sws") };
  p.tracks.forEach(({ courses }, i) => {
    t[i ? "minor" : "spec"] += sum(courses, "ects");
    t.sws += sum(courses, "sws");
  });
  p.groups.forEach((g) => {
    t[{ core: "core", spec: "spec", elec: "elec" }[groupColor(g)]] += groupTotal(g, "ects");
    t.sws += groupTotal(g, "sws");
  });
  t.ects = t.core + t.spec + t.minor + t.elec;
  return t;
}

const semesters = () => Array.from({ length: prog.semesters }, (_, i) => i + 1);

/* ---------- Render ---------- */

function render(animate) {
  document.querySelectorAll(".segmented").forEach((seg) => {
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === sel[seg.dataset.key])));
    moveThumb(seg);
  });
  renderNote();
  renderOverview();
  semesters().forEach((s) => renderSlot(s, animate));
}

function renderNote() {
  const notes = prog.notes.filter((n) => !n.semester && matches(n.onlyFor));
  const note = $("#note");
  if (notes.length) {
    $("#note-text").innerHTML = notes.map((n) => `<p>${esc(n.text)}</p>`).join("");
    note.classList.add("show");
  } else {
    note.classList.remove("show");
  }
}

function renderOverview() {
  const box = $("#overview");
  const first = !box.children.length;
  let allEcts = 0, allSws = 0;

  semesters().forEach((s, i) => {
    const t = totals(s);
    allEcts += t.ects;
    allSws += t.sws;
    if (first) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.dataset.sem = s;
      card.innerHTML = `<h3>Semester ${s}</h3><span class="season">${season(s)} term</span>
        <div class="figures"><div class="fig"><b data-k="ects">0</b><span>ECTS</span></div><div class="fig"><b data-k="sws">0</b><span>SWS</span></div></div>
        <div class="bar"><i class="core"></i><i class="spec"></i><i class="minor"></i><i class="elec"></i></div>`;
      card.addEventListener("click", () => document.getElementById("sem-" + s).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }));
      if (!reduceMotion) { card.classList.add("enter"); card.style.setProperty("--i", i); }
      box.appendChild(card);
    }
    const card = box.querySelector(`[data-sem="${s}"]`);
    card.classList.toggle("off", Math.abs(t.ects - prog.ectsTotal / prog.semesters) > 0.01);
    setNumber(card.querySelector('[data-k="ects"]'), t.ects);
    setNumber(card.querySelector('[data-k="sws"]'), t.sws);
    ["core", "spec", "minor", "elec"].forEach((k) => { card.querySelector(".bar ." + k).style.flexGrow = t[k]; });
    $(`#sem-${s} [data-k="sum"]`).textContent = `${season(s)} term · ${fmt(t.ects)} ECTS · ${fmt(t.sws)} SWS`;
  });

  if (first) {
    const total = document.createElement("div");
    total.className = "card total";
    total.innerHTML = `<h3>Whole programme</h3><span class="season">${prog.semesters} semesters</span>
      <div class="figures"><div class="fig"><b data-k="ects">0</b><span>ECTS</span></div><div class="fig"><b data-k="sws">0</b><span>SWS</span></div></div>`;
    if (!reduceMotion) { total.classList.add("enter"); total.style.setProperty("--i", prog.semesters); }
    box.appendChild(total);
  }
  const total = box.querySelector(".total");
  setNumber(total.querySelector('[data-k="ects"]'), allEcts);
  setNumber(total.querySelector('[data-k="sws"]'), allSws);

  const key = [`<span><i class="dot core"></i>Everyone</span>`];
  prog.tracks.forEach((t, i) => key.push(`<span><i class="dot ${i ? "minor" : "spec"}"></i>Your ${esc(t.label.toLowerCase())}</span>`));
  if (prog.groups.some((g) => groupColor(g) === "elec")) key.push(`<span><i class="dot elec"></i>Electives</span>`);
  $("#key").innerHTML = key.join("");

  // How many choices are made — totals use the picks, open choices count with the largest option.
  const choosable = semesters().flatMap(groupsIn).filter((g) => g.options.length);
  const need = choosable.reduce((a, g) => a + (isBudget(g) ? 1 : g.choose - (ownOption(g) ? 1 : 0)), 0);
  const have = choosable.reduce((a, g) => a + (isBudget(g) ? (isFull(g) ? 1 : 0) : pickedOptions(g).length - (ownOption(g) ? 1 : 0)), 0);
  $("#picks-info").textContent = need ? `${have} of ${need} electives picked${have < need ? " · open choices count with the largest option" : ""}` : "";
}

// Counts from the old to the new value once, then stops.
function setNumber(el, value) {
  const from = parseFloat(el.dataset.v || "0");
  el.dataset.v = value;
  if (reduceMotion || from === value) { el.textContent = fmt(value); return; }
  const start = performance.now(), dur = 600;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (value - from) * e);
    if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(value);
  };
  requestAnimationFrame(step);
}

function buildSemesters() {
  const root = $("#semesters");
  root.innerHTML = "";
  semesters().forEach((s) => {
    const p = semesterParts(s);
    const warns = prog.notes.filter((n) => n.semester === s);
    const sec = document.createElement("section");
    sec.className = "semester";
    sec.id = "sem-" + s;
    sec.setAttribute("aria-labelledby", `sem-${s}-title`);
    sec.innerHTML = `<div class="semester-head"><h2 id="sem-${s}-title">Semester ${s}</h2><p data-k="sum"></p></div>
      ${warns.map((w) => `<p class="warn"><strong>Note:</strong> ${esc(w.text)}</p>`).join("")}
      ${p.core.length ? `<div class="group"><h3><i class="dot core"></i>For everyone</h3><div class="list">${p.core.map((c) => courseHtml(c, "core")).join("")}</div></div>` : ""}
      <div class="slot"></div>`;
    root.appendChild(sec);
  });
  if (!root.dataset.bound) {
    root.dataset.bound = "1";
    root.addEventListener("click", onSemesterClick);
  }
}

function onSemesterClick(e) {
  const pick = e.target.closest(".pick");
  if (pick) { togglePick(pick.dataset.group, pick.dataset.opt); return; }
  const clear = e.target.closest("[data-clear]");
  if (clear) {
    const g = prog.groups.find((x) => x.id === clear.dataset.clear);
    picks[pickKey(g)] = [];
    afterPick(g.id);
    return;
  }
  const btn = e.target.closest(".course > button");
  if (!btn) return;
  const course = btn.parentElement;
  const open = course.classList.toggle("open");
  btn.setAttribute("aria-expanded", String(open));
  open ? openSet.add(course.dataset.key) : openSet.delete(course.dataset.key);
  rememberProgramme();
}

function togglePick(gid, oid) {
  const g = prog.groups.find((x) => x.id === gid);
  const own = ownOption(g);
  if (own && own.id === oid) return;
  const slots = g.choose - (own ? 1 : 0);
  let list = (picks[pickKey(g)] || []).filter((id) => id !== (own && own.id));
  if (list.includes(oid)) list = list.filter((id) => id !== oid);
  else if (isBudget(g)) {
    list.push(oid);
    const ects = (ids) => ids.reduce((a, id) => a + optionTotal(g.options.find((o) => o.id === id), "ects"), 0);
    while (list.length > 1 && ects(list) > g.budget + 0.01) list.shift(); // the oldest pick makes room
  } else {
    list.push(oid);
    while (list.length > slots) list.shift(); // the oldest pick makes room
  }
  picks[pickKey(g)] = list;
  afterPick(gid);
}

// Updates the picked state in place (no re-render, so open courses stay open) and the totals.
function afterPick(gid) {
  const first = prog.groups.find((x) => x.id === gid);
  prog.groups.filter((g) => pickKey(g) === pickKey(first)).forEach((g) => {
  const el = document.querySelector(`.group[data-group="${g.id}"]`);
  if (el) {
    const picked = pickedOptions(g).map((o) => o.id);
    el.dataset.full = String(isFull(g));
    el.querySelectorAll(".opt").forEach((o) => { o.dataset.picked = String(picked.includes(o.dataset.opt)); });
    el.querySelectorAll(".pick").forEach((b) => b.setAttribute("aria-checked", String(picked.includes(b.dataset.opt))));
    el.querySelector(".group-state").innerHTML = groupStateHtml(g);
    el.querySelector("[data-k=rule]").textContent = ruleText(g);
  }
  });
  rememberProgramme();
  renderOverview();
}

function ruleText(g) {
  const ects = groupTotal(g, "ects");
  if (!g.options.length) return `· ${fmt(ects)} ECTS`;
  if (isBudget(g)) return `· choose courses worth ${fmt(g.budget)} ECTS`;
  if (g.linkedTrack) return `· yours plus ${g.choose - 1 === 1 ? "one more" : g.choose - 1 + " more"}, ${fmt(ects)} ECTS`;
  return `· choose ${g.choose === 1 ? "one" : g.choose}${g.open ? "" : ` of ${g.options.length}`}, ${fmt(ects)} ECTS`;
}

function groupStateHtml(g) {
  if (!g.options.length) return "";
  if (isBudget(g)) {
    const e = pickedEcts(g);
    return e ? `${isFull(g) ? "picked" : `${fmt(e)} of ${fmt(g.budget)} ECTS picked`} <button type="button" data-clear="${g.id}">Clear</button>` : "not picked yet";
  }
  const own = ownOption(g) ? 1 : 0;
  const n = pickedOptions(g).length - own, need = g.choose - own;
  if (!n) return "not picked yet";
  return `${n === need ? "picked" : `${n} of ${need} picked`} <button type="button" data-clear="${g.id}">Clear</button>`;
}

function slotHtml(s) {
  const p = semesterParts(s);
  let html = "";
  p.tracks.forEach(({ track, courses }, i) => {
    if (!courses.length) return;
    const color = i ? "minor" : "spec";
    html += `<div class="group"><h3><i class="dot ${color}"></i>${esc(optionName(track.key))} <small>· your ${esc(track.label.toLowerCase())}</small></h3>
      <div class="list">${courses.map((c) => courseHtml(c, color)).join("")}</div></div>`;
  });
  p.groups.forEach((g) => {
    const color = groupColor(g);
    const picked = pickedOptions(g);
    html += `<div class="group" data-group="${g.id}" data-full="${g.options.length > 0 && isFull(g)}" style="--pick-color:var(--${color})">
      <h3><i class="dot ${color}"></i>${esc(g.label)} <small data-k="rule">${ruleText(g)}</small><span class="group-state">${groupStateHtml(g)}</span></h3>
      ${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ""}
      <div class="list">${groupRows(g, color, picked)}</div></div>`;
  });
  return html;
}

function pickButton(g, o, checked, locked) {
  const square = g.choose > 1 || isBudget(g);
  return `<button type="button" class="pick ${square ? "square" : ""}" role="checkbox" aria-checked="${checked}" ${locked ? "disabled" : ""}
    data-group="${g.id}" data-opt="${esc(o.id)}" aria-label="Pick ${esc(o.label)}">${CHECK}</button>`;
}

function groupRows(g, color, picked) {
  if (!g.options.length) {
    return `<div class="placeholder"><span class="stripe" style="background:var(--${color})"></span>
      <span class="title">${esc(g.label)}</span><span class="meta sws">${fmt(g.sws || 0)} SWS</span><span class="meta">${fmt(g.ects)} ECTS</span></div>`;
  }
  const own = ownOption(g);
  const opts = own ? [own, ...g.options.filter((o) => o !== own)] : g.options;
  const bundled = g.linkedTrack || opts.some((o) => o.courses.length > 1);
  return opts.map((o) => {
    const isPicked = picked.includes(o);
    const isOwn = own === o;
    const courses = o.courses.map(byCode);
    if (!bundled) {
      return `<div class="pickable opt" data-opt="${esc(o.id)}" data-picked="${isPicked}">${pickButton(g, o, isPicked, false)}${courseHtml(courses[0], color)}</div>`;
    }
    return `<div class="opt" data-opt="${esc(o.id)}" data-picked="${isPicked}">
      <div class="subhead">${pickButton(g, o, isPicked, isOwn)}${esc(o.label)} ${isOwn ? `<span class="tag">Your major</span>` : ""}<small>${fmt(optionTotal(o, "ects"))} ECTS</small></div>
      ${courses.map((c) => courseHtml(c, color)).join("")}</div>`;
  }).join("");
}

function renderSlot(s, animate) {
  const slot = document.querySelector(`#sem-${s} .slot`);
  const html = slotHtml(s);
  if (slot.dataset.html === html) return;
  slot.dataset.html = html;

  if (!animate || reduceMotion) { slot.innerHTML = html; return; }

  // Old rows slide away, the slot glides to its new height, new rows slide in.
  const ROWS = ".course, .subhead, .placeholder, .group-note, h3, .pick";
  const rows = slot.querySelectorAll(ROWS);
  rows.forEach((r) => r.classList.add("leave"));
  setTimeout(() => {
    const from = slot.offsetHeight;
    slot.innerHTML = html;
    const to = slot.scrollHeight;
    slot.style.height = from + "px";
    void slot.offsetHeight;
    slot.style.height = to + "px";
    slot.addEventListener("transitionend", function done(ev) {
      if (ev.propertyName !== "height") return;
      slot.style.height = "";
      slot.removeEventListener("transitionend", done);
    });
    slot.querySelectorAll(".course, .subhead, .placeholder, .group-note, h3").forEach((r, i) => {
      r.style.setProperty("--i", Math.min(i, 12));
      r.classList.add("enter");
    });
  }, rows.length ? 160 : 0);
}

function courseHtml(c, color) {
  const typeName = index.legend.types[c.type] || c.type;
  const assess = index.legend.assessment[c.assessment] || c.assessment;
  const key = c.code + "-" + color;
  const open = openSet.has(key);
  return `<div class="course ${open ? "open" : ""}" data-key="${esc(key)}">
    <button type="button" aria-expanded="${open}" aria-controls="d-${esc(key)}">
      <span class="stripe" style="background:var(--${color})"></span>
      <span class="title">${esc(c.title)}</span>
      <span class="type" title="${esc(typeName)}">${esc(c.type)}</span>
      <span class="meta sws">${fmt(c.sws)} SWS</span>
      <span class="meta">${fmt(c.ects)} ECTS</span>
      <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="details" id="d-${esc(key)}"><div><div class="inner">
      <ul class="facts">
        <li><b>${esc(typeName)}</b></li>
        <li>${fmt(c.sws)} SWS · ${fmt(c.ects)} ECTS</li>
        <li>${esc(assess)}</li>
        <li>${esc(c.language)}</li>
        <li>Module: ${esc(c.module)}</li>
        <li>Code ${esc(c.code)}</li>
      </ul>
      ${c.content ? `<h4>Content</h4><p>${esc(c.content)}</p>` : ""}
      ${c.learningOutcome ? `<h4>Learning outcome</h4><p>${esc(c.learningOutcome)}</p>` : ""}
    </div></div></div>
  </div>`;
}

init();
