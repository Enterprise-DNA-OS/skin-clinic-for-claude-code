---
description: The team: roles, registration, who prescribes and injects, indemnity cover, days and hours; the treatment menu.
---

1. Run `node scripts/clinic.mjs team --json` and `node scripts/clinic.mjs treatments --json`.
2. Flag anyone whose indemnity cover ends within 30 days.
3. Changes: `node scripts/clinic.mjs practitioner add "Name" --role= --registration= --indemnity= [--prescriber --injector --days= --hours=]` or `node scripts/clinic.mjs practitioner set "Name" --indemnity=YYYY-MM-DD`.
