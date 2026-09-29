---
description: Take or complete a written consent: procedural and financial, copy given. A client under 18 starts a seven-day cooling-off, with no money taken before it ends.
---

1. Confirm the consent group (toxin, filler, booster, laser, peel), that the written information was given (risks, alternatives, the practitioner's qualifications, the full cost), that the financial consent is signed, and that the client has a copy.
2. Run `node scripts/clinic.mjs consent "Client" --group=GROUP --financial --copy [--by=PRACTITIONER] --json`.
3. For a client under 18, read back the cooling-off date: no procedure and no payment before it, other than the consultation. Encourage the client to talk it over with their GP in that week.
4. To finish one that was missing a piece: `node scripts/clinic.mjs consent complete CON-... --financial --copy`.
5. `npm run docs -- consent` renders the client's copy.
6. List consents with `node scripts/clinic.mjs consents [CLIENT] [--expiring] --json`.
