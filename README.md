<h1 align="center">Skin Clinic for Claude Code</h1>

<p align="center">
  <strong>The open-source aesthetic and skin clinic management system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Pabau data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=pabau">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/pabau?utm_source=github&utm_medium=readme&utm_campaign=pabau">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-pabau">Instead of Pabau</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Skin Clinic for Claude Code does the job you pay Pabau for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Pabau dashboard cannot.

Pabau prices by user and by location, and it does not publish an Australian price: every plan on [pabau.com/pricing](https://pabau.com/pricing/) is quoted on a demo call, and the extras (Marketing Plus, Care Plus, Insights Plus, Engage Plus) are quoted on top. Add an injector and the plan moves up a band. Open a second clinic and the price applies again.

Want the same thing with a client booking page, a consent form clients sign on a tablet, or card payments wired in? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=pabau).

This one covers the operating record of an injector-led aesthetic and skin clinic in Australia or New Zealand: the doctors, nurse practitioners, nurses and dermal therapists and what each may do, the client book, the treatment menu, the appointment book, **prescriber consultations and the scripts they produce**, **written consents with the under-18 cooling-off**, **the treatment record with the batch number of every syringe**, before and after **photos with the consent that covers them**, **complications**, two-week reviews and rebooks, **stock by batch**, skin packages, invoices and payments. The rules of the trade are built in as gates with their sources cited, from the Ahpra guidelines for non-surgical cosmetic procedures that took effect on 2 September 2025: an injectable is never given without a current script from a prescriber who saw that client in person or by video (a script by text or online form cannot even be recorded), toxin and filler are never booked for anyone under 18, a client under 18 waits seven days after consenting and pays nothing before then, a consent is not complete without the financial consent and a copy given, an expired batch is never used, a package or discount on a cosmetic procedure is refused, a photo goes into advertising only with a separate consent and comes out the day it is withdrawn, and a finalised record is never edited. Payment processing, SMS sending, the photos themselves and ePrescribing stay where they are, deliberately.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No per-user fee, no per-location fee, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/skin-clinic-for-claude-code.git
cd skin-clinic-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo clinic, Harbour Lane Skin Clinic in Wollongong, has a client with a firm, tender lump in her cheek three days after filler and nobody booked to see her, a client booked for toxin tomorrow whose only script has been used and has run out, a 17-year-old booked for lip filler, another 17-year-old booked for laser inside her seven-day cooling-off who has already paid a $200 deposit, a treatment two days ago with no record at all and another still in draft, a consent with no copy given, before and after photos still marked for advertising five days after the client withdrew consent, a toxin batch that expired ten days ago still on the shelf, a three-session toxin package sold last year, a two-week review six days overdue, a nurse injector whose indemnity cover ends in twenty days, a client whose script and consent both run out before her booking, and three clients past their rebook date: one said yes to messages, one was never asked, one said no. The answer shows you exactly how this system thinks.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-user fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first. An open complication outranks everything, then a treatment that cannot lawfully go ahead as booked |
| `/day` | The day sheet: who is in, and what to know before they arrive (no script, consent, cooling-off, medical flags, money owing) |
| `/book` | The appointment book, unconfirmed bookings loud |
| `/new-appointment` | Book a client in; toxin and filler are refused under 18, and missing scripts and consents are warned |
| `/complete` | Close out a treatment: the gates speak, the batch is recorded, the invoice and the review and rebook dates are made |
| `/record` | The treatment record: write it, finalise it, then addenda only |
| `/records-due` | Every treatment without a final record, oldest first |
| `/consult` | The prescriber's consultation, in person or by video, and the script it produced |
| `/scripts` | Who is covered for which injectable, up to what dose, until when |
| `/consent` | Written consent, financial consent and a copy given; the under-18 cooling-off starts here |
| `/client` | One client's whole card: treatments with batch, scripts, consents, complications, packages |
| `/photos` | Photos and the consent behind each; advertising only with a separate consent |
| `/complications` | Open complications, the action taken, who it went to, and whether the client is booked in |
| `/followups` | Two-week reviews and rebooks, with how each client may be contacted |
| `/stock` | Stock by batch: usable, expired on the shelf, first to expire, what to reorder |
| `/trace` | Every client who received a batch: the list for a recall |
| `/sell` | Retail skincare over the counter; prescription-only products never sell |
| `/packages` | Skin packages: sessions left, expiry, unused value; refused on cosmetic procedures |
| `/invoices` `/debtors` | What is billed and owing |
| `/takings` | Invoiced by line and by practitioner |
| `/retention` | Of the clients due back, how many came back, by injector |
| `/team` | Roles, registration, who prescribes and injects, indemnity cover; the menu |
| `/compliance` | The rule book run against the records, sources cited |
| `/weekly-review` | The Monday review written from five commands |
| `/log` | The conversation onto the client's card |
| `/draft-reminders` `/draft-review` `/draft-rebook` | Drafts to `drafts/`; a person sends them |
| `/import` | Bring the clinic across from Pabau, dry run first |
| `/customise` | Change a fee, a rebook interval, a consent group, a rule, in plain language |
| `/new-view` | A new read-only dashboard page, described in plain language |

