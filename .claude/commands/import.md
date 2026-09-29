---
description: Bring the clinic across from Pabau: clients and appointment history from Pabau's reports, dry run first.
---

1. In Pabau: Analytics, Reports, a Clients report, three dots, Export, CSV (then Options, Exports, Download). Do the same for an Appointments report with client, service, employee, date, start time and status.
2. Make sure every Pabau service the clinic still offers is on the menu (`node scripts/clinic.mjs treatments`) and every practitioner is on the team (`node scripts/clinic.mjs team`). Add what is missing with `/customise` and `practitioner add`.
3. Dry run: `node scripts/clinic.mjs import pabau --clients=Clients.csv --appointments=Appointments.csv --dry-run --json`. Read back who lands, what past treatments come across, and every skipped row with its reason.
4. Only after a yes: run it without `--dry-run`. It is idempotent; running it twice creates nothing twice.
5. Say plainly what does not come across: consents, scripts and medical forms (Pabau does not export them in bulk), and photos. Each client gives a fresh written consent at their first visit here. See `docs/replace-pabau.md`.
