---
description: The day sheet: who is in, with whom, for what, and what to know before they arrive (no script, consent, cooling-off, under age, medical flags, money owing).
---

1. Run `node scripts/clinic.mjs day --json` (add `--date=tomorrow` or a date when asked).
2. Show it as a table by time. The `before_they_arrive` column is the point: read it out.
3. Anything marked NO SCRIPT, UNDER AGE, COOLING-OFF or CONSENT cannot be treated as booked. Say what fixes it before the client walks in: a prescriber consultation by video, a fresh written consent, a new date after the cooling-off, or a cancellation with the reason explained.
4. Medical flags (blood thinners, cold sores, pregnancy) go to the practitioner, not the front desk.
