# The rule book

The rules this system enforces, where each comes from, and the command that checks it. `/compliance` runs every check against the records and cites the source beside each result.

Nothing here is legal advice. This is the list of rules the clinic has told the system to enforce. The guidelines change: when one does, the clinic confirms the new rule, and this page and the check change together in one commit.

## The sources

- **The Ahpra guidelines.** Ahpra and the National Boards (other than the Medical Board), *Guidelines for registered health practitioners who perform non-surgical cosmetic procedures*, in effect from 2 September 2025. They cover nurses, nurse practitioners, dentists and other registered practitioners who give injectables and other non-surgical cosmetic procedures. <https://www.ahpra.gov.au/Resources/Cosmetic-surgery-hub/Cosmetic-procedure-guidelines.aspx>
- **The Medical Board guidelines.** Medical Board of Australia, *Guidelines for registered medical practitioners who perform cosmetic surgery and procedures* (2023). Doctors follow these; the 2025 guidelines were written to bring every other registered practitioner into line with them. <https://www.medicalboard.gov.au/codes-guidelines-policies/cosmetic-medical-and-surgical-procedures-guidelines.aspx>
- **The Therapeutic Goods Act 1989 (Cth)**, s 42DL, and the TGA's guidance on advertising cosmetic injectables: a prescription-only medicine is not advertised to the public, by name or by allusion.
- **The TGA Uniform Recall Procedure for Therapeutic Goods**: a recall reaches the people who received the batch, which only works if the clinic can say who they were.
- **The Spam Act 2003 (Cth)** and the **Unsolicited Electronic Messages Act 2007 (NZ)**: commercial electronic messages only with consent, and with an unsubscribe.
- **State and territory drugs and poisons law**: permits, prescribing, records, storage and supply of scheduled medicines, which the Ahpra guidelines (s6.1) require practitioners to follow.

New Zealand clinics: the Medicines Act 1981 governs prescription medicines, and the Health Information Privacy Code 2020 governs the record and the photos. The Ahpra guidelines do not bind a New Zealand practitioner, but most clinics run to them; turn off any rule you do not want with `/customise`.

## The rules

| Rule | What the system does | Source | Checked by |
|---|---|---|---|
| **Scripts after a real-time consultation** | A prescription-only injectable is never given without a current script for that one client, from a prescriber on the team, after an in-person or video consultation. There is no way to record a script by text, email, phone form or online questionnaire, and a script belongs to one client (no batch prescribing). The dose given cannot exceed the script. | Ahpra guidelines s3.1 to s3.3; Medical Board guidelines | `consult` refuses; `complete` refuses; `compliance` rule `scripts` |
| **Nothing for under-18s** | Toxin and filler are never booked, prescribed or given to a client under 18, or to a client with no date of birth on file. | Ahpra guidelines s4.2; Medical Board guidelines | `book add`, `consult` and `complete` refuse; `compliance` rule `under-18` |
| **Written consent, complete** | A cosmetic procedure needs a current written consent for that kind of treatment, with the financial consent recorded and a copy given to the client. A consent covers repeat treatments of the same kind for `consent_months` (12). | Ahpra guidelines s5.1 to s5.3 | `complete` refuses; `compliance` rule `consent` |
| **The under-18 cooling-off** | A client under 18 at signing waits at least `cooling_off_days` (7) between consent and any cosmetic procedure, and no money is taken before then other than for the consultation. | Ahpra guidelines s4.5 and s4.6; Medical Board guidelines | `complete` and `deposit` refuse; `compliance` rule `cooling-off` |
| **Product and batch on every injectable** | Every injectable record names the product and the batch it came from, an expired batch is never used, and every delivery is received by batch. `trace` lists everyone who received a batch. | Ahpra guidelines s6.1 and s7.6; TGA Uniform Recall Procedure | `complete` refuses; `stock receive` refuses expired stock; `compliance` rule `batches` |
| **A record another practitioner can take over from** | Every treatment gets a record with areas, notes, aftercare given and (for an injectable) the batch, finalised within `record_due_days` (1). A final record is never edited: the database refuses it; corrections are addenda. | Ahpra guidelines s7.6 and s7.7 | `record final` refuses an incomplete record; `compliance` rule `records` |
| **Photos with consent** | A photo is recorded only with photo consent, kept on the clinic's storage (never a personal phone), and marked for advertising only with a separate advertising consent. A withdrawal takes every photo of that client off advertising the same day. | Ahpra guidelines s5.5 to s5.11 | `photo add` refuses; `photo consent --level=withdraw`; `compliance` rule `photos` |
| **No inducements** | No package, discount or free procedure on a cosmetic procedure. Packages are for skin treatments outside the guidelines (peels, facials). | Ahpra guidelines s14.2 and s14.4 | `package sell` and `complete --discount` refuse; `compliance` rule `inducements` |
| **Registered and covered** | A cosmetic procedure is given by a registered practitioner whose professional indemnity cover is current on the day. Cover ending within `indemnity_warn_days` (30) is raised. | Ahpra guidelines (application); the Boards' professional indemnity insurance registration standards | `complete` refuses; `attention`; `compliance` rule `practitioners` |
| **Complications managed** | Every complication has the action taken recorded, a serious one records who it was escalated to, and an open one with nobody booked to see the client tops the attention list. | Ahpra guidelines s7.3 to s7.5 | `attention`; `compliance` rule `complications` |
| **No medicine names in messages** | Drafts to clients never name a prescription-only medicine or its brand. | Therapeutic Goods Act 1989 s 42DL; TGA guidance on advertising cosmetic injectables | `/draft-reminders`, `/draft-rebook` and `/draft-review` instructions |
| **Messages with consent** | Rebook and marketing drafts only address clients who opted in; never-asked is a phone call. A two-week review is care, not marketing. | Spam Act 2003 (Cth); Unsolicited Electronic Messages Act 2007 (NZ) | `followups`; `/draft-rebook` |
| **No prescription-only products over the counter** | A product marked prescription-only never sells as retail. | State and territory drugs and poisons law; Ahpra guidelines s6.1 | `sell` refuses |

## What is not checked here

- Whether the procedure is clinically appropriate, the assessment itself, and the content of the written information given before consent. Those are the practitioner's; the system records that consent was taken, not what was said.
- Advertising outside the drafts this system writes (the clinic's website and social media).
- The clinic's own permits and licences (a state poisons permit, a laser licence where the state requires one). Add them as a rule with `/customise` if you want them tracked.
