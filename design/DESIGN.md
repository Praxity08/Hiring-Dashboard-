# AI Recruiter · Hiring Desk — Design Context (for Claude Code)

Reference: `Hiring Desk v2.dc.html` (current). v1 kept for history. Restyle the existing app to match; keep logic and copy.

## Assets
- `assets/logo.jpg` — AI recruiter wordmark (black on white). Render with `mix-blend-mode: multiply` so the white drops out on the off-white bg. Height 44px in header.
- Cat mascots (transparent PNG):
  - `assets/cat-fly.png` — hero, perched on top edge of dropzone (absolute, rotated −8°, 180px).
  - `assets/cat-laptop.png` — right side of "The board" heading, 92px.
  - `assets/cat-headphones.png` — empty board column state, 120px.
  - `assets/cat-glasses.png` — footer "How scoring works", 96px.
  - Column mascots (bottom of each board column, with caption):
    - Advance: `assets/cat-on-laptop.png` 120px — "Keyboard’s warm — send the invite."
    - Interview: `assets/cat-hanging.png` 120px — "Hanging in there — probe the gaps."
    - Pass: `assets/cat-tangled.png` (crop 220×95 window, img margin-top −120px) — "Not this time — send a kind no."
  - `assets/cat-loading.png` — screening toast (fixed bottom-left, ink pill, lime tile) "Sniffing through CVs…" shown while CVs are scored.

## Fonts (Google Fonts)
- Display: **Bricolage Grotesque** 500 (opsz axis) — H1, section titles, column titles, candidate name in drawer. Tight tracking (−0.02 to −0.035em).
- UI: **Instrument Sans** 400/500/600.
- Numbers: **JetBrains Mono** 400/500 — scores, file-type tags.

## Color tokens (oklch)
```
--bg:        oklch(0.972 0.01 112)   off-white page
--surface:   oklch(0.993 0.003 110)  cards
--ink:       oklch(0.20 0.015 125)   text, dark buttons, active tabs, pips
--ink-muted: oklch(0.48 0.02 120)
--line:      oklch(0.86 0.015 115)
--lime:      oklch(0.90 0.17 125)    primary CTA fill
--lime-hero: oklch(0.93 0.10 122)    hero panel
--lime-text: oklch(0.95 0.10 122)    text on dark ink buttons
--adv-tint:  oklch(0.90 0.15 125)    score ≥75
--int-tint:  oklch(0.94 0.07 95)     score 60–74
--pass-tint: oklch(0.90 0.07 25)     score <60 (soft terracotta)
--pass-dot:  oklch(0.66 0.17 25)
--col-adv:   oklch(0.95 0.05 122)    Advance column bg
--col-int:   oklch(0.955 0.03 100)
--col-pass:  oklch(0.955 0.03 25)
--warn:      oklch(0.52 0.13 65)     "Confirm relocation"
--danger:    oklch(0.50 0.13 30)     sign out
```

## Shape
Hero 32px radius · columns 26px · cards/drawer blocks 18–28px · buttons 14–20px · chips/tabs pill. Mostly flat; only the drawer has a shadow `0 30px 80px -30px oklch(0.2 0.03 125/.5)`.

## Layout
1. **Header**: logo · divider · "Kargo / PM & Senior PM · Rubrics v2" · Rank-by segmented pill (active = ink bg, lime text) · round ⚙ settings button (toggles an inline settings card).
2. **Hero** (lime panel, 2-col auto-fit): left — big H1 "Land on your next great PM.", sub, role toggle chips (ink outline; on = filled ink ✓), privacy note. Right — dashed dropzone card with cat perched on top, file chips inside; below it a full-width ink "Screen N CVs → both rubrics" button.
3. **The board**: 3 columns (Advance / Interview / Pass) with dot, range, count. Candidate card: name, city · gate, two score tiles (PM, Senior PM) tinted by band, hint line (better-fit / probe / best fit), dashed "borderline" chip when within ±2 of 60/75. Sorted by chosen rank within each column.
4. **Drawer** (click card): fixed right panel, header tinted by band with verdict pill, name, big mono score/100, rubric criteria with 5-pip bars (ink), note box, actions: lime "Send invite/decline", "Open in Gmail", "Mark as sent". Backdrop click closes.
5. **Footer**: ink top rule, "How scoring works" + 3 short columns.

## Interaction
Cards/dropzone lift 2px on hover. Focus ring `0 0 0 3px oklch(0.9 0.17 125/.45)`. Transitions 0.15–0.2s.
