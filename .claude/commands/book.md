---
description: The appointment book for the next week (or any range), unconfirmed bookings loud.
---

1. Run `node scripts/clinic.mjs book --json` (add `--days=14` or `--practitioner=NAME` when asked).
2. Present day by day: who is in, with whom, for what. UNCONFIRMED rows are tomorrow's no-shows unless someone calls.
3. Point out the gaps in each injector's day, and the reviews and rebooks from `node scripts/clinic.mjs followups --json` that could fill them.
