import * as api from "./api.js";
import { MODULE_PATH } from "./config.js";
import { lineChart, barChart, donut, radar, empty } from "./charts.js";
import { openLab, resetLab } from "./lab.js";

const $ = (sel) => document.querySelector(sel);

// Charts that need redrawing when the window resizes
let redraws = [];

init();

function init() {
  $("#login-form").addEventListener("submit", onLogin);
  $("#toggle-pass").addEventListener("click", togglePassword);
  $("#logout").addEventListener("click", () => logout());
  window.addEventListener("hashchange", route);

  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => redraws.forEach((draw) => draw(false)), 150);
  });

  if (api.tokenIsValid(api.getToken())) showProfile();
  else showLogin();
}

/* ---------- Login / logout ---------- */

function showLogin(message) {
  api.clearToken();
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
  setError(message);
  $("#identifier").focus();
}

function setError(message) {
  const box = $("#login-error");
  box.textContent = message || "";
  box.hidden = !message;
}

async function onLogin(e) {
  e.preventDefault();
  const identifier = $("#identifier").value.trim();
  const password = $("#password").value;

  if (!identifier || !password) {
    setError("Enter your username or email and your password.");
    return;
  }

  const btn = $("#login-btn");
  btn.disabled = true;
  btn.textContent = "Logging in…";
  setError();

  try {
    await api.signin(identifier, password);
    $("#password").value = "";
    showProfile();
  } catch (err) {
    setError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Log in";
  }
}

function togglePassword() {
  const input = $("#password");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#toggle-pass").textContent = show ? "Hide" : "Show";
  $("#toggle-pass").setAttribute("aria-pressed", show);
}

function logout(message) {
  redraws = [];
  resetLab();
  history.replaceState(null, "", location.pathname);
  showLogin(message);
}

/* ---------- Pages: profile or query lab ---------- */

function route() {
  if ($("#app-view").hidden) return;
  const lab = location.hash === "#/lab";

  $("#lab-view").hidden = !lab;
  document.querySelector(".dash").hidden = lab;
  $(lab ? "#tab-profile" : "#tab-lab").removeAttribute("aria-current");
  $(lab ? "#tab-lab" : "#tab-profile").setAttribute("aria-current", "page");

  if (lab) openLab(api.getUserId(api.getToken()), MODULE_PATH);
  // Charts drawn while hidden have the wrong width, so redraw them
  else redraws.forEach((draw) => draw(false));
}

/* ---------- Profile ---------- */

async function showProfile() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#banner").hidden = true;
  redraws = [];
  setLoading();
  route();

  const userId = api.getUserId(api.getToken());

  // Quick check that the token still works
  try {
    await api.gql(api.QUERIES.whoami);
  } catch (err) {
    if (err instanceof api.AuthError) return logout("Your session ended. Log in again to continue.");
    return showBanner(`Couldn't load your data: ${err.message}`);
  }

  const results = await Promise.allSettled([
    api.gql(api.QUERIES.profile, { id: userId, path: MODULE_PATH }),
    api.gql(api.QUERIES.xp, { path: MODULE_PATH }),
    api.gql(api.QUERIES.skills),
    api.gql(api.QUERIES.projects),
    api.gql(api.QUERIES.piscine),
    api.gql(api.QUERIES.audits, { id: userId }),
  ]);

  if (results.some((r) => r.reason instanceof api.AuthError)) {
    return logout("Your session ended. Log in again to continue.");
  }

  const [profile, xp, skills, projects, piscine, audits] = results;
  section(profile, renderProfile, ["#chart-audit"]);
  section(xp, renderXP, ["#chart-xp-time", "#chart-xp-project"]);
  section(skills, renderSkills, ["#chart-skills"]);
  section(projects, renderProjects, ["#chart-projects"]);
  section(piscine, renderPiscine, ["#chart-piscine"]);
  section(audits, renderAudits, []);
}

// Draw one part of the page, or explain why it couldn't load
function section(result, render, slots) {
  let msg;
  if (result.status === "fulfilled") {
    try {
      render(result.value);
      return;
    } catch (err) {
      console.error(err);
      msg = "Something went wrong drawing this part.";
    }
  } else {
    console.error(result.reason);
    msg = `Couldn't load this part: ${result.reason.message}`;
  }
  slots.forEach((s) => empty($(s), msg));
}

function setLoading() {
  document.querySelectorAll("[data-slot]").forEach((box) => empty(box, "Loading…"));
  ["#feed-xp", "#feed-projects", "#legend-audit", "#legend-projects", "#chips", "#piscine-chips"]
    .forEach((s) => $(s).replaceChildren());
  ["#audit-note", "#audits-given"].forEach((s) => ($(s).hidden = true));
}

