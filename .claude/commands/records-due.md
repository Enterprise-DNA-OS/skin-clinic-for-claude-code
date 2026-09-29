---
description: Every treatment without a final record, oldest first.
---

1. Run `node scripts/clinic.mjs records-due --json`.
2. Table: ref, date, days since, client, practitioner, treatment, missing or draft.
3. Group by practitioner, so each one sees their own list. Anything older than a day is overdue.
