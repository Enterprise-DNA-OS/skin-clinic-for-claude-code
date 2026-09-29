---
description: What the clinic invoiced by line (injectables, laser, skin, retail, packages), and each practitioner's treatments at menu price.
---

1. Run `node scripts/clinic.mjs takings --days=30 --json` (any number of days).
2. Two small tables: by line, by practitioner. Say which way it moved against the previous period if asked (run it twice).
