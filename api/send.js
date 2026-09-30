import { createHash } from "node:crypto";
import { authorize, db, deepMerge, ID_RE, sendError, toJsonb } from "../lib/server.js";

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;

function fail(res, status, code, error) {
  res.status(status).json({ code, error });
}

// Sends one candidate email through Resend and records the send on the candidate.
// With EMAIL_TEST_TO set, every email goes to that address instead of the candidate.
export default async function handler(req, res) {
  if (!authorize(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method_not_allowed", "Method not allowed.");
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return fail(res, 500, "email_config", "Email isn't set up. Add RESEND_API_KEY and EMAIL_FROM in Vercel > Settings > Environment Variables.");
  }

  const { id, to, subject, body, kind, role, again } = req.body || {};
  const recipient = String(to || "").trim();
  if (!ID_RE.test(String(id || ""))) return fail(res, 400, "bad_request", "Missing or invalid candidate id.");
  if (!EMAIL_RE.test(recipient)) return fail(res, 400, "bad_request", "That email address doesn't look right.");
  if (!String(subject || "").trim() || String(subject).length > 300) return fail(res, 400, "bad_request", "Add a subject under 300 characters.");
  if (!String(body || "").trim() || String(body).length > 20000) return fail(res, 400, "bad_request", "Add a message under 20,000 characters.");
  if (!["invite", "reject"].includes(kind) || !["PM", "SPM"].includes(role)) return fail(res, 400, "bad_request", "Unknown email type or role.");

  try {
    const sql = db();
    const [row] = await sql`select data, dataset from candidates where id = ${id}`;
    if (!row) return fail(res, 404, "not_found", "That candidate no longer exists.");
    if (row.dataset !== "live") return fail(res, 403, "sample_read_only", "Sample candidates can't be emailed. Switch to Live to send.");
    if (row.data.sent && !row.data.sent.test && !again) {
      return fail(res, 409, "already_sent", `An email was already sent to ${row.data.sent.to}. Use Send again to send another.`);
    }

    const testTo = String(process.env.EMAIL_TEST_TO || "").trim();
    const deliverTo = testTo || recipient;
    const payload = {
      from,
      to: [deliverTo],
      subject: testTo ? `[Test for ${recipient}] ${subject}` : String(subject),
      text: String(body),
    };
    if (process.env.EMAIL_REPLY_TO) payload.reply_to = process.env.EMAIL_REPLY_TO;

    // Same candidate + same content within 24 hours = one email, even after a double click or a retry.
    const digest = createHash("sha256").update([id, deliverTo, payload.subject, payload.text].join("\n")).digest("hex").slice(0, 40);
    const idempotencyKey = `kargo-${id}-${digest}${again ? "-" + Date.now() : ""}`.slice(0, 256);

    let r;
    try {
      r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      });
    } catch {
      return fail(res, 502, "upstream_error", "Couldn't reach Resend. Check the Resend dashboard before sending again.");
    }
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = out && out.message ? ` Resend says: ${out.message}` : "";
      if (r.status === 401 || r.status === 403) return fail(res, 500, "email_config", `Resend rejected the request. Check RESEND_API_KEY and that the EMAIL_FROM domain is verified in Resend.${detail}`);
      if (r.status === 422 || r.status === 400) return fail(res, 400, "bad_request", `Resend couldn't send this email.${detail}`);
      if (r.status === 429) return fail(res, 429, "rate_limited", "Resend's sending limit was reached. Try again in a minute.");
      if (r.status === 409) return fail(res, 409, "in_progress", "This email is already being sent. Refresh in a moment.");
      console.error("Resend error", r.status, out);
      return fail(res, 502, "upstream_error", "Resend didn't confirm the send. Check the Resend dashboard before sending again.");
    }

    const sent = { at: new Date().toISOString(), to: deliverTo, intendedTo: recipient, test: Boolean(testTo), kind, role, provider: "resend", messageId: out.id || null };
    try {
      const merged = deepMerge(row.data, { email: { kind, role, subject: String(subject), body: String(body) }, sent, contactEmail: recipient });
      await sql`update candidates set data = ${toJsonb(merged)}::jsonb, updated_at = now() where id = ${id}`;
    } catch (err) {
      console.error(err);
      return res.status(200).json({ ok: true, sent, recorded: false });
    }
    res.status(200).json({ ok: true, sent, recorded: true });
  } catch (err) {
    sendError(res, err);
  }
}
