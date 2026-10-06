# My journey, a GraphQL profile page

A profile page for Reboot01 students. You log in with your school account, the page asks the school's GraphQL API for your data, and shows it as a player card, stat stickers and six hand-drawn SVG charts. It also has a **Query lab**, a small GraphiQL of our own where you can write and run any query and browse the schema.

No frameworks, no libraries, no build step. Just HTML, CSS and plain JavaScript.

---

## What you see

**Login page.** One box for username or email, one for password, a show/hide button for the password, and a clear message when something is wrong.

**Profile page**

| Part | What it shows |
|---|---|
| Player card | Your name, @login, join date, email and your level in a big yellow sticker |
| Stat stickers | Total XP, audit ratio, projects passed, top skill |
| XP over time | Line chart of your running XP total. Hover to see each gain |
| XP by project | Bar chart of the 12 projects that gave you the most XP |
| Latest XP | Your 8 most recent XP gains |
| Audits | Donut of audits done vs received, a short note about your ratio, and how many audits you've done |
| Skills | Radar (spider web) chart of your top 8 skills |
| Projects | Donut of passed vs not passed, and your 6 latest results |
| Piscines | Passed/not yet per piscine, and bars for the 10 exercises that took you the most tries |

**Query lab.** Example buttons, a query editor, a variables box, the raw JSON answer, and a schema explorer.

---

## Run it

The JavaScript is split into ES modules (`import` / `export`). Browsers block modules on `file://`, so you need a tiny local server:

```bash
npx serve .
```

or the **Live Server** extension in VS Code.

## Host it

It's a static site (just files, no backend), so any static host works. For GitHub Pages:

1. Push the folder to a GitHub repo
2. Settings → Pages → branch `main`, folder `/ (root)` → Save
3. Open the link GitHub gives you

---

## The tech, and why

| What | Why |
|---|---|
| **Plain JavaScript** | The project is about GraphQL, JWT and SVG. A framework would hide those behind its own code. Plain JS means every line is ours and we can explain it |
| **ES modules** | Lets us split the code into a few files, each with one job, without a bundler. The browser loads them itself |
| **SVG drawn by hand** | The subject requires SVG. Drawing it ourselves means we control every shape, and it proves we understand how charts work |
| **`fetch`** | Built into the browser, all we need for two kinds of requests |
| **`localStorage`** for the JWT | Keeps you logged in after a refresh. Only the token is saved, never your password |
| **Google Fonts** | Bricolage Grotesque for headings, Figtree for text. They give the playful look |

---

## Folder map

```
index.html       all three screens: login, profile, query lab
css/style.css    every style, colours and fonts at the top
js/
  api.js         talks to the server: config, logging in, the JWT, sending queries, every query
  ui.js          shared tools (formatting XP, dates, making elements) + all four SVG charts
  sections.js    one render function per part of the profile, turns data into the page
  lab.js         the query lab: examples, editor, run button, schema explorer
  app.js         the start: login and logout, which page to show, loading everything
```

Each file is split into labelled parts with a comment on top, so you can jump to "Donut chart" or "Logging in and the JWT" quickly.

The idea: **sections.js** knows about our data, the **charts in ui.js** only know about numbers. So the bar chart doesn't know what XP is, it just draws bars. That's why the same bar chart works for XP by project *and* piscine tries.

The files only go one way: `app.js` uses the other four, `sections.js` and `lab.js` use `api.js` and `ui.js`, and those two don't use anything. That keeps it easy to follow.

---

## How it works, step by step

### 1. Logging in (`api.js`, `app.js`)

1. You type `username` (or email) and `password`.
2. We join them as `username:password` and encode that in **base64**. This is called **Basic auth**.
3. We send it in a header to `POST /api/auth/signin`:
   ```
   Authorization: Basic c2RhZHNoYWg6bXlwYXNz
   ```
4. If it's right, the server sends back a **JWT** (a long token). We save it in `localStorage`.
5. If it's wrong, the server answers with an error status, and we show the red message.

Username and email both work because the server accepts either one. We don't need two code paths.

> **Base64 is not encryption.** Anyone can decode it. What keeps your password safe is **HTTPS**, which encrypts the whole request.

### 2. Reading the JWT (`api.js`)

