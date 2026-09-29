# Kargo Hiring Desk

Screens Product Manager (PM) and Senior Product Manager (SPM) candidates against Kargo's v2 rubrics. Upload CVs and the dashboard ranks candidates, scores them on both rubrics, writes an interview brief and drafts an invite or rejection email for each one.

## How it works

1. **Upload.** Drop in PDF, Word (.docx) or text CVs and choose the roles they applied for.
2. **Anonymise.** Names, email addresses, phone numbers and profile links are removed in the browser before anything goes to Claude. The city is kept for the Mumbai gate.
3. **Score.** Claude scores every criterion of both rubrics 1–5, with a reason taken from the CV. The page calculates the weighted totals: sum of weight × score ÷ 5, out of 100.
   - 75 and above: advance
   - 60–74: interview, and probe the lowest-scoring criterion
   - Under 60: pass
   - Scores within 2 points of a threshold are flagged as borderline.
4. **Brief and email.** Claude writes an interview brief and a draft email. Names are filled in on the page, never sent to Claude.
5. **Save.** Every screened candidate and their original CV file are stored in Neon Postgres.
6. **Send.** "Open in Gmail" opens a ready-to-send draft in your own Gmail. After sending, "Mark as sent" records it on the dashboard.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The dashboard, served at `/` |
| `api/session.js` | Checks the password and reports which settings are missing |
| `api/candidates.js` | Lists, saves, updates and deletes candidates in Neon |
| `api/cv.js` | Downloads a candidate's original CV |
| `api/ai.js` | Runs a screening prompt on Claude (`claude-opus-5`) |
| `lib/server.js` | Shared password check and Neon client |
| `db/schema.sql` | Database tables: `candidates` and `cv_files` |
| `kargo-hiring-desk/` | The original claude.ai Artifact version |

## Setup on Vercel

1. **Create the tables.** Run `db/schema.sql` on your Neon database. The Neon project **Mesa** already has these tables.
2. **Add environment variables** in Vercel → Project → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string (Neon console → Connect). The Vercel Neon integration can set this for you. |
   | `ANTHROPIC_API_KEY` | A Claude API key from console.anthropic.com |
   | `APP_PASSWORD` | The password people type to open the dashboard |

3. **Redeploy** so the variables take effect.

Every API route requires `APP_PASSWORD`. Candidate data and CV files never appear in this repository.

## Limits

- CV files over 3 MB are still screened, but the original file isn't stored.
- Scanned PDFs have no readable text; upload a Word or text version instead.
- Each CV makes two Claude calls, one for scoring and one for the brief and email, so a CV takes about a minute.
