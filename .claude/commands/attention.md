---
description: Everything that wants a decision this morning, worst first. An open complication outranks everything, then a treatment that cannot lawfully go ahead as booked (no script, under 18, inside the cooling-off), missing or draft treatment records, incomplete consents, advertising photos without consent, expired batches, packages on procedures, overdue reviews, expiring cover, debtors, stock, rebooks and unconfirmed bookings.
---

1. Run `node scripts/clinic.mjs attention --json`.
2. Present it worst first, grouped by reason, in the clinic's words. Lead with anything rank 1: a complication with nobody booked to see them, a treatment booked that cannot go ahead (no script, under 18, inside the cooling-off), a treatment with no record. Those are today's first jobs; say so plainly.
3. For each group, the one action that clears it: call the client and book them in, book the prescriber consultation (`/consult`), cancel and explain, `record write` then `record final`, `consent complete`, take the photo down, `stock writeoff`, refund the package, `/draft-rebook` or a phone call, `confirm APT-...`.
4. A review is clinical care and anyone can be called. A rebook is marketing: only clients who said yes get a message; never-asked means a phone call; no means leave it.
5. If the list is empty, say so in one line and stop.
