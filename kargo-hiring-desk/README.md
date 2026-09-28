# Kargo Hiring Desk

A hiring dashboard for screening Product Manager (PM) and Senior Product Manager (SPM) candidates against Kargo's v2 rubrics (28 Sep 2026).

Live version: https://claude.ai/artifact/R1zS4oE6SUA7SeVZTQHEdR (private to the owner)

## What it does

1. **Upload.** Drop in PDF, Word (.docx) or text CVs and choose the roles they applied for.
2. **Anonymise.** Names, email addresses, phone numbers and profile links are removed in the browser before any AI call. The city is kept for the Mumbai gate.
3. **Score.** Claude scores every criterion of both rubrics 1–5, with a reason taken from the CV. The page calculates the weighted totals: sum of weight × score ÷ 5, out of 100.
   - 75 and above: advance
   - 60–74: interview, and probe the lowest-scoring criterion
   - Under 60: pass
   - Scores within 2 points of a threshold are flagged as borderline.
4. **Brief and email.** Claude writes an interview brief (strengths, concerns, a probe, questions with what to listen for) and a draft invite or rejection email. Names are filled in on the page, never by the AI.
5. **Send.** The email goes out through the viewer's Gmail connector only after they press Send and confirm. Test mode, which is on by default, sends every email to a test address instead of the candidate.

## Running it

`index.html` is written for claude.ai Artifacts and depends on these runtime capabilities:

| Capability | Used for |
|---|---|
| `sample` | Scoring, briefs and email drafts |
| `db` | Storing candidates (collection `candidates`) |
| `mcp` | Sending email through Gmail's `send_message` tool |

Opened as a plain local file, the page renders but can't score CVs, save candidates or send email.

## Not included

Candidate CVs, the seeded candidate records and the source rubric file are kept out of this repository because they contain candidate information.
