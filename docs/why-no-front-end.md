# Why there is no front end

Pabau is a database with a subscription. Underneath it are ordinary tables: clients, appointments, consents, treatment notes, products, invoices. What you pay for, per user and per location, is the layer on top that lets people who do not write queries get at them. Screens, filters, dashboards, forms.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it runs the query and explains the answer. Ask a question the dashboard never had a chart for ("every client who got batch TA2406", "whose script runs out before their booking") and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, against your own records.
- **No seats.** Add an injector or a receptionist and the bill does not move.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time.
- **Rules that match your clinic.** Your consent groups, your rebook intervals, your review days are settings and a migration away, not a feature request.

## What you give up

- **A client-facing booking page and a tablet consent form.** Clients do not book or sign here themselves. Enterprise DNA builds both into an installed version when a clinic wants them.
- **A phone app and a photo gallery.** Photos stay on the clinic's secure storage and the record holds the file path. It runs where Claude Code runs.
- **Card payments and SMS.** Payments are recorded here, not processed. Messages draft to `drafts/` and a person sends them.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for clinics that want someone to call.

## Who this fits

Owner-led clinics with one to a few injectors who would rather ask than click, and who want the rules (scripts, consents, cooling-off, batches) enforced by the system instead of remembered. If your front desk needs a screen open all day, Enterprise DNA builds one on top of the same database.

Installed and run for you: https://enterprisedna.co/omni/instead-of/pabau
