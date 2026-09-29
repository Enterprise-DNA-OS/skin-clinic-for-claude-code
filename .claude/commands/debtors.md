---
description: Who owes the clinic, largest first.
---

1. Run `node scripts/clinic.mjs debtors --json`.
2. Table: client, invoices, owing, oldest in days. Anything past 14 days gets a reminder draft (`/draft-reminders`) or is taken at the next visit.
