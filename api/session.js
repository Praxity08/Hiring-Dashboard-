import { authorize } from "../lib/server.js";

// Checks the password and reports which server settings are in place, so the page can explain what's missing.
export default function handler(req, res) {
  if (!authorize(req, res)) return;
  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  res.status(200).json({
    ok: true,
    configured: {
      database: Boolean(process.env.DATABASE_URL),
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      email: emailReady,
      emailFrom: emailReady ? process.env.EMAIL_FROM : null,
      emailTestTo: emailReady ? (process.env.EMAIL_TEST_TO || "").trim() || null : null,
    },
  });
}
