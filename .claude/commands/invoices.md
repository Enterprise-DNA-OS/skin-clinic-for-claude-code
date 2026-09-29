---
description: Invoices with money owing, and recording a payment.
---

1. List: `node scripts/clinic.mjs invoices --json` (`--all` for paid ones too).
2. Record a payment: `node scripts/clinic.mjs pay INV-... [--amount=DOLLARS --method=card]`.
3. `npm run docs -- invoice` renders tax invoices.
