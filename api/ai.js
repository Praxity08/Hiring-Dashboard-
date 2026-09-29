import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { authorize } from "../lib/server.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Used when the main model is overloaded or out of free-tier quota. Set GEMINI_FALLBACK_MODEL to "none" to turn off.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
const MODELS = [...new Set([MODEL, FALLBACK_MODEL].filter((m) => m && m !== "none"))];
const RETRY_DELAYS_MS = [2000, 5000];
const MAX_PROMPT_CHARS = 60000;

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
const isQuota = (err) => err instanceof ApiError && err.status === 429;

// Tries the main model (with short retries while it's busy), then the fallback model.
async function generate(prompt) {
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await genai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json", maxOutputTokens: 16000 },
        });
        return { response, model };
      } catch (err) {
        lastErr = err;
        if (isBusy(err) && attempt < RETRY_DELAYS_MS.length) {
          console.warn(`${model} busy (${err.status}), retrying in ${RETRY_DELAYS_MS[attempt]} ms`);
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        break;
      }
    }
    // Only move to the next model for overload or quota; other errors (bad key, bad request) would repeat there too.
    if (!(isBusy(lastErr) || isQuota(lastErr) || (lastErr instanceof ApiError && lastErr.status === 404))) break;
    console.warn(`${model} failed (${lastErr.status}), trying next model`);
  }
  throw lastErr;
}

// Runs one screening prompt (scoring, brief or email) on Gemini and returns its JSON answer.
// The page builds the prompts from anonymised CV text; no names or contact details reach this route.
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
  const prompt = String((req.body || {}).prompt || "");
  if (!prompt.trim()) {
    res.status(400).json({ code: "bad_request", error: "Prompt is empty." });
    return;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    res.status(413).json({ code: "prompt_too_large", error: "This CV is too long to score." });
    return;
  }

  genai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const { response, model } = await generate(prompt);

    const finish = response.candidates && response.candidates[0] && response.candidates[0].finishReason;
    if ((response.promptFeedback && response.promptFeedback.blockReason) || (finish && finish !== FinishReason.STOP && finish !== FinishReason.MAX_TOKENS)) {
      res.status(422).json({ code: "refused", error: "Gemini declined this request." });
      return;
    }
    if (finish === FinishReason.MAX_TOKENS) {
      res.status(502).json({ code: "invalid_json", error: "Gemini's answer was cut short." });
      return;
    }
    const json = parseJson(response.text || "");
    if (json === undefined) {
      res.status(502).json({ code: "invalid_json", error: "Gemini's reply wasn't valid JSON." });
      return;
    }
    res.status(200).json({ json, model });
  } catch (err) {
    if (err instanceof ApiError) {
      if (isBusy(err)) {
        console.error(err);
        res.status(503).json({ code: "ai_busy", error: "Gemini is overloaded right now. Wait a minute and press Try again." });
      } else if (err.status === 429) {
        res.status(429).json({ code: "rate_limited", error: "Gemini's free-tier limit was reached. Wait a minute, or try again tomorrow if the daily limit is used up." });
      } else if ((err.status === 400 && /api key/i.test(err.message)) || err.status === 401 || err.status === 403) {
        res.status(500).json({ code: "server_config", error: "Gemini rejected the API key. Check GEMINI_API_KEY in Vercel." });
      } else if (err.status === 404) {
        res.status(500).json({ code: "server_config", error: `The Gemini model "${MODELS.join('" or "')}" isn't available to this key. Set GEMINI_MODEL in Vercel to a model your key can use.` });
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
