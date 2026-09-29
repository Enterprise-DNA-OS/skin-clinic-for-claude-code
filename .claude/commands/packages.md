---
description: Packages: sessions left, expiry, unused value. Packages are for skin treatments only; one on a cosmetic procedure is flagged for a refund.
---

1. List: `node scripts/clinic.mjs packages --json`.
2. Sell: `node scripts/clinic.mjs package sell "Client" --treatment=CODE --sessions=N --price=DOLLARS [--months=12]`. It refuses a cosmetic procedure: a package or discount on one is an incentive the guidelines forbid.
3. Point out packages close to expiry with sessions left: book the sessions in.