`npm run view` renders the week, the clinical record (scripts, consents, batches, advertising photos) and the money (takings, debtors, packages, stock) as branded HTML pages. `npm run docs` renders tax invoices, the client's consent record (with the cooling-off stated), the client's aftercare sheet with the product and batch used, and the treatment record another practitioner can take over from.

## Instead of Pabau

In Pabau, run a Clients report and an Appointments report (Analytics, Reports, then Export as CSV from the three dots menu), then:

```bash
node scripts/clinic.mjs import pabau --clients=Clients.csv --appointments=Appointments.csv --dry-run
node scripts/clinic.mjs import pabau --clients=Clients.csv --appointments=Appointments.csv
```

The importer matches common column-name variants, is idempotent (re-running creates nothing twice), and names every row it skips. Each client's past treatments come across, so the rebook dates are right from the first day, and future bookings land in the book. Two things are deliberate: consents, scripts and medical forms do not come across (Pabau's own help centre says medical forms download one by one from each client card), so every client gives a fresh written consent at their first visit here; and the old clinical record stays in the Pabau export as your retention copy. [docs/replace-pabau.md](docs/replace-pabau.md) covers exactly what carries over, what starts fresh, and why.

### Ten questions your clinic software cannot answer

Each is one plain-language ask in Claude Code, and each is a command that runs today:

1. Who is booked this fortnight for toxin or filler without a current script, and when must the prescriber see them? (`attention`, `scripts`)
2. Which clients under 18 are booked for anything, and whose cooling-off has not finished? (`attention`, `consents`)
3. Every client who received batch TA2406, with a phone number, in one list for a recall. (`trace`)
4. Which open complications have nobody booked to see the client, and what was done so far? (`complications`, `attention`)
5. Which treatments have no final record, by practitioner, and how many days old is each? (`records-due`)
6. Whose consent or script runs out before their next booking? (`attention`)
7. Which before and after photos are in advertising without a current advertising consent? (`photos --advertising`, `compliance`)
8. Of each injector's clients who were due back this year, what share came back, and who has not? (`retention`)
9. Which batches expire in the next 45 days, which have already expired on the shelf, and what are they worth at cost? (`batches --expiring`)
10. Which rebooks are overdue, split into who can be messaged, who needs a call, and who said no? (`followups`, `attention`)

## Your first hour: ten things to ask for

1. "Walk me through everything on the attention list and what clears each one."
2. "Mia rang about a lump in her cheek. Who saw her, what batch went in, and when can Dr Chen see her?"
3. "Zara is in tomorrow for toxin. Can she be treated, and if not, what do we need?"
4. "Dr Chen saw Zara by video this morning: toxin, up to 40 units, frown, forehead and crow's feet. Record the script."
5. "Jess did Olivia's toxin two days ago: 30 units from TA2406, frown and forehead, aftercare given. Write it up."
6. "Chloe is 17 and booked for lip filler. What do we tell her?"
7. "Ruby wants her photos off our Instagram. Record it and show me what else of hers is in advertising."
8. "Which toxin batch do we use first, and what do we write off?"
9. "What is Jess's retention this year, and who should we call?"
10. "Import our clients and appointments from Pabau, dry run first."

## Architecture

```
skin-clinic-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/clinic.mjs        the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  views.json documents.json the dashboards and documents, as SQL
  docs/                     the thesis, the rule book and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Skin Clinic for Claude Code for your clinic, brings your Pabau clients and appointment history across with the rebook dates intact, loads your menu, your team, their prescribing and indemnity details and your stock by batch, sets up consent forms clients sign on arrival, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=pabau)
- Read more: [enterprisedna.co/omni/instead-of/pabau](https://enterprisedna.co/omni/instead-of/pabau?utm_source=github&utm_medium=readme&utm_campaign=pabau)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
