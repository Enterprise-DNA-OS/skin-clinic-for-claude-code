---
description: Sell retail skincare across the counter. Prescription-only products never sell.
---

1. Run `node scripts/clinic.mjs sell "Client" SKU [--qty=N] [--owing] --json`.
2. It takes the stock from the batch that expires first and raises a paid invoice (or owing, with `--owing`).
3. A prescription-only product is refused: it is given in a treatment under a script.
