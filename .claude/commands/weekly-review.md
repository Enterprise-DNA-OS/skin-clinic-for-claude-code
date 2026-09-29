---
description: The Monday review, written from five commands: what needs a decision, the week's book, the clinical record, stock, and the money.
---

1. Run, `--json` each: `node scripts/clinic.mjs attention`, `book`, `compliance`, `batches --expiring`, `takings --days=7`. Add `retention` and `followups` when there is room.
2. Write four short sections, prose plus small tables, nothing invented:
   - **Today's decisions.** The attention list, worst first, one action each. An open complication or a treatment that cannot go ahead is the first line.
   - **The week's book.** Day by day: how full each injector is, what is unconfirmed, and which reviews and rebooks fit the gaps.
   - **The clinical record.** Records owing, scripts and consents running out, compliance breaches.
   - **Stock and money.** Batches to use first or write off, lines to reorder, last week's takings, who owes.
3. End with at most five actions for the week, each doable with one command or phone call.
4. On paper: `npm run view` renders the week, clinical and money pages in the clinic's brand.
