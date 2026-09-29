import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { authorize, isPlainObject } from "../lib/server.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Tried in order when the main model is overloaded, out of free-tier quota, or returns an unusable reply.
// GEMINI_FALLBACK_MODEL takes a comma-separated list; "none" turns fallbacks off.
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODEL || "gemini-3.7-flash,gemini-3.5-flash").split(",").map((m) => m.trim());
const MODELS = [...new Set([MODEL, ...FALLBACKS].filter((m) => m && m !== "none"))];
const BUSY_RETRY_DELAYS_MS = [2000, 5000];
const MAX_PROMPT_CHARS = 60000;
const MAX_SCHEMA_CHARS = 20000;

let genai = null;

// Reads the reply tolerantly: the whole text as JSON, else a fenced block, else the outermost {...}.
function parseJson(text) {
  const tries = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start !== -1 && end > start) tries.push(text.slice(start, end + 1));
  for (const t of tries) {
    try { return JSON.parse(t.trim()); } catch {}
  }
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Google's temporary "high demand" / server errors, worth retrying.
const isBusy = (err) => err instanceof ApiError && [500, 502, 503, 504].includes(err.status);
const canTryNextModel = (err) => isBusy(err) || (err instanceof ApiError && (err.status === 429 || err.status === 404));

class BadReply extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

// Turns one Gemini response into parsed JSON, or throws BadReply. Logs why a reply was rejected, never its content.
function readReply(response, model) {
  const cand = response.candidates && response.candidates[0];
  const finish = cand && cand.finishReason;
  const blocked = response.promptFeedback && response.promptFeedback.blockReason;
  const usage = response.usageMetadata || {};
  const diag = `model=${model} finish=${finish} block=${blocked || "-"} textChars=${(response.text || "").length} outTokens=${usage.candidatesTokenCount} thoughtTokens=${usage.thoughtsTokenCount}`;
  if (blocked || (finish && finish !== FinishReason.STOP && finish !== FinishReason.MAX_TOKENS)) throw new BadReply("refused", diag);
  if (finish === FinishReason.MAX_TOKENS) throw new BadReply("invalid_json", diag);
  const json = parseJson(response.text || "");
  if (json === undefined || !isPlainObject(json)) throw new BadReply("invalid_json", diag);
  return json;
}

// Tries each model in turn: busy errors get short retries, an unusable reply gets one retry, then the next model.
async function generate(prompt, schema) {
  const config = { responseMimeType: "application/json", maxOutputTokens: 32000 };
  if (schema) config.responseJsonSchema = schema;
  let lastErr;
  for (const model of MODELS) {
    let busyTries = 0, badReplies = 0;
    for (;;) {
      try {
        const response = await genai.models.generateContent({ model, contents: prompt, config });
        return { json: readReply(response, model), model };
      } catch (err) {
        lastErr = err;
        if (err instanceof BadReply) {
          console.warn(`Unusable reply (${err.code}): ${err.detail}`);
          if (err.code === "refused") throw err;
          if (badReplies++ < 1) continue;
          break;
        }
        if (err instanceof ApiError && err.status === 400 && config.responseJsonSchema && /schema/i.test(err.message)) {
          console.warn(`${model} rejected the response schema, retrying without it`);
          delete config.responseJsonSchema;
          continue;
        }
        if (isBusy(err) && busyTries < BUSY_RETRY_DELAYS_MS.length) {
          console.warn(`${model} busy (${err.status}), retrying in ${BUSY_RETRY_DELAYS_MS[busyTries]} ms`);
          await sleep(BUSY_RETRY_DELAYS_MS[busyTries++]);
          continue;
        }
        break;
      }
    }
    // Bad keys and bad requests would fail the same way on every model, so stop there.
    if (!(lastErr instanceof BadReply) && !canTryNextModel(lastErr)) break;
    console.warn(`${model} gave up (${lastErr instanceof BadReply ? lastErr.code : lastErr.status}), trying next model`);
  }
  throw lastErr;
}

// Runs one screening prompt (scoring, brief or email) on Gemini and returns its JSON answer.
// The page builds the prompts from anonymised CV text; no names or contact details reach this route.
// An optional JSON schema from the page pins the reply's shape.
export default async function handler(req, res) {
  if (!authorize(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ code: "method_not_allowed", error: "Method not allowed." });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ code: "server_config", error: "GEMINI_API_KEY is not set. Add it in Vercel > Settings > Environment Variables." });
    return;
  }
  const body = req.body || {};
  const prompt = String(body.prompt || "");
  if (!prompt.trim()) {
    res.status(400).json({ code: "bad_request", error: "Prompt is empty." });
    return;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    res.status(413).json({ code: "prompt_too_large", error: "This CV is too long to score." });
    return;
  }
  let schema = null;
  if (body.schema != null) {
    if (!isPlainObject(body.schema) || JSON.stringify(body.schema).length > MAX_SCHEMA_CHARS) {
      res.status(400).json({ code: "bad_request", error: "Invalid response schema." });
      return;
    }
    schema = body.schema;
  }

  genai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const { json, model } = await generate(prompt, schema);
    res.status(200).json({ json, model });
  } catch (err) {
    if (err instanceof BadReply) {
      if (err.code === "refused") res.status(422).json({ code: "refused", error: "Gemini declined this request." });
      else res.status(502).json({ code: "invalid_json", error: "Gemini's reply couldn't be read, even after retrying. Try again." });
      return;
    }
    if (err instanceof ApiError) {
      if (isBusy(err)) {
        console.error(err);
        res.status(503).json({ code: "ai_busy", error: "Gemini is overloaded right now. Wait a minute and press Try again." });
      } else if (err.status === 429) {
        res.status(429).json({ code: "rate_limited", error: "Gemini's free-tier limit was reached. Wait a minute, or try again tomorrow if the daily limit is used up." });
      } else if ((err.status === 400 && /api key/i.test(err.message)) || err.status === 401 || err.status === 403) {
        res.status(500).json({ code: "server_config", error: "Gemini rejected the API key. Check GEMINI_API_KEY in Vercel." });
      } else if (err.status === 404) {
        res.status(500).json({ code: "server_config", error: `None of the Gemini models (${MODELS.join(", ")}) are available to this key. Set GEMINI_MODEL in Vercel to a model your key can use.` });
      } else if (err.status >= 400 && err.status < 500) {
        console.error(err);
        res.status(400).json({ code: "bad_request", error: "Gemini rejected the request." });
      } else {
        console.error(err);
        res.status(502).json({ code: "upstream_error", error: "The Gemini API had a problem. Try again." });
      }
      return;
    }
    console.error(err);
    res.status(502).json({ code: "upstream_error", error: "Couldn't reach the Gemini API. Try again." });
  }
}
