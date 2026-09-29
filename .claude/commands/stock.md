---
description: Stock by batch: what is usable, what has expired on the shelf, what expires first and what to reorder. Receive deliveries by batch.
---

1. Run `node scripts/clinic.mjs stock --json` and `node scripts/clinic.mjs batches --expiring --json`.
2. Present: lines to reorder, expired batches still on the shelf (quarantine and write off: `node scripts/clinic.mjs stock writeoff BATCH --reason=expired`), batches to use first.
3. Receive a delivery: `node scripts/clinic.mjs stock receive SKU --batch=NUMBER --expires=YYYY-MM-DD --qty=N`. Every delivery is received by batch, or the recall trail breaks.
