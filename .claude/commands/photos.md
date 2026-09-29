---
description: Before and after photos and the consent behind each one. Advertising use needs a separate consent, and a withdrawal stops it.
---

1. List: `node scripts/clinic.mjs photos [--advertising] --json`. Anything marked ADVERTISING, NO CONSENT comes down wherever it is published.
2. Record consent: `node scripts/clinic.mjs photo consent "Client" --level=clinical|advertising|withdraw`. Advertising consent is separate from treatment consent, in writing, and the client sees the images first.
3. Add a photo: `node scripts/clinic.mjs photo add "Client" --file=PATH --record=TRX-... --kind=before|after|progress [--advertising]`. The file sits on the clinic's secure storage, never a personal phone.
