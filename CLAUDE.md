# Skin Clinic for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Clinic:** [YOUR CLINIC]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a client, read their full card first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a client waits for a yes in this session.
6. **The client comes first.** An open complication is the first thing you mention, every time you see one.
7. **The record is part of the treatment.** A treatment without a final record, with its batch, is unfinished work; say so whenever you see one.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| "what needs my attention", "what's wrong this morning" | `/attention` |
| "the day sheet", "who is in today / tomorrow" | `/day` |
| "show me the book", "how's next week looking" | `/book` |
| "book X in", "can Jess fit a toxin Thursday" | `/new-appointment` |
| "X is done", "close out the 10 o'clock", "bill it" | `/complete` |
| "write up the treatment", "finalise my notes", "add an addendum" | `/record` |
| "what records are owing" | `/records-due` |
| "the doctor saw X by video", "record the script" | `/consult` |
| "who has a script", "whose script runs out" | `/scripts` |
| "X signed the consent", "consent for X" | `/consent` |
| "pull up X", "what do we know about X" | `/client` |
| "photos", "X wants her photos taken down", "can we use X's photos" | `/photos` |
| "X rang about a lump / swelling / bruising", "open complications" | `/complications` |
| "who's due a review", "who's due back" | `/followups` |
| "stock", "what do we need to order", "what's expiring" | `/stock` |
| "who got batch X", "there's a recall" | `/trace` |
| "sell X a sunscreen" | `/sell` |
| "packages", "sell X a peel package" | `/packages` |
| "what's owing", "invoices", "record a payment" | `/invoices` |
| "who owes us" | `/debtors` |
| "what did we take" | `/takings` |
| "retention", "who didn't come back" | `/retention` |
| "the team", "add a nurse", "Jess renewed her indemnity" | `/team` |
| "are we compliant", "check the rules" | `/compliance` |
| "Monday review", "how are we set for the week" | `/weekly-review` |
| "note that X rang...", "log the call" | `/log` |
| "remind tomorrow's clients", "chase the overdue invoices" | `/draft-reminders` |
| "check in on last fortnight's clients" | `/draft-review` |
| "rebook messages", "win back the ones who are due" | `/draft-rebook` |
| "bring our Pabau data across" | `/import` |
| "add a field", "change a fee", "our toxin rebook is 14 weeks" | `/customise` |
| "a page that shows..." | `/new-view` |

If an ask fits nothing here, run the CLI directly (`node scripts/clinic.mjs help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Clients archive, appointments cancel with a reason, the clinical record stays.
- A finalised treatment record never changes. Corrections are addenda. Do not look for a way around this; there is none.
- Never invent clinical content, doses, areas or batch numbers. Records carry the practitioner's words and numbers; if something was not said, it stays empty.
- Never give clinical advice. Record what the practitioner said and did; for anything urgent, the clinic's complications protocol applies.
- The CLI refuses: an injectable without a current script from a prescriber who saw the client in person or by video; toxin or filler under 18; a cosmetic procedure without a complete consent, or inside the cooling-off; a deposit inside the cooling-off; an expired batch; a package or discount on a cosmetic procedure; an advertising photo without a separate consent; a prescription-only product over the counter. Do not look for a way around any of them.
- Never name a prescription-only medicine or its brand in any message to a client or the public (Therapeutic Goods Act 1989 s42DL). Say "your treatment".
- Rebook and marketing messages only ever address clients who opted in. A two-week review is care, not marketing.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the rule book (`compliance.md`) and the guide for moving off Pabau.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/pabau