A JWT looks like `xxxxx.yyyyy.zzzzz`, three parts split by dots:

- **header**: what kind of token it is
- **payload**: the data, like your user id and when the token expires
- **signature**: proof the server made it, so nobody can fake one

The middle part is just base64 JSON, so we can decode it with `atob` and read your **user id** and **expiry time**. We use the expiry to skip the login page when your token is still good. We use the id as a variable in some queries.

We can *read* the token but we can't *change* it. If we did, the signature wouldn't match and the server would reject it.

### 3. Asking for data (`api.js`)

Every query is a `POST` to `/api/graphql-engine/v1/graphql`, this time with the JWT as **Bearer auth**:

```
Authorization: Bearer <the JWT>
```

The body is JSON with the query text and its variables. The server checks the token and **only returns your own data**. That's why `{ user { id login } }` gives back just you, not every student.

There are two functions:
- `request` returns the full answer, errors included. The query lab uses this so you can see errors.
- `gql` returns only the data and throws if something went wrong. The profile uses this.

If the token has expired, the server says so and we throw a special `AuthError`. The app catches it and sends you back to login with "Your session ended".

### 4. Loading the profile (`app.js`)

1. Run the `whoami` query first. It's tiny and tells us straight away if the token still works.
2. Run the other six queries **at the same time** with `Promise.allSettled`.
3. Hand each answer to its section's render function.

**Why `allSettled` and not `Promise.all`?** `Promise.all` fails completely if one query fails. `allSettled` waits for all of them and tells us which worked. So if one query breaks, only that card shows an error and the rest of the page still works.

The `SECTIONS` list at the top of `app.js` pairs each query with the function that draws it. Adding a new section is one new line there.

### 5. Switching pages

The address ending `#/lab` shows the query lab, anything else shows the profile. Changing the part after `#` doesn't reload the page, the browser just fires a `hashchange` event and we show or hide the right part. The tabs are normal links, so the back button works too.

### 6. Logging out

Logging out removes the token from `localStorage`, clears the lab, and shows the login page. Without the token, nothing can talk to the API any more. Refreshing keeps you logged out.

---

## GraphQL in short

With a normal REST API you get whatever the server decides to send from each URL. With **GraphQL** there's one URL, and **you write exactly what you want** back. The answer has the same shape as your question:

```graphql
{ user { id login } }
```
```json
{ "data": { "user": [{ "id": 1234, "login": "sdadshah" }] } }
```

The school's API runs on **Hasura**, which turns database tables into GraphQL. Hasura gives us these tools to filter and sort:

| Tool | Meaning | Example |
|---|---|---|
| `where` | filter rows | `where: { type: { _eq: "xp" } }` |
| `_eq` | equals | `{ _eq: "level" }` |
| `_like` | text pattern, `%` means anything | `{ _like: "%piscine%" }` |
| `_is_null` | is or isn't empty | `{ _is_null: false }` |
| `order_by` | sort | `order_by: { createdAt: asc }` |
| `limit` | how many rows | `limit: 1` |
| `_aggregate` | maths on many rows | `sum { amount }` |

### The three query types the subject asks for

**Normal**, just fields, no arguments:
```graphql
{ user { id login } }
```

**With arguments**, filter what comes back. We use **variables** (`$id`) so the query text stays the same and only the values change:
```graphql
query ($id: Int!) {
  user(where: { id: { _eq: $id } }) { login auditRatio }
}
```
`Int!` means the variable is a number and the `!` means it's required.

**Nested**, follow a link from one table into another in a single query:
```graphql
{
  transaction { amount object { name type } }
}
```
Each XP row brings the name of the project it came from. Without nesting we'd need a second request.

---

## Every query, explained (`api.js`)

| Query | Type | What it gets | Why it's written this way |
|---|---|---|---|
| `whoami` | normal | your id and login | Tiny, so it's a fast way to check the token works |
| `profile` | arguments | your details, level, total XP | Three queries in one request. `attrs` holds your name and email. Level is the **highest** level transaction, so we sort by amount and take 1. Total XP uses `_aggregate` so the server adds it up for us |
| `xp` | nested + arguments | every XP gain, oldest first | Oldest first so we can keep a running total for the line chart |
| `skills` | arguments | every skill change | Types look like `skill_go`, so we match them with `_like` |
| `projects` | nested | graded projects with names | Newest first, so the first row we see for each project is its latest result |
| `piscine` | nested | every piscine exercise attempt | Each row in the `result` table is one try, so counting rows counts tries |
| `audits` | nested + arguments | audits you've done | `grade` is empty while an audit isn't finished, so we skip those |

