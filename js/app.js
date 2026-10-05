// The starting point, decides which page to show, loads the profile and handles login and logout

import { MODULE_PATH, QUERIES, AuthError, gql, signin, clearToken, isLoggedIn, getUserId } from "./api.js";
import { $, empty, redrawAll, forgetCharts } from "./ui.js";
import { renderProfile, renderAudits, renderXP, renderSkills, renderProjects, renderPiscine } from "./sections.js";
import { openLab, resetLab } from "./lab.js";

// Each part of the page, its query, its variables, the function that draws it and the chart boxes to fill if it fails
const SECTIONS = [
  { query: QUERIES.profile, vars: (id) => ({ id, path: MODULE_PATH }), render: renderProfile, boxes: ["#chart-audit"] },
  { query: QUERIES.xp, vars: () => ({ path: MODULE_PATH }), render: renderXP, boxes: ["#chart-xp-time", "#chart-xp-project"] },
  { query: QUERIES.skills, render: renderSkills, boxes: ["#chart-skills"] },
  { query: QUERIES.projects, render: renderProjects, boxes: ["#chart-projects"] },
  { query: QUERIES.piscine, render: renderPiscine, boxes: ["#chart-piscine"] },
  { query: QUERIES.audits, vars: (id) => ({ id }), render: renderAudits, boxes: [] },
];

// Start here, if you already have a good token you skip the login page
setupLogin(showProfile);
$("#logout").addEventListener("click", () => logout());
window.addEventListener("hashchange", showPage);
isLoggedIn() ? showProfile() : showLogin();

function logout(message) {
  forgetCharts();
  resetLab();
  history.replaceState(null, "", location.pathname);
  showLogin(message);
}

// If the address ends with the lab hash we show the query lab, anything else shows the profile
function showPage() {
  if ($("#app-view").hidden) return;
  const lab = location.hash === "#/lab";

  $("#lab-view").hidden = !lab;
  $(".dash").hidden = lab;
  $(lab ? "#tab-profile" : "#tab-lab").removeAttribute("aria-current");
  $(lab ? "#tab-lab" : "#tab-profile").setAttribute("aria-current", "page");

  // Charts drawn while hidden get the wrong width, so we redraw them when the profile comes back
  if (lab) openLab(getUserId());
  else redrawAll();
}

async function showProfile() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#banner").hidden = true;
  forgetCharts();
  setLoading();
  showPage();

  // A quick normal query first, if the token is bad we find out here
  try {
    await gql(QUERIES.whoami);
  } catch (err) {
    if (err instanceof AuthError) return logout("Your session ended. Log in again to continue.");
    $("#banner").textContent = `Couldn't load your data: ${err.message}`;
    $("#banner").hidden = false;
    return;
  }

  // All queries run at the same time, allSettled means one failing does not stop the others
  const id = getUserId();
  const results = await Promise.allSettled(SECTIONS.map((s) => gql(s.query, s.vars?.(id))));
  if (results.some((r) => r.reason instanceof AuthError)) return logout("Your session ended. Log in again to continue.");

  results.forEach((result, i) => drawSection(SECTIONS[i], result));
}

// Draws one section, or puts the error in its chart boxes so the rest of the page still works
function drawSection(section, result) {
  try {
    if (result.status === "rejected") throw result.reason;
    section.render(result.value);
  } catch (err) {
    console.error(err);
    section.boxes.forEach((box) => empty($(box), `Couldn't load this part: ${err.message}`));
  }
}

// Clears old data so you never see the last person and their numbers while loading
function setLoading() {
  document.querySelectorAll("[data-slot]").forEach((box) => empty(box, "Loading…"));
  ["#feed-xp", "#feed-projects", "#legend-audit", "#legend-projects", "#chips", "#piscine-chips"].forEach((s) => $(s).replaceChildren());
  ["#audit-note", "#audits-given"].forEach((s) => ($(s).hidden = true));
  ["#stat-xp", "#stat-ratio", "#stat-projects", "#stat-skill", "#level-num", "#name"].forEach((s) => ($(s).textContent = "–"));
}

// Login and logout

// Hooks up the login form, onLoggedIn runs after a good login
export function setupLogin(onLoggedIn) {
  $("#toggle-pass").addEventListener("click", togglePassword);

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = $("#identifier").value.trim();
    const password = $("#password").value;
    if (!identifier || !password) return setError("Enter your username or email and your password.");

    const btn = $("#login-btn");
    btn.disabled = true;
    btn.textContent = "Logging in…";
    try {
      await signin(identifier, password);
      $("#password").value = "";
      setError();
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    }
    btn.disabled = false;
    btn.textContent = "Log in";
  });
}

// Shows the login page and removes the token, message is for things like session ended
export function showLogin(message) {
  clearToken();
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
  setError(message);
  $("#identifier").focus();
}

function setError(message = "") {
  $("#login-error").textContent = message;
  $("#login-error").hidden = !message;
}

// Switches the password box between dots and plain text
function togglePassword() {
  const show = $("#password").type === "password";
  $("#password").type = show ? "text" : "password";
  $("#toggle-pass").textContent = show ? "Hide" : "Show";
  $("#toggle-pass").setAttribute("aria-pressed", show);
}
