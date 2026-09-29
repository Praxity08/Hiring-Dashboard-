import Anthropic from "@anthropic-ai/sdk";
import { authorize } from "../lib/server.js";

const MODEL = "claude-opus-5";
const MAX_PROMPT_CHARS = 60000;

let anthropic = null;

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

// Runs one screening prompt (scoring, brief or email) and returns Claude's JSON answer.
// The page builds the prompts from anonymised CV text; no names or contact details reach this route.
export default async function handler(req, res) {
  if (!authorize(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ code: "method_not_allowed", error: "Method not allowed." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ code: "server_config", error: "ANTHROPIC_API_KEY is not set. Add it in Vercel > Settings > Environment Variables." });
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

  anthropic ??= new Anthropic();
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      res.status(422).json({ code: "refused", error: "Claude declined this request." });
      return;
    }
    if (response.stop_reason === "max_tokens") {
      res.status(502).json({ code: "invalid_json", error: "Claude's answer was cut short." });
      return;
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const json = parseJson(text);
    if (json === undefined) {
      res.status(502).json({ code: "invalid_json", error: "Claude's reply wasn't valid JSON." });
      return;
    }
    res.status(200).json({ json, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ code: "rate_limited", error: "Claude API rate limit reached. Try again shortly." });
    } else if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      res.status(500).json({ code: "server_config", error: "The Claude API key was rejected. Check ANTHROPIC_API_KEY in Vercel." });
    } else if (err instanceof Anthropic.BadRequestError) {
      console.error(err);
      res.status(400).json({ code: "bad_request", error: "Claude rejected the request." });
    } else if (err instanceof Anthropic.APIError) {
      console.error(err);
      res.status(502).json({ code: "upstream_error", error: "The Claude API had a problem. Try again." });
    } else {
      console.error(err);
      res.status(502).json({ code: "upstream_error", error: "Couldn't reach the Claude API. Try again." });
    }
  }
}
