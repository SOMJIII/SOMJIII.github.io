// The query lab, our own small GraphiQL

import { request, MODULE_PATH } from "./api.js";
import { $, tag } from "./ui.js";

// Example queries for the buttons

// Example queries for the lab buttons, vars fills the variables box
export const PRESETS = [
  {
    name: "Normal",
    query: `{
  user {
    id
    login
  }
}`,
  },
  {
    name: "With arguments",
    query: `query ($id: Int!) {
  user(where: { id: { _eq: $id } }) {
    login
    auditRatio
    totalUp
    totalDown
  }
}`,
    vars: (id) => ({ id }),
  },
  {
    name: "Nested",
    query: `{
  result(limit: 5, order_by: { createdAt: desc }) {
    grade
    path
    user {
      id
      login
    }
  }
}`,
  },
  {
    name: "Total XP",
    query: `query ($path: String!) {
  transaction_aggregate(
    where: { type: { _eq: "xp" }, event: { path: { _eq: $path } } }
  ) {
    aggregate { sum { amount } }
  }
}`,
    vars: () => ({ path: MODULE_PATH }),
  },
  {
    name: "My level",
    query: `query ($path: String!) {
  transaction(
    where: { type: { _eq: "level" }, event: { path: { _eq: $path } } }
    order_by: { amount: desc }
    limit: 1
  ) {
    amount
  }
}`,
    vars: () => ({ path: MODULE_PATH }),
  },
  {
    name: "Latest XP",
    query: `{
  transaction(where: { type: { _eq: "xp" } }, order_by: { createdAt: desc }, limit: 10) {
    amount
    createdAt
    object { name type }
  }
}`,
  },
];

// The editor and the run button

let loaded = false;

// Buttons and keys only need hooking up once
$("#run-query").addEventListener("click", run);
$("#query-input").addEventListener("keydown", onKey);
$("#vars-input").addEventListener("keydown", onKey);

// Runs every time you open the lab tab, but only sets things up the first time
export function openLab(userId) {
  if (loaded) return;
  loaded = true;

  $("#presets").replaceChildren(...PRESETS.map((p) => {
    const btn = tag("button", p.name, "chip-btn");
    btn.type = "button";
    btn.addEventListener("click", () => usePreset(p, userId));
    return btn;
  }));

  usePreset(PRESETS[0], userId);
  loadSchema();
}

// Clears everything on logout so the next person starts fresh
export function resetLab() {
  loaded = false;
  $("#result").textContent = "Run a query to see the response here.";
  $("#result-meta").textContent = "";
  clearSchema();
}

function usePreset(preset, userId) {
  $("#query-input").value = preset.query;
  $("#vars-input").value = JSON.stringify(preset.vars ? preset.vars(userId) : {}, null, 2);
}

// Ctrl or Cmd + Enter runs the query, Tab adds two spaces instead of leaving the box
function onKey(e) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    run();
  } else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    e.target.setRangeText("  ", e.target.selectionStart, e.target.selectionEnd, "end");
  }
}

// Sends what is in the editor and shows the raw answer, errors included
async function run() {
  const out = $("#result");
  const meta = $("#result-meta");
  meta.textContent = "";

  let vars;
  try {
    vars = JSON.parse($("#vars-input").value || "{}");
  } catch {
    out.textContent = "The variables aren't valid JSON. Check for missing quotes or commas.";
    return;
  }

  $("#run-query").disabled = true;
  const start = performance.now();
  try {
    const json = await request($("#query-input").value, vars);
    meta.textContent = `${json.errors ? "Error" : "OK"} in ${Math.round(performance.now() - start)} ms`;
    meta.className = `result-meta ${json.errors ? "is-bad" : "is-good"}`;
    out.textContent = JSON.stringify(json, null, 2);
  } catch (err) {
    out.textContent = `Couldn't run the query: ${err.message}`;
  }
  $("#run-query").disabled = false;
}

// Schema explorer

// Asks for a type, digging through wrappers like lists and required marks
const TYPE = "type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }";

let fields = [];

// Filters the list as you type
$("#schema-search").addEventListener("input", drawList);

// Turns a type into text the way GraphQL writes it, an exclamation mark means required and brackets mean a list
function typeText(t) {
  if (t.kind === "NON_NULL") return `${typeText(t.ofType)}!`;
  if (t.kind === "LIST") return `[${typeText(t.ofType)}]`;
  return t.name;
}

// The real type name without the wrappers
const baseName = (t) => (t.ofType ? baseName(t.ofType) : t.name);

// Introspection, we ask the API to describe itself and list every top level field
async function loadSchema() {
  $("#schema-list").replaceChildren(tag("li", "Loading schema…", "side-note"));
  try {
    const json = await request(`{ __schema { queryType { fields { name ${TYPE} } } } }`);
    if (json.errors) throw new Error(json.errors[0].message);
    fields = json.data.__schema.queryType.fields.sort((a, b) => a.name.localeCompare(b.name));
    drawList();
  } catch (err) {
    $("#schema-list").replaceChildren(tag("li", `Couldn't load the schema: ${err.message}`, "side-note"));
  }
}

function clearSchema() {
  fields = [];
  $("#schema-search").value = "";
  $("#schema-list").replaceChildren();
  $("#schema-detail").replaceChildren();
}

function drawList() {
  const search = $("#schema-search").value.trim().toLowerCase();
  const matches = fields.filter((f) => f.name.toLowerCase().includes(search)).slice(0, 60);

  $("#schema-list").replaceChildren(...matches.map((f) => {
    const btn = tag("button", f.name, "schema-item");
    btn.type = "button";
    btn.addEventListener("click", () => showType(f.name, baseName(f.type)));
    const li = tag("li");
    li.append(btn);
    return li;
  }));
}

// Clicking a field shows every column of the table it returns
async function showType(field, name) {
  const json = await request(`query ($n: String!) { __type(name: $n) { fields { name ${TYPE} } } }`, { n: name });
  const list = tag("ul", "", "type-fields");

  for (const f of json.data?.__type?.fields || []) {
    const li = tag("li");
    li.append(tag("span", f.name), tag("span", typeText(f.type), "type-name"));
    list.append(li);
  }
  $("#schema-detail").replaceChildren(tag("h3", `${field} → ${name}`), list);
}
