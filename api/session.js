import { authorize } from "../lib/server.js";

// Checks the password and reports which server settings are in place, so the page can explain what's missing.
export default function handler(req, res) {
  if (!authorize(req, res)) return;
  res.status(200).json({
    ok: true,
    configured: {
      database: Boolean(process.env.DATABASE_URL),
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
}
