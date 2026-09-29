---
description: Book a client in. Toxin and filler are refused for anyone under 18 or with no date of birth; the booking warns if the script, consent or cooling-off is not in place for the day.
---

1. Confirm the client, the treatment (see `node scripts/clinic.mjs treatments`), the practitioner, the date and the time. If the client is new, `node scripts/clinic.mjs client add "Name" --dob=YYYY-MM-DD --phone= --email=` first: the date of birth decides what they can be booked for.
2. Run `node scripts/clinic.mjs book add "Client" --treatment=CODE --practitioner=NAME --date=YYYY-MM-DD --time=HH:MM [--notes="..."] --json`.
3. If it refuses (under 18, double booked, outside hours, not an injector), say why in one line and offer the nearest alternative.
4. Read every warning back: no script yet means a prescriber consultation must happen before the day (`/consult`); no consent means it is taken in writing at the visit; a cooling-off means the date must move.
