// Turns the data from each query into the parts of the profile page

import {
  $, tag, empty, fmtXP, fullDate, monthYear, capitalize, initials, nameOf, topItems,
  legendItem, feedItem, keepDrawn, lineChart, barChart, donut, radar,
} from "./ui.js";

// Player card, level, total XP and audits

// Fills the player card, the level, total XP and the audit panel
export function renderProfile({ user, level, xp }) {
  const u = user[0];
  const info = u.attrs || {};
  const name = `${info.firstName || ""} ${info.lastName || ""}`.trim() || u.login;

  $("#hello").textContent = info.firstName ? `Welcome back, ${info.firstName}` : "Welcome back";
  $("#name").textContent = name;
  $("#handle").textContent = `@${u.login}`;
  $("#avatar").textContent = initials(name);
  $("#level-num").textContent = level[0]?.amount ?? 0;
  $("#stat-xp").textContent = fmtXP(xp.aggregate.sum.amount || 0);

  // Only shows chips we actually have data for
  const chips = [u.createdAt && `Joined ${monthYear(u.createdAt)}`, info.email];
  $("#chips").replaceChildren(...chips.filter(Boolean).map((t) => tag("li", t)));

  renderAuditRatio(u);
}

// Audit ratio is the XP you gave by auditing divided by the XP others gave by auditing you
function renderAuditRatio(u) {
  const done = u.totalUp || 0;
  const received = u.totalDown || 0;
  const ratio = (u.auditRatio ?? (received ? done / received : 0)).toFixed(1);
  $("#stat-ratio").textContent = ratio;

  if (!done && !received) return empty($("#chart-audit"), "No audits yet.");

  donut($("#chart-audit"), [
    { label: "Done", value: done, cls: "seg-mint", text: fmtXP(done) },
    { label: "Received", value: received, cls: "seg-gum", text: fmtXP(received) },
  ], ratio, "ratio");

  $("#legend-audit").replaceChildren(
    legendItem("Done", fmtXP(done), "var(--mint)"),
    legendItem("Received", fmtXP(received), "var(--gum)"),
  );
  $("#audit-note").textContent = ratioNote(ratio);
  $("#audit-note").hidden = false;
}

// A friendly line under the donut depending on the ratio
function ratioNote(ratio) {
  if (ratio >= 1.5) return "You give way more than you take. Your peers thank you.";
  if (ratio >= 1) return "Nicely balanced. Keep it up.";
  if (ratio >= 0.8) return "Almost there. One or two more audits will tip it over 1.";
  return "Your ratio is low. Doing a few audits will bring it back up.";
}

// Counts the audits you did and how many of those projects passed
export function renderAudits({ audit }) {
  if (!audit.length) return;
  const passed = audit.filter((a) => a.grade >= 1).length;
  const word = audit.length === 1 ? "project" : "projects";
  $("#audits-given").textContent = `You've audited ${audit.length} ${word}: ${passed} passed, ${audit.length - passed} failed.`;
  $("#audits-given").hidden = false;
}

// XP line, XP by project and latest XP

// Builds the XP line chart, the XP by project bars and the latest XP list
export function renderXP({ transaction: rows }) {
  if (!rows.length) {
    empty($("#chart-xp-time"), "No XP yet. Finish an exercise and it'll show up here.");
    empty($("#chart-xp-project"), "No project XP yet.");
    return;
  }

  // Rows come oldest first, so we keep a running total as we go
  let total = 0;
  const points = rows.map((r) => ({ date: Date.parse(r.createdAt), amount: r.amount, total: (total += r.amount), name: nameOf(r) }));
  keepDrawn((animate) => lineChart($("#chart-xp-time"), points, animate));

  // Adds up the XP of each project, exercises are skipped, then keeps the top 12
  const perProject = {};
  for (const r of rows) {
    if (r.object?.type === "project") perProject[r.object.name] = (perProject[r.object.name] || 0) + r.amount;
  }
  const top = topItems(perProject, 12);
  if (top.length) keepDrawn(() => barChart($("#chart-xp-project"), top, fmtXP, "bar-grape", "XP by project"));
  else empty($("#chart-xp-project"), "No project XP yet.");

  // The last 8 gains, newest on top
  const latest = rows.slice(-8).reverse();
  $("#feed-xp").replaceChildren(...latest.map((r) => feedItem(nameOf(r), fullDate(r.createdAt), tag("span", `+${fmtXP(r.amount)}`, "amt"))));
}

