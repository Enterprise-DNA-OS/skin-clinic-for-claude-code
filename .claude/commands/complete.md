---
description: Close out a treatment: the gates speak (script, consent, age, cooling-off, indemnity), the batch is recorded, the record opens in draft, the invoice or package session is made, and the review and rebook dates are set.
---

1. For an injectable, ask for the batch number on the box and the quantity used if they were not given. Every injectable record names its batch.
2. Run `node scripts/clinic.mjs complete APT-... --batch=BATCH --qty=N --areas="..." --json`.
3. If it refuses, read out each reason and the fix. There is no override: no script, no treatment; no consent, no treatment; inside the cooling-off, no treatment.
4. Report the record opened, the invoice (or package session), and the review and rebook dates.
5. Then write it up: `/record`. A treatment is not done until its record is final.
6. Never record a discount on a cosmetic procedure. If the fee is wrong, the menu price changes (`/customise`).
