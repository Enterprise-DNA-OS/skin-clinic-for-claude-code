---
description: The treatment record: write it, add the batch, finalise it, then addenda only. Another practitioner must be able to take over care from it.
---

1. To read one: `node scripts/clinic.mjs record TRX-... --json` (or the APT-... ref).
2. To write it: `node scripts/clinic.mjs record write TRX-...|APT-... --notes="..." --areas="..." --aftercare [--batch= --qty=] --json`. Use the practitioner's own words. Never invent clinical content, doses or areas; if something was not said, leave it empty and ask.
3. To finalise: `node scripts/clinic.mjs record final TRX-...`. It refuses without notes, areas, aftercare given (for a cosmetic procedure) and the batch (for an injectable). Say what is missing.
4. A final record never changes. Corrections: `node scripts/clinic.mjs record addendum TRX-... "text"`.
5. The client's aftercare sheet and the handover record render with `npm run docs -- aftercare` and `npm run docs -- treatment-record`.
