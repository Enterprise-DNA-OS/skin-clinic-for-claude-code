---
description: Record a prescriber's consultation and the script it produced. In person or by video only, one client per script, and never toxin or filler under 18.
---

1. Confirm the prescriber (a doctor, nurse practitioner or dentist on the team), how they saw the client (in person or video), what was prescribed, the maximum dose and the areas.
2. Run `node scripts/clinic.mjs consult "Client" --prescriber=NAME --mode=in_person|video --product=toxin|filler|booster --max=N [--areas="..." --valid-days=60 --treatments=1] --json`.
3. If the ask is for a script by text message, email, phone form or questionnaire, say plainly that it cannot be recorded: the guidelines require a real-time consultation every time. Offer to book a video consultation instead.
4. Report the script reference, what it allows and until when.
