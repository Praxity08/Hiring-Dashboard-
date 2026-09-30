import { createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

let client = null;

// Lazily create the Neon client so a missing env var returns a clear error instead of crashing the function.
export function db() {
  if (!process.env.DATABASE_URL) {
    const err = new Error("DATABASE_URL is not set. Add your Neon connection string in Vercel > Settings > Environment Variables.");
    err.status = 500;
    err.code = "server_config";
    throw err;
  }
  client ??= neon(process.env.DATABASE_URL);
  return client;
}

// Every API route is behind one shared password, sent as `Authorization: Bearer <password>`.
export function authorize(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    res.status(500).json({ code: "server_config", error: "APP_PASSWORD is not set. Add it in Vercel > Settings > Environment Variables." });
    return false;
  }
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!given || !timingSafeEqual(a, b)) {
    res.status(401).json({ code: "unauthorized", error: "Wrong password." });
    return false;
  }
  return true;
}

export const ID_RE = /^[a-z0-9-]{1,80}$/;

// "live" is the founder's own candidates; "sample" is read-only demo data.
export const DATASETS = new Set(["live", "sample"]);
export function readDataset(req) {
  const d = String((req.query && req.query.dataset) || "live");
  return DATASETS.has(d) ? d : "live";
}

// JSON for a jsonb column: Postgres rejects the NUL character (\u0000), so drop it.
export function toJsonb(value) {
  return JSON.stringify(value).replace(/(?<!\\)\\u0000/g, "");
}

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Nested objects merge; arrays and scalars replace. Mirrors how the dashboard patches a candidate.
export function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

export function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ code: err.code || "server_error", error: status >= 500 && !err.code ? "Something went wrong on the server." : err.message });
}
