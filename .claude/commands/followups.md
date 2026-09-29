---
description: Two-week reviews and rebooks due or overdue, with how each client may be contacted.
---

1. Run `node scripts/clinic.mjs followups --json` (`--days=30`, `--kind=review|rebook`).
2. Reviews first: they are clinical care, and anyone can be called.
3. Rebooks: message only clients who said yes to marketing; never-asked is a phone call; no means leave it until they book.
4. Record the contact: `node scripts/clinic.mjs followup contacted "Client"`; close one: `node scripts/clinic.mjs followup done|lapse "Client"`.
5. Messages draft with `/draft-rebook`.
