---
description: Draft rebook messages for clients due back, only to those who said yes to marketing. Never sends.
---

1. Run `node scripts/clinic.mjs followups --kind=rebook --days=14 --json`.
2. Keep only clients with marketing opt-in yes. List the never-asked as phone calls and leave the no's alone.
3. One file each to `drafts/YYYY-MM-DD-<client>-rebook.md`: it has been a while, here is how to book. No price, no offer, no discount, no urgency (Ahpra guidelines s14; the Spam Act 2003 and the Unsolicited Electronic Messages Act 2007 for the opt-in), an unsubscribe line, and never the name of a prescription-only medicine or its brand.
4. Never send. List the files and stop.
