---
description: Draft appointment reminders, pre-treatment instructions and payment reminders to drafts/. Never sends.
---

1. Tomorrow's bookings: `node scripts/clinic.mjs day --date=tomorrow --json`. Owing: `node scripts/clinic.mjs debtors --json`.
2. For each, read the client's card (`node scripts/clinic.mjs client "Name" --json`) before writing.
3. Write one file per message to `drafts/YYYY-MM-DD-<client>-<purpose>.md`: plain, warm, short, the time and place, what to bring or avoid before treatment if the practitioner has set it, and how to reschedule.
4. Never name a prescription-only medicine or its brand in any message (Therapeutic Goods Act 1989 s42DL; see `docs/compliance.md`). Say "your appointment" or "your treatment".
5. Never send. List the files and stop.
