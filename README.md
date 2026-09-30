# Kargo Hiring Desk

Screens Product Manager (PM) and Senior Product Manager (SPM) candidates against Kargo's v2 rubrics. Upload CVs and the dashboard ranks candidates, scores them on both rubrics, writes an interview brief and drafts an invite or rejection email for each one.

## How it works

1. **Upload.** Drop in PDF, Word (.docx) or text CVs and choose the roles they applied for.
2. **Anonymise.** Names, email addresses, phone numbers and profile links are removed in the browser before anything goes to Gemini. The city is kept for the Mumbai gate.
3. **Score.** Gemini scores every criterion of both rubrics 1–5, with a reason taken from the CV. The page calculates the weighted totals: sum of weight × score ÷ 5, out of 100.
   - 75 and above: advance
   - 60–74: interview, and probe the lowest-scoring criterion
   - Under 60: pass
   - Scores within 2 points of a threshold are flagged as borderline.
4. **Brief and email.** Gemini writes an interview brief and a draft email. Names are filled in on the page, never sent to Gemini.
5. **Save.** Every screened candidate and their original CV file are stored in Neon Postgres.
6. **Send.** Press Send and confirm, and the email goes out through Resend. The send is recorded on the candidate. Without Resend, "Open in Gmail" opens a draft instead, and "Mark as sent" records it.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The dashboard, served at `/` |
| `assets/` | Logo and cat mascots used by the dashboard, sized for the web |
| `api/session.js` | Checks the password and reports which settings are missing |
| `api/candidates.js` | Lists, saves, updates and deletes candidates in Neon |
| `api/cv.js` | Downloads a candidate's original CV |
| `api/ai.js` | Runs a screening prompt on Gemini (`gemini-3.8-flash` by default) |
| `api/send.js` | Sends a candidate email through Resend and records it |
| `lib/server.js` | Shared password check and Neon client |
| `db/schema.sql` | Database tables: `candidates` and `cv_files` |
| `design/` | Design reference: `DESIGN.md` spec, `Hiring Desk v2.dc.html` (current) and v1. Not deployed. |
| `kargo-hiring-desk/` | The original claude.ai Artifact version |

## Design

The interface follows `design/DESIGN.md` (AI Recruiter · Hiring Desk v2): lime hero with the upload area, a three-column board (Advance 75+, Interview 60–74, Pass under 60) and a candidate drawer. Fonts are Bricolage Grotesque, Instrument Sans and JetBrains Mono; colours are the oklch tokens at the top of `index.html`. To preview the reference, serve the repo root and open `design/Hiring Desk v2.dc.html`.

## Setup on Vercel

1. **Create the tables.** Run `db/schema.sql` on your Neon database. The Neon project **Mesa** already has these tables.
2. **Add environment variables** in Vercel → Project → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string (Neon console → Connect). The Vercel Neon integration can set this for you. |
   | `GEMINI_API_KEY` | A Gemini API key from aistudio.google.com. The free tier works. |
   | `GEMINI_MODEL` | Optional. Overrides the default model, `gemini-3.8-flash`. |
   | `GEMINI_FALLBACK_MODEL` | Optional. Comma-separated models to try when the main one is overloaded, out of quota or gives an unusable reply. Defaults to `gemini-3.7-flash,gemini-3.5-flash`; set `none` to turn off. |
   | `APP_PASSWORD` | The password people type to open the dashboard |
   | `RESEND_API_KEY` | A Resend API key with sending access |
   | `EMAIL_FROM` | Sender, e.g. `Arjun Mehta <hiring@yourdomain.com>`. The domain must be verified in Resend. |
   | `EMAIL_REPLY_TO` | Optional. Where candidate replies go. |
   | `EMAIL_TEST_TO` | Optional safety net. While set, every email goes to this address instead of the candidate. |

3. **Redeploy** so the variables take effect.

Every API route requires `APP_PASSWORD`. Candidate data and CV files never appear in this repository.

## Sending safeguards

- Every email needs a click on Send and a second click to confirm.
- A candidate who has already been emailed can't be emailed again by accident; it takes a deliberate "Send again".
- Each send carries an idempotency key, so a double click or retry within 24 hours never sends the same email twice.

## Limits

- CV files over 3 MB are still screened, but the original file isn't stored.
- Scanned PDFs have no readable text; upload a Word or text version instead.
- Each CV makes two Gemini calls, one for scoring and one for the brief and email.
- On Gemini's free tier, Google may use prompts to improve its products. CVs are anonymised first, but work history still goes to Google. Link a billing account to the key to stop this.
- Every request sends Gemini a JSON schema, so replies come back in exactly the shape the page reads.
- When Gemini is overloaded, the server retries twice, then moves down the fallback list. An unreadable reply is retried once first. If every model is busy, the dashboard asks you to try again in a minute.
- Try again resumes a CV where it stopped: if scoring finished and the brief failed, only the brief is redone.
- Free-tier rate limits apply. If screening stops with a limit message, wait a minute (or until the next day for the daily limit).