// Skills

// Nicer names for skills that come with short codes
const NAMES = { prog: "programming", algo: "algorithms", "front-end": "front end", "back-end": "back end", "sys-admin": "sys admin" };

// Fills the top skill card and the radar chart
export function renderSkills({ transaction: rows }) {
  // The platform saves a new row each time a skill goes up, so we keep the highest one per skill
  const best = {};
  for (const { type, amount } of rows) {
    const key = type.replace("skill_", "");
    best[key] = Math.max(best[key] || 0, amount);
  }

  const skills = topItems(best, 8).map((s) => ({ ...s, label: NAMES[s.label] || s.label.replace(/[-_]/g, " ") }));

  if (skills.length) {
    $("#stat-skill").textContent = `${skills[0].value}%`;
    $("#stat-skill-note").textContent = capitalize(skills[0].label);
  }

  // A radar with fewer than 3 spokes is just a line, so we skip it
  if (skills.length < 3) return empty($("#chart-skills"), "Your skills chart shows up once you've earned at least three skills.");
  radar($("#chart-skills"), skills);
}

// Projects

// Fills the projects passed card, the pass and fail donut and the recent projects list
export function renderProjects({ progress: rows }) {
  // Rows come newest first, so the first row we see for a project is its latest result
  const latest = {};
  for (const r of rows) latest[r.path] ??= r;
  const list = Object.values(latest);

  // A grade of 1 or more means passed
  const passed = list.filter((r) => r.grade >= 1).length;
  const failed = list.length - passed;
  $("#stat-projects").textContent = passed;
  $("#stat-projects-note").textContent = `Out of ${list.length} graded`;

  if (!list.length) return empty($("#chart-projects"), "No graded projects yet.");

  donut($("#chart-projects"), [
    { label: "Passed", value: passed, cls: "seg-mint" },
    { label: "Not passed", value: failed, cls: "seg-gum" },
  ], String(passed), "passed");

  $("#legend-projects").replaceChildren(
    legendItem("Passed", String(passed), "var(--mint)"),
    legendItem("Not passed", String(failed), "var(--gum)"),
  );

  $("#feed-projects").replaceChildren(...list.slice(0, 6).map((r) => {
    const ok = r.grade >= 1;
    const badge = tag("span", ok ? "Passed" : "Not passed", `badge ${ok ? "badge-pass" : "badge-fail"}`);
    return feedItem(nameOf(r), fullDate(r.updatedAt), badge);
  }));
}

// Piscines

// The piscine name is the part of the path with the word piscine in it, like piscine js
const piscineOf = (path) => path.split("/").find((part) => part.includes("piscine"));
const tries = (n) => `${n} ${n === 1 ? "try" : "tries"}`;

// Fills the piscine chips and the bars for exercises that took the most tries
export function renderPiscine({ result: rows }) {
  // Every row is one try, so we group them by exercise and count
  const exercises = {};
  for (const r of rows) {
    if (r.grade === null) continue;
    const ex = (exercises[r.path] ??= { label: nameOf(r), sub: piscineOf(r.path), value: 0, passed: false });
    ex.value++;
    ex.passed ||= r.grade >= 1;
  }

  const all = Object.values(exercises);
  if (!all.length) return empty($("#chart-piscine"), "No piscine results found.");

  // One chip per piscine with how many exercises passed and how many are not done yet
  const groups = {};
  for (const ex of all) {
    groups[ex.sub] ??= { passed: 0, notYet: 0 };
    groups[ex.sub][ex.passed ? "passed" : "notYet"]++;
  }
  $("#piscine-chips").replaceChildren(...Object.entries(groups).map(([name, g]) => tag("li", `${name}: ${g.passed} passed, ${g.notYet} not yet`)));

  const hardest = all.sort((a, b) => b.value - a.value).slice(0, 10);
  keepDrawn(() => barChart($("#chart-piscine"), hardest, tries, "bar-lemon", "Exercises with the most tries"));
}