function showBanner(msg) {
  $("#banner").textContent = msg;
  $("#banner").hidden = false;
}

// Register a chart and draw it right away
function addChart(draw) {
  redraws.push(draw);
  draw(true);
}

/* ---------- Sections ---------- */

function renderProfile({ user, level, xp }) {
  const u = user[0];
  const a = u.attrs || {};
  const first = a.firstName || "";
  const full = `${first} ${a.lastName || ""}`.trim() || u.login;

  $("#hello").textContent = first ? `Welcome back, ${first}` : "Welcome back";
  $("#name").textContent = full;
  $("#handle").textContent = `@${u.login}`;
  $("#avatar").textContent = initials(full);

  const chips = [
    u.campus && capitalize(u.campus),
    u.createdAt && `Joined ${monthYear(u.createdAt)}`,
    a.email,
  ].filter(Boolean);
  $("#chips").replaceChildren(...chips.map((t) => li(t)));

  $("#level-num").textContent = level[0]?.amount ?? 0;
  $("#stat-xp").textContent = fmtXP(xp.aggregate.sum.amount || 0);

  // Audit ratio
  const up = u.totalUp || 0;
  const down = u.totalDown || 0;
  const ratio = u.auditRatio ?? (down ? up / down : 0);
  $("#stat-ratio").textContent = ratio.toFixed(1);

  if (!up && !down) {
    empty($("#chart-audit"), "No audits yet.");
    return;
  }

  donut($("#chart-audit"), [
    { label: "Done", value: up, cls: "seg-mint", text: fmtXP(up) },
    { label: "Received", value: down, cls: "seg-gum", text: fmtXP(down) },
  ], { center: ratio.toFixed(1), sub: "ratio", label: `Audit ratio ${ratio.toFixed(1)}` });

  $("#legend-audit").replaceChildren(
    legendItem("Done", fmtXP(up), "var(--mint)"),
    legendItem("Received", fmtXP(down), "var(--gum)"),
  );

  $("#audit-note").textContent = ratioNote(ratio);
  $("#audit-note").hidden = false;
}

function renderXP({ transaction: rows }) {
  if (!rows.length) {
    const msg = "No XP yet. Finish an exercise and it'll show up here.";
    empty($("#chart-xp-time"), msg);
    empty($("#chart-xp-project"), msg);
    return;
  }

  // Running total for the line chart
  let sum = 0;
  const points = rows.map((r) => ({
    date: Date.parse(r.createdAt),
    value: (sum += r.amount),
    amount: r.amount,
    name: r.object?.name ?? lastPart(r.path),
  }));
  addChart((animate) => lineChart($("#chart-xp-time"), points, { fmt: fmtXP, animate }));

  // Add up XP per project
  const perProject = new Map();
  for (const r of rows) {
    if (r.object?.type !== "project") continue;
    perProject.set(r.object.name, (perProject.get(r.object.name) || 0) + r.amount);
  }
  const top = [...perProject]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  if (top.length) {
    addChart(() => barChart($("#chart-xp-project"), top, { fmt: fmtXP, cls: "bar-grape", label: "XP by project" }));
  } else {
    empty($("#chart-xp-project"), "No project XP yet.");
  }

  // Latest gains, newest first
  const recent = rows.slice(-8).reverse();
  $("#feed-xp").replaceChildren(...recent.map((r) =>
    feedItem(r.object?.name ?? lastPart(r.path), fullDate(r.createdAt), textEl("span", `+${fmtXP(r.amount)}`, "amt")),
  ));
}

