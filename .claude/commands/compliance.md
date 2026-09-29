---
description: Check the records against the rules a cosmetic clinic lives under: records complete, scripts after a real-time consultation, nothing for under-18s, consents complete, cooling-off respected, batches recorded, photos covered, no packages on procedures, practitioners covered, complications managed. Each rule cites its source.
---

1. Run `node scripts/clinic.mjs compliance --json`.
2. Report as a table: rule, OK or BREACH, what was found, the source. Breaches first.
3. For each breach, the fix the operator can approve: write and finalise the record, complete the consent, refund the deposit or the package, take the photo down, record the renewal.
4. `docs/compliance.md` holds each rule and its source. If a rule looks out of date, say so and stop. Do not guess at the guidelines: the operator confirms the rule, then the doc and the check change together.

Nothing here is legal advice. The doc records the rules the clinic has told the system to enforce.
