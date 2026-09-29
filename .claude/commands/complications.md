---
description: Open complications: what was reported, what was done, who it went to, and whether the client is booked to be seen.
---

1. List: `node scripts/clinic.mjs complications --json` (`--all` includes resolved).
2. New one: `node scripts/clinic.mjs complication add "Client" --severity=minor|moderate|serious --description="..." [--action="..." --escalated-to="..."]`. A serious one follows the clinic's emergency protocol: record who it was escalated to.
3. Progress: `node scripts/clinic.mjs complication update CMP-... --action="..."`; resolved: `node scripts/clinic.mjs complication resolve CMP-... --action="..."`.
4. Any open complication with nobody booked to see them is today's first call. Never give clinical advice here; record what the practitioner said and did.