function renderSkills({ transaction: rows }) {
  // Keep the best amount for each skill
  const best = new Map();
  for (const r of rows) {
    const key = r.type.replace(/^skill_/, "");
    best.set(key, Math.max(best.get(key) || 0, r.amount));
  }

  const skills = [...best]
    .map(([key, value]) => ({ label: skillName(key), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  if (skills.length) {
    $("#stat-skill").textContent = `${skills[0].value}%`;
    $("#stat-skill-note").textContent = capitalize(skills[0].label);
  }

  if (skills.length < 3) {
    empty($("#chart-skills"), "Your skills chart shows up once you've earned at least three skills.");
    return;
  }
  radar($("#chart-skills"), skills, "Your skills");
}

function renderProjects({ progress: rows }) {
  // Rows are newest first, so the first one per path is the latest result
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.path)) latest.set(r.path, r);
  const list = [...latest.values()];

  const passed = list.filter((r) => r.grade >= 1).length;
  const failed = list.length - passed;

  $("#stat-projects").textContent = passed;
  $("#stat-projects-note").textContent = `Out of ${list.length} graded`;

  if (!list.length) {
    empty($("#chart-projects"), "No graded projects yet.");
    return;
  }

  donut($("#chart-projects"), [
    { label: "Passed", value: passed, cls: "seg-mint" },
    { label: "Not passed", value: failed, cls: "seg-gum" },
  ], { center: String(passed), sub: "passed", label: `${passed} of ${list.length} projects passed` });

  $("#legend-projects").replaceChildren(
    legendItem("Passed", passed, "var(--mint)"),
    legendItem("Not passed", failed, "var(--gum)"),
  );

  $("#feed-projects").replaceChildren(...list.slice(0, 6).map((r) => {
    const ok = r.grade >= 1;
    const badge = textEl("span", ok ? "Passed" : "Not passed", `badge ${ok ? "badge-pass" : "badge-fail"}`);
    return feedItem(r.object?.name ?? lastPart(r.path), fullDate(r.updatedAt), badge);
  }));
}

function renderPiscine({ result: rows }) {
  // Group attempts by exercise
  const exercises = new Map();
  for (const r of rows) {
    if (r.grade === null) continue;
    const ex = exercises.get(r.path) || {
      name: r.object?.name ?? lastPart(r.path),
      piscine: piscineName(r.path),
      tries: 0,
      passed: false,
    };
    ex.tries++;
    if (r.grade >= 1) ex.passed = true;
    exercises.set(r.path, ex);
  }

  const all = [...exercises.values()];
  if (!all.length) {
    empty($("#chart-piscine"), "No piscine results found.");
    return;
  }

  // One summary chip per piscine
  const groups = new Map();
  for (const ex of all) {
    const g = groups.get(ex.piscine) || { pass: 0, fail: 0 };
    ex.passed ? g.pass++ : g.fail++;
    groups.set(ex.piscine, g);
  }
  $("#piscine-chips").replaceChildren(...[...groups].map(([name, g]) =>
    li(`${name}: ${g.pass} passed, ${g.fail} not yet`),
  ));

  const hardest = all
    .sort((a, b) => b.tries - a.tries)
    .slice(0, 10)
    .map((ex) => ({ label: ex.name, value: ex.tries, sub: ex.piscine }));

  const tries = (n) => `${n} ${n === 1 ? "try" : "tries"}`;
  addChart(() => barChart($("#chart-piscine"), hardest, { fmt: tries, cls: "bar-lemon", label: "Exercises with the most tries" }));
}

function renderAudits({ audit: rows }) {
  if (!rows.length) return;
  const pass = rows.filter((r) => r.grade >= 1).length;
  const word = rows.length === 1 ? "project" : "projects";
  $("#audits-given").textContent = `You've audited ${rows.length} ${word}: ${pass} passed, ${rows.length - pass} failed.`;
  $("#audits-given").hidden = false;
}

/* ---------- Small helpers ---------- */

// Same units the platform uses (1 kB = 1000)
function fmtXP(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)} kB`;
  return `${Math.round(n)} B`;
}

function ratioNote(r) {
  if (r >= 1.5) return "You give way more than you take. Your peers thank you.";
  if (r >= 1) return "Nicely balanced. Keep it up.";
  if (r >= 0.8) return "Almost there. One or two more audits will tip it over 1.";
  return "Your ratio is low. Doing a few audits will bring it back up.";
}

const SKILL_NAMES = { prog: "programming", algo: "algorithms", "front-end": "front end", "back-end": "back end", "sys-admin": "sys admin" };
const skillName = (key) => SKILL_NAMES[key] || key.replace(/[-_]/g, " ");

const piscineName = (path) => path.split("/").find((p) => p.includes("piscine")) || "piscine";
const lastPart = (path) => path.split("/").filter(Boolean).pop() || path;
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fullDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const monthYear = (d) => new Date(d).toLocaleDateString(undefined, { month: "long", year: "numeric" });

function textEl(tag, str, cls) {
  const node = document.createElement(tag);
  node.textContent = str;
  if (cls) node.className = cls;
  return node;
}

const li = (str) => textEl("li", str);

function legendItem(label, value, color) {
  const item = document.createElement("li");
  const sw = textEl("span", "", "swatch");
  sw.style.background = color;
  item.append(sw, textEl("span", label), textEl("span", String(value), "val"));
  return item;
}

function feedItem(name, meta, right) {
  const item = document.createElement("li");
  const main = textEl("div", "", "feed-main");
  main.append(textEl("span", name, "name"), textEl("span", meta, "meta"));
  item.append(main, right);
  return item;
}
