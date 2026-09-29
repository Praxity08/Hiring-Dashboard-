import { authorize, db, ID_RE, sendError } from "../lib/server.js";

// Returns the original CV file a candidate was screened from.
export default async function handler(req, res) {
  if (!authorize(req, res)) return;
  try {
    const id = String(req.query.id || "");
    if (!ID_RE.test(id)) {
      res.status(400).json({ code: "bad_request", error: "Missing or invalid candidate id." });
      return;
    }
    const [row] = await db()`
      select filename, mime_type, encode(content, 'base64') as b64
      from cv_files where candidate_id = ${id}`;
    if (!row) {
      res.status(404).json({ code: "not_found", error: "No CV file is stored for this candidate." });
      return;
    }
    const safeName = row.filename.replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Type", row.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(Buffer.from(row.b64, "base64"));
  } catch (err) {
    sendError(res, err);
  }
}
