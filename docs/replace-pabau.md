# Moving off Pabau

What to export from Pabau, how to bring it across, what maps, and what deliberately starts fresh.

## 1. Export from Pabau

Pabau has no single "export everything" button. Clients and appointments come out as reports (Pabau help centre, *How to Export Reports* and *Manage Data Export*):

1. **Clients.** Analytics, then Reports, then a report from the Clients section (add columns for date of birth, mobile, email, medical alerts, source and the marketing opt-in if your report has them). Three dots in the top right, Export, choose CSV. Then Analytics, Options, Exports, and Download the file.
2. **Appointments.** The same, from the Appointments section, with client name, service, employee, date, start time and status. Include as much history as you want rebook dates for; a year is usually enough.
3. **Products** (optional). The products page has its own Export button. Use it as a checklist when you receive stock here: stock is received by batch, so it is counted in, not imported.

What Pabau does not export in bulk: medical forms and consent forms (the help centre says these download one by one from each client card), and photos. Keep them where they are as your retention copy.

## 2. Get the menu and the team right first

The importer matches each appointment's service to the treatment menu and its employee to the team. Before importing:

- `node scripts/clinic.mjs treatments` and add any service you still offer with `/customise` (code, name, kind, whether it needs a script, the consent group, fee, review and rebook intervals).
- `node scripts/clinic.mjs team` and add each practitioner with `practitioner add`, with their registration, whether they prescribe or inject, and their indemnity date.

## 3. Import, dry run first

```bash
node scripts/clinic.mjs import pabau --clients=Clients.csv --appointments=Appointments.csv --dry-run
node scripts/clinic.mjs import pabau --clients=Clients.csv --appointments=Appointments.csv
```

The dry run writes nothing and lists who would land, the past treatments and bookings that would come across, and every row it would skip with the reason. Run it again without `--dry-run` when it reads right. Running the import twice creates nothing twice.

## What maps

| Pabau | Here |
|---|---|
| First name + last name, or client name | `clients.name` (matched case-insensitively; an existing client is filled in, never duplicated) |
| DOB / date of birth (DD/MM/YYYY) | `clients.date_of_birth` (decides the under-18 rules, so check the skipped list for unreadable ones) |
| Mobile / phone, email | `clients.phone`, `clients.email` |
| Medical alerts | `clients.medical_flags` |
| Source | `clients.source` |
| Opt in / marketing column, if the report has one | `clients.marketing_opt_in` (a blank stays "never asked") |
| Completed appointments in the past | a completed appointment and a treatment record marked as imported, so each client's rebook date is set from their last treatment |
| Future appointments | bookings in the book |
| Cancelled and no-show appointments | not carried across (named in the skipped list) |

## What starts fresh, and why

- **Consents.** Every client gives a fresh written consent here at their first visit: the system will not treat without one, and a consent that exists only as a PDF in another system cannot be checked.
- **Scripts.** A script comes from a prescriber consultation. The first injectable here starts with one.
- **The clinical record.** Imported treatments carry the date, the treatment and the practitioner, and a note that the detail stays in the Pabau export. They are not judged by the compliance checks as if they were given here.
- **Photos.** Stay in Pabau's export or your own storage. Record new ones here with the consent that covers them.
- **Stock.** Counted in by batch with `stock receive`, so every syringe from day one traces to a batch.

## Enterprise DNA can do this for you

Mapping a report whose columns differ from the ones above, bringing medical form PDFs into a folder per client, loading the menu, the team and a stock take by batch, and running the first week alongside Pabau: that is what Enterprise DNA does when it installs this for a clinic. <https://enterprisedna.co/omni/instead-of/pabau>
