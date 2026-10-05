import { rawGql } from "./api.js";

const $ = (sel) => document.querySelector(sel);

// Starter queries, one for each type the subject asks for
const PRESETS = [
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
    id
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
    vars: (_, path) => ({ path }),
  },
  {
    name: "Latest XP",
    query: `{
  transaction(
    where: { type: { _eq: "xp" } }
    order_by: { createdAt: desc }
    limit: 10
  ) {
    amount
    createdAt
    object { name type }
  }
}`,
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
    vars: (_, path) => ({ path }),
  },
];

let ctx = { userId: 0, path: "" };
let ready = false;
let rootFields = [];

export function openLab(userId, path) {
  ctx = { userId, path };
  if (!ready) setup();
}

export function resetLab() {
  $("#result").textContent = "Run a query to see the response here.";
  $("#result-meta").textContent = "";
  $("#schema-detail").replaceChildren();
  rootFields = [];
  ready = false;
}

function setup() {
  ready = true;

  const presets = $("#presets");
  presets.replaceChildren(...PRESETS.map((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip-btn";
    b.textContent = p.name;
    b.addEventListener("click", () => loadPreset(p));
    return b;
  }));

  // Only wire events once per page load
  if (!presets.dataset.wired) {
    presets.dataset.wired = "1";
    $("#run-query").addEventListener("click", run);
    $("#schema-search").addEventListener("input", drawRootFields);
    for (const box of [$("#query-input"), $("#vars-input")]) {
      box.addEventListener("keydown", onKey);
    }
  }

  loadPreset(PRESETS[0]);
  loadSchema();
}

function loadPreset(p) {
  $("#query-input").value = p.query;
  $("#vars-input").value = p.vars ? JSON.stringify(p.vars(ctx.userId, ctx.path), null, 2) : "{}";
  $("#query-input").focus();
}

// Ctrl/Cmd + Enter runs, Tab indents
function onKey(e) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    run();
  } else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    e.target.setRangeText("  ", e.target.selectionStart, e.target.selectionEnd, "end");
  }
}

async function run() {
  const query = $("#query-input").value.trim();
  const out = $("#result");
  const meta = $("#result-meta");
  if (!query) {
    out.textContent = "Write a query first.";
    return;
  }

  let vars = {};
  const rawVars = $("#vars-input").value.trim();
  if (rawVars) {
    try {
      vars = JSON.parse(rawVars);
    } catch {
      out.textContent = "The variables aren't valid JSON. Check for missing quotes or commas.";
      meta.textContent = "";
      return;
    }
  }

  const btn = $("#run-query");
  btn.disabled = true;
  btn.textContent = "Running…";
  const t0 = performance.now();

  try {
    const { status, json } = await rawGql(query, vars);
    const ms = Math.round(performance.now() - t0);
    meta.textContent = `${json.errors ? "Error" : "OK"} (${status}) in ${ms} ms`;
    meta.className = `result-meta ${json.errors ? "is-bad" : "is-good"}`;
    paintJSON(out, json);
  } catch (err) {
    meta.textContent = "";
    out.textContent = `Couldn't reach the API: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Run query";
  }
}

// Colour the JSON without using innerHTML
function paintJSON(target, data) {
  const str = JSON.stringify(data, null, 2);
  const re = /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
  const frag = document.createDocumentFragment();
  let last = 0;

  for (const m of str.matchAll(re)) {
    frag.append(str.slice(last, m.index));
    const span = document.createElement("span");
    const tok = m[0];
    span.className = tok.startsWith('"') ? (tok.endsWith(":") ? "j-key" : "j-str")
      : /true|false/.test(tok) ? "j-bool" : tok === "null" ? "j-null" : "j-num";
    span.textContent = tok;
    frag.append(span);
    last = m.index + tok.length;
  }
  frag.append(str.slice(last));
  target.replaceChildren(frag);
}

/* ---------- Schema explorer (introspection) ---------- */

// Unwrap NON_NULL / LIST to the real type name
function typeName(t) {
  if (!t) return "";
  if (t.kind === "NON_NULL") return `${typeName(t.ofType)}!`;
  if (t.kind === "LIST") return `[${typeName(t.ofType)}]`;
  return t.name;
}
const baseName = (t) => (t.ofType ? baseName(t.ofType) : t.name);

const TYPE_REF = "type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }";

async function loadSchema() {
  const list = $("#schema-list");
  list.replaceChildren(note("Loading schema…"));
  try {
    const { json } = await rawGql(`{ __schema { queryType { fields { name ${TYPE_REF} } } } }`);
    if (json.errors) throw new Error(json.errors[0].message);
    rootFields = json.data.__schema.queryType.fields.sort((a, b) => a.name.localeCompare(b.name));
    drawRootFields();
  } catch (err) {
    list.replaceChildren(note(`Couldn't load the schema: ${err.message}`));
  }
}

function drawRootFields() {
  const q = $("#schema-search").value.trim().toLowerCase();
  const items = rootFields.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 60);

  $("#schema-list").replaceChildren(...items.map((f) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "schema-item";
    b.textContent = f.name;
    b.addEventListener("click", () => showType(f.name, baseName(f.type)));
    li.append(b);
    return li;
  }));

  if (!items.length) $("#schema-list").replaceChildren(note("No fields match that filter."));
}

async function showType(fieldName, name) {
  const box = $("#schema-detail");
  box.replaceChildren(note(`Loading ${name}…`));

  const { json } = await rawGql(
    `query ($n: String!) { __type(name: $n) { name fields { name ${TYPE_REF} } } }`,
    { n: name },
  );
  const t = json.data?.__type;
  if (!t?.fields) {
    box.replaceChildren(note(`${name} has no fields to show.`));
    return;
  }

  const title = document.createElement("h3");
  title.textContent = `${fieldName} → ${t.name}`;

  const ul = document.createElement("ul");
  ul.className = "type-fields";
  for (const f of t.fields) {
    const li = document.createElement("li");
    const n = document.createElement("span");
    n.textContent = f.name;
    const ty = document.createElement("span");
    ty.className = "type-name";
    ty.textContent = typeName(f.type);
    li.append(n, ty);
    ul.append(li);
  }

  // Quick way to try it: a starter query with the scalar fields
  const scalars = t.fields
    .filter((f) => ["SCALAR", "ENUM"].includes((f.type.ofType || f.type).kind))
    .slice(0, 6)
    .map((f) => `    ${f.name}`);
  if (!scalars.length || fieldName.endsWith("_by_pk")) {
    box.replaceChildren(title, ul);
    return;
  }

  const tryBtn = document.createElement("button");
  tryBtn.type = "button";
  tryBtn.className = "chip-btn";
  tryBtn.textContent = `Try ${fieldName}`;
  tryBtn.addEventListener("click", () => {
    $("#query-input").value = `{\n  ${fieldName}(limit: 5) {\n${scalars.join("\n")}\n  }\n}`;
    $("#vars-input").value = "{}";
    $("#query-input").focus();
  });

  box.replaceChildren(title, tryBtn, ul);
}

function note(msg) {
  const p = document.createElement("p");
  p.className = "side-note";
  p.textContent = msg;
  return p;
}
