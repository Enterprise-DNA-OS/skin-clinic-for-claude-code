---
description: Trace a batch to every client who received it: the list to call if the supplier or the TGA recalls it.
---

1. Run `node scripts/clinic.mjs trace BATCH --json`.
2. Table: date, record, client, phone, practitioner, quantity.
3. If this is a real recall, write the facts from the supplier's notice into a note on each client (`/log`) and draft the contact (`/draft-reminders`); a person sends it. Nothing here contacts anyone.