### Why we filter XP by `event.path`

Your XP comes from different events (module, piscines, checkpoints). The number on your intra profile only counts the **module** event. Filtering by `event: { path: { _eq: "/bahrain/bh-module" } }` makes our total match intra. If it doesn't match for you, this path in `config.js` is the thing to change.

---

## How the charts are drawn (`ui.js`)

### SVG basics

SVG draws with shapes: `<rect>` for bars, `<circle>`, `<line>`, `<path>` for any shape, `<text>` for labels. Every shape has x and y coordinates. **y goes down** in SVG, so 0 is the top. That's why our charts flip y: a bigger number means a smaller y, so it sits higher.

SVG elements need a special namespace to be made in JavaScript, which is why `ui.js` uses `createElementNS` instead of `createElement`.

### Scale functions

Every chart turns data into positions with small functions like these from the line chart:

```js
const x = (date) => pad.left + ((date - start) / span) * width;
const y = (xp) => H - pad.bottom - (xp / max) * height;
```

`(date - start) / span` gives a number from 0 to 1 (how far along in time), then we stretch it to the chart's width. Same idea for y.

`niceMax` rounds the top of the axis up to a clean number (like 1.5 MB → 2 MB), so the guide lines land on nice values.

### Each chart

**Line**: a `<path>` whose `d` attribute is a list of points, `M` means move here and `L` means draw a line to here. The purple area under it is the same path, closed off along the bottom. To draw itself in on load, we set the dash length to the line's full length and animate the offset down to 0.

**Bar**: one `<rect>` per item. The longest bar fills the space and the rest are sized compared to it.

**Donut**: a trick. Each coloured part is a whole circle, but with a **dashed outline** where the dash is exactly as long as its share. `stroke-dashoffset` moves each dash along so it starts where the last one ended. We rotate it -90° so it starts at the top.

**Radar**: each skill gets a spoke, spread evenly around a circle. To find a point we use `cos` and `sin`: `cos` gives how far left or right, `sin` how far up or down. The skill value (0 to 100) decides how far out along the spoke the dot sits.

### Tooltips and resizing

One tooltip box is shared by every chart. It follows the mouse and flips to the other side if it would go off screen.

The line and bar charts read their box's width and draw to fit it exactly, so text stays readable on phones. When the window resizes we redraw them, but only once resizing stops (150 ms), not hundreds of times while you drag.

---

## The Query lab (`lab.js`)

Our own small GraphiQL.

- **Editor + variables**: type a query, put variables in as JSON, press **Run** or **Ctrl + Enter**. Tab adds two spaces instead of leaving the box.
- **Examples**: one button for each query type (normal, arguments, nested), plus total XP and level so you can check the profile numbers.
- **Raw answer**: shows the full JSON, errors included, and how long it took.
- **Schema explorer**: uses **introspection**. GraphQL APIs can describe themselves if you ask with special fields like `__schema` and `__type`. We ask for every top-level field, list them with a search box, and when you click one we ask for its columns and their types.

Types like `[user!]!` are read from the inside out: `user!` is a user that can't be empty, `[...]` is a list of them, and the last `!` means the list itself can't be empty.

---

## Design choices

**The look.** Thick ink outlines, hard offset shadows and bright colours on dotted paper, like stickers in a notebook. XP and levels already feel like a game, so the page leans into that. The level is the one big element on purpose: a tilted sticker that pops in when the page loads.

**Colours and fonts** are CSS variables at the top of `style.css`, so changing one value changes it everywhere.

**Good practices we followed**

- Every error says what went wrong and what to do next
- Empty states explain why something is empty, like "No graded projects yet"
- Keyboard users see a clear purple outline on whatever is focused
- If your system asks for less motion, all animations turn off
- Colours have enough contrast to read easily
- Charts have labels for screen readers
- Works on phones, with no sideways scrolling
- **We never use `innerHTML`.** All text goes in with `textContent`, so data from the server can't inject HTML or scripts (this blocks XSS attacks)

---