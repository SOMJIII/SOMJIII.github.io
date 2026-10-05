import { SIGNIN_URL, GRAPHQL_URL } from "./config.js";

const TOKEN_KEY = "jwt";

export class AuthError extends Error {}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Swap username/email + password for a JWT (Basic auth)
export async function signin(identifier, password) {
  // btoa can't handle non-latin chars, so go through UTF-8 first
  const bytes = new TextEncoder().encode(`${identifier}:${password}`);
  const creds = btoa(String.fromCharCode(...bytes));

  let res;
  try {
    res = await fetch(SIGNIN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}` },
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    throw new Error("That username, email, or password didn't match. Check them and try again.");
  }

  const token = await res.json();
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

// Read the middle part of the JWT
export function decodeToken(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part));
  } catch {
    return null;
  }
}

export function tokenIsValid(token) {
  const p = token && decodeToken(token);
  return !!p && (!p.exp || p.exp * 1000 > Date.now());
}

// The user id lives inside the token
export function getUserId(token) {
  const p = decodeToken(token) || {};
  const claims = p["https://hasura.io/jwt/claims"] || {};
  return Number(claims["x-hasura-user-id"] ?? p.sub);
}

// Send a query with the JWT as Bearer auth
export async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401) throw new AuthError("Session expired");

  const json = await res.json();
  if (json.errors?.length) {
    const err = json.errors[0];
    if (err.extensions?.code === "invalid-jwt" || /jwt/i.test(err.message)) {
      throw new AuthError(err.message);
    }
    throw new Error(err.message);
  }
  return json.data;
}

// For the query lab: hand back the whole response, errors included
export async function rawGql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return { status: res.status, json: await res.json() };
}

export const QUERIES = {
  // Normal query
  whoami: `{
    user { id login }
  }`,

  // Arguments (variables) + aggregate
  profile: `query Profile($id: Int!, $path: String!) {
    user(where: { id: { _eq: $id } }) {
      id login attrs campus createdAt
      auditRatio totalUp totalDown
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

  // Nested: each transaction pulls in its object
  xp: `query XP($path: String!) {
    transaction(
      where: { type: { _eq: "xp" }, event: { path: { _eq: $path } } }
      order_by: { createdAt: asc }
    ) {
      amount createdAt path
      object { name type }
    }
  }`,

  skills: `{
    transaction(where: { type: { _like: "skill_%" } }, order_by: { amount: desc }) {
      type amount
    }
  }`,

  projects: `{
    progress(
      where: { object: { type: { _eq: "project" } }, grade: { _is_null: false } }
      order_by: { updatedAt: desc }
    ) {
      grade path updatedAt
      object { name }
    }
  }`,

  piscine: `{
    result(
      where: { path: { _like: "%piscine%" }, object: { type: { _eq: "exercise" } } }
      order_by: { createdAt: asc }
    ) {
      grade path
      object { name }
    }
  }`,

  audits: `query Audits($id: Int!) {
    audit(
      where: { auditorId: { _eq: $id }, grade: { _is_null: false } }
      order_by: { createdAt: desc }
    ) {
      grade createdAt
      group { path captainLogin }
    }
  }`,
};
