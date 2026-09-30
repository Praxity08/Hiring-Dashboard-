import { authorize, db, deepMerge, ID_RE, isPlainObject, readDataset, sendError, toJsonb } from "../lib/server.js";

const MAX_CV_BYTES = 3 * 1024 * 1024;
const CV_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = "bad_request";
  return err;
}

function readOnly() {
  const err = new Error("Sample data is read-only. Switch to Live to change candidates.");
  err.status = 403;
  err.code = "sample_read_only";
  return err;
}

function readId(req) {
  const id = String(req.query.id || "");
  if (!ID_RE.test(id)) throw bad("Missing or invalid candidate id.");
  return id;
}

export default async function handler(req, res) {
  if (!authorize(req, res)) return;
  try {
    const sql = db();

    if (req.method === "GET") {
      const dataset = readDataset(req);
      const rows = await sql`
        select c.id, c.data, f.filename as cv_filename, f.size_bytes as cv_size
        from candidates c
        left join cv_files f on f.candidate_id = c.id
        where c.dataset = ${dataset}
        order by c.updated_at desc`;
      res.status(200).json({
        candidates: rows.map((r) => ({
          ...r.data,
          id: r.id,
          cv: r.cv_filename ? { filename: r.cv_filename, size: r.cv_size } : null,
        })),
      });
      return;
    }

    if (req.method === "POST") {
      const { id, data, cv } = req.body || {};
      if (!ID_RE.test(String(id || ""))) throw bad("Missing or invalid candidate id.");
      if (!isPlainObject(data)) throw bad("Candidate data must be an object.");
      if (readDataset(req) === "sample" || String(id).startsWith("sample-")) throw readOnly();
      const [existing] = await sql`select dataset from candidates where id = ${id}`;
      if (existing && existing.dataset !== "live") throw readOnly();
      const queries = [
        sql`insert into candidates (id, data, dataset) values (${id}, ${toJsonb(data)}::jsonb, 'live')
            on conflict (id) do update set data = excluded.data, updated_at = now()
            where candidates.dataset = 'live'`,
      ];
      if (cv) {
        const bytes = Buffer.from(String(cv.base64 || ""), "base64");
        if (!bytes.length) throw bad("The CV file is empty.");
        if (bytes.length > MAX_CV_BYTES) throw bad("CV files can be at most 3 MB.");
        const mime = CV_TYPES.has(cv.mimeType) ? cv.mimeType : "application/octet-stream";
        const filename = String(cv.filename || "cv").slice(0, 200);
        queries.push(sql`
          insert into cv_files (candidate_id, filename, mime_type, size_bytes, content)
          values (${id}, ${filename}, ${mime}, ${bytes.length}, decode(${bytes.toString("hex")}, 'hex'))
          on conflict (candidate_id) do update set filename = excluded.filename, mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes, content = excluded.content, uploaded_at = now()`);
      }
      await sql.transaction(queries);
      res.status(200).json({ ok: true, id });
      return;
    }

    if (req.method === "PATCH") {
      const id = readId(req);
      const patch = (req.body || {}).patch;
      if (!isPlainObject(patch)) throw bad("Patch must be an object.");
      const [row] = await sql`select data, dataset from candidates where id = ${id}`;
      if (!row) {
        res.status(404).json({ code: "not_found", error: "That candidate no longer exists." });
        return;
      }
      if (row.dataset !== "live") throw readOnly();
      const merged = deepMerge(row.data, patch);
      await sql`update candidates set data = ${toJsonb(merged)}::jsonb, updated_at = now() where id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const id = readId(req);
      const [row] = await sql`select dataset from candidates where id = ${id}`;
      if (row && row.dataset !== "live") throw readOnly();
      await sql`delete from candidates where id = ${id} and dataset = 'live'`;
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    res.status(405).json({ code: "method_not_allowed", error: "Method not allowed." });
  } catch (err) {
    sendError(res, err);
  }
}
