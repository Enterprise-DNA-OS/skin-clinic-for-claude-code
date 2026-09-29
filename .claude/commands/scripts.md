---
description: Current scripts: who is covered for which injectable, up to what dose, until when.
---

1. Run `node scripts/clinic.mjs scripts --json` (add a client name for one client, `--all` for used and expired ones).
2. Table: ref, client, prescriber, consultation date and mode, for, up to, used, valid until.
3. Cross-check with `node scripts/clinic.mjs book --days=30 --json`: anyone booked for an injectable whose script runs out first needs a prescriber consultation booked.
