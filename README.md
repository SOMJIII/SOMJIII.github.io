# GraphQL profile

A playful profile page for Reboot01. Log in with your username or email and see your XP, level, audits, skills, projects and piscine stats. Every chart is hand-made SVG, and there's a built-in query lab (our own GraphiQL).

## Run it locally

The JS uses ES modules, so open it through a local server, not by double-clicking the file:

```
npx serve .
```

Or use the VS Code "Live Server" extension.

## Files

- `index.html` holds the login page, the profile and the query lab
- `js/config.js` has the domain and module path (change them if your campus differs)
- `js/api.js` handles sign in, the JWT, and all the queries
- `js/app.js` runs the login flow and draws the profile
- `js/charts.js` has the SVG charts (line, bar, donut, radar)
- `js/lab.js` is the query lab
- `css/style.css` has all the styles

## Audit checklist

| Audit question | Where to look |
|---|---|
| Error on invalid credentials | Login page shows a red message |
| Login with username or email | Same field accepts both |
| Three info sections | Player card (identity + level), XP, Audits |
| Graph section with 2+ SVG graphs | XP over time, XP by project, audit donut, skills radar, project donut, piscine bars |
| Logout | "Log out" button clears the token and returns to login |
| Normal query | `whoami` in `js/api.js` |
| Query with arguments | `profile`, `xp`, `audits` in `js/api.js` |
| Nested query | `xp`, `projects`, `piscine`, `audits` in `js/api.js` |
| Own GraphiQL (bonus) | "Query lab" tab: editor, variables, examples, schema explorer |

## Checking the numbers in GraphiQL

Open the Query lab and click **Total XP** or **My level**, or run the same queries on the platform's GraphiQL. The results should match the profile page.

## Host it on GitHub Pages

1. Push this folder to a GitHub repo.
2. Go to Settings, then Pages.
3. Pick the `main` branch and the root folder, then save.
4. Open the link GitHub gives you and log in.
