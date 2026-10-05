// Everything that talks to the school server, logging in, the JWT and all the queries

// Where the API lives

// Change these two if your campus is different
export const DOMAIN = "learn.reboot01.com";
export const MODULE_PATH = "/bahrain/bh-module";

export const SIGNIN_URL = `https://${DOMAIN}/api/auth/signin`;
export const GRAPHQL_URL = `https://${DOMAIN}/api/graphql-engine/v1/graphql`;

// Logging in and the JWT

// The token is saved in the browser so a refresh keeps you logged in
export const getToken = () => localStorage.getItem("jwt");
export const clearToken = () => localStorage.removeItem("jwt");

// Sends username or email + password using Basic auth, saves the JWT we get back
export async function signin(identifier, password) {
  // btoa only accepts latin letters, so we turn the text into bytes first
  const bytes = new TextEncoder().encode(`${identifier}:${password}`);
  const creds = btoa(String.fromCharCode(...bytes));

  const res = await fetch(SIGNIN_URL, { method: "POST", headers: { Authorization: `Basic ${creds}` } })
    .catch(() => { throw new Error("Couldn't reach the server. Check your connection and try again."); });

  if (!res.ok) throw new Error("That username, email, or password didn't match. Check them and try again.");
  localStorage.setItem("jwt", await res.json());
}

// A JWT has three parts split by dots, the middle part is base64 JSON with our data
export function readToken(token = getToken()) {
  try {
    const middle = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(middle));
  } catch {
    return null;
  }
}

// Logged in means we have a readable token that has not expired
export function isLoggedIn() {
  const data = readToken();
  return !!data && (!data.exp || data.exp * 1000 > Date.now());
}

// The user id is stored inside the token by the server
export function getUserId() {
  const data = readToken() || {};
  const claims = data["https://hasura.io/jwt/claims"] || {};
  return Number(claims["x-hasura-user-id"] ?? data.sub);
}

// Sending queries

// Special error for a bad or expired token, so the app knows to log you out
export class AuthError extends Error {}

// Sends a query with the JWT as Bearer auth, returns the whole answer
export async function request(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) throw new AuthError("Session expired");
  return res.json();
}

// Same as request but returns only the data, and throws if the server sent an error
export async function gql(query, variables) {
  const json = await request(query, variables);
  const error = json.errors?.[0];
  if (!error) return json.data;
  if (error.extensions?.code === "invalid-jwt") throw new AuthError(error.message);
  throw new Error(error.message);
}

// Every query the profile page uses

export const QUERIES = {
  // Normal query, no arguments, the server only returns you
  whoami: `{
    user { id login }
  }`,

  // Arguments with variables, plus an aggregate that adds up all your XP for us
  profile: `query ($id: Int!, $path: String!) {
    user(where: { id: { _eq: $id } }) {
      id login attrs createdAt auditRatio totalUp totalDown
    }
    level: transaction(
      where: { type: { _eq: "level" }, event: { path: { _eq: $path } } }
      order_by: { amount: desc }
      limit: 1
    ) { amount }
    xp: transaction_aggregate(
      where: { type: { _eq: "xp" }, event: { path: { _eq: $path } } }
    ) { aggregate { sum { amount } } }
  }`,

  // Nested, each XP row also brings the project or exercise it came from
  xp: `query ($path: String!) {
    transaction(
      where: { type: { _eq: "xp" }, event: { path: { _eq: $path } } }
      order_by: { createdAt: asc }
    ) {
      amount createdAt path
      object { name type }
    }
  }`,

  // Skills are saved as transactions with a type that starts with skill
  skills: `{
    transaction(where: { type: { _like: "skill_%" } }) { type amount }
  }`,

  // Nested, graded projects with their names, newest first
  projects: `{
    progress(
      where: { object: { type: { _eq: "project" } }, grade: { _is_null: false } }
      order_by: { updatedAt: desc }
    ) {
      grade path updatedAt
      object { name }
    }
  }`,

  // Nested, every piscine exercise attempt, one row per try
  piscine: `{
    result(where: { path: { _like: "%piscine%" }, object: { type: { _eq: "exercise" } } }) {
      grade path
      object { name }
    }
  }`,

  // Nested, audits you did with the group you audited
  audits: `query ($id: Int!) {
    audit(where: { auditorId: { _eq: $id }, grade: { _is_null: false } }) {
      grade
      group { path captainLogin }
    }
  }`,
};
