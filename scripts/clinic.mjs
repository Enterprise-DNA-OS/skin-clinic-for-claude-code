#!/usr/bin/env node
// skin-clinic-for-claude-code: the one CLI. Claude Code slash commands call
// this; so can you.
//
//   node scripts/clinic.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system is an aesthetic and skin clinic's operating record the way
// Pabau sells it: the injectors, prescribers and therapists and their hours,
// the client book, the treatment menu, the appointment book, prescriber
// consultations (scripts), written consents, the treatment record with the
// batch in every syringe, photos with the consent that covers them,
// complications, reviews and rebooks, stock by batch, packages, invoices and
// payments. It sends nothing and connects to nothing: reminders and rebook
// messages draft to drafts/, and a person sends them.
//
// The gates, and there are no force flags (sources in docs/compliance.md):
//   * a prescription-only injectable is never given without a current
//     script for that client, from a prescriber, after an in-person or video
//     consultation; an asynchronous script cannot be recorded (Ahpra 2025
//     s3.2, s3.3)
//   * toxin and filler are never booked or given to a client under 18, or
//     to a client with no date of birth on file (s4.2)
//   * a cosmetic procedure needs a current written consent with the
//     financial consent recorded and a copy given; a client under 18 waits
//     the cooling-off period after consenting, and no deposit is taken
//     before it ends (s4.5, s4.6, s5.3)
//   * every injectable record names the batch it came from; an expired
//     batch is never used, and stock never goes below zero (s7.6)
//   * a finalised treatment record is never edited: corrections are addenda
//   * no package and no discount on a cosmetic procedure (s14.2, s14.4)
//   * a photo is recorded only with photo consent, and marked for
//     advertising only with an advertising consent that has not been
//     withdrawn (s5.5 to s5.10)
//   * a practitioner whose indemnity cover has ended does not treat
//   * prescription-only products never sell over the counter
//   * nobody is double-booked, and nothing is booked outside a
//     practitioner's recorded working days and hours
//   * no deleting records: appointments cancel with a reason, clients
//     archive, the clinical record stays

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getDb } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table, money as fmtMoney, price as fmtPrice, isoDate, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'aftercare', 'financial', 'copy', 'advertising', 'low', 'expiring', 'prescriber', 'injector', 'owing', 'archive', 'leave']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name; let value;
      if (eq > -1) { name = a.slice(2, eq); value = a.slice(eq + 1); }
      else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else args.push(a);
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const hhmm = (v) => String(v ?? '').slice(0, 5);
const money = (c) => fmtMoney(c, 'AUD');
const price = (c) => fmtPrice(c, 'AUD');
const out = (flags, data) => { if (flags.json) { console.log(JSON.stringify(data, null, 2)); return true; } return false; };
const qtyOf = (v) => { const n = Number(v); return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); };

function cents(v, what = 'amount') {
  if (v === undefined || v === null || v === true || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new CliError(`Cannot read ${what} "${v}". Use dollars, e.g. 450 or 450.50.`);
  return Math.round(n * 100);
}

function quantity(v, what = 'quantity') {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  if (v === undefined || v === true || !Number.isFinite(n) || n <= 0) throw new CliError(`Cannot read ${what} "${v ?? ''}". Give a number above zero, e.g. --qty=40.`);
  return n;
}

// ---------------------------------------------------------------------------
// Dates and times

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmt(new Date());
function addDays(iso, n) { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return fmt(d); }
function addMonths(iso, n) { const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + n); return fmt(d); }
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // Australian and New Zealand exports write DD/MM/YYYY: the first number is
  // the day unless the second is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    let year = Number(slash[3]);
    if (year < 100) year += year > 30 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (iso) return iso[1];
  throw new CliError(`Cannot read ${what} "${s}". Use YYYY-MM-DD (or today / tomorrow / DD/MM/YYYY).`);
}

function parseTime(v, what = 'time') {
  if (!v || v === true) return null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!m) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour (or 9:30am).`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour.`);
  return `${pad(h)}:${pad(min)}`;
}

function addMinutes(hm, minutes) {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) throw new CliError(`That appointment runs past midnight (${hm} + ${minutes} minutes). Start earlier.`);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const weekdayOf = (iso) => WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];

function ageOn(dob, onDate) {
  if (!dob) return null;
  const b = isoDate(dob);
  const [by, bm, bd] = b.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

async function setting(db, key, dflt) {
  const [row] = await db.query('select value from settings where key = $1', [key]);
  return row ? row.value : dflt;
}

// ---------------------------------------------------------------------------
// Resolvers: partial names, case-insensitive, list-and-exit-1 when ambiguous

async function resolveByName(db, sql, query, what, label = (r) => r.name) {
  if (!query) throw new CliError(`Which ${what}? Give a name (partial is fine).`);
  const q = String(query).trim();
  const rows = await db.query(sql, [`%${q}%`]);
  const exact = rows.filter((r) => String(r.name).toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No ${what} matches "${q}".`);
  throw new CliError(`"${q}" matches ${rows.length} ${what}s:\n${rows.map((r) => `  ${label(r)}`).join('\n')}\nSay more of the name.`);
}

const resolveClient = (db, q, { includeArchived = false } = {}) => resolveByName(db,
  `select * from v_clients where name ilike $1 ${includeArchived ? '' : `and status = 'active'`} order by name`, q, 'client',
  (r) => `${r.name}${r.date_of_birth ? ` (born ${isoDate(r.date_of_birth)})` : ''}`);
const resolvePractitioner = (db, q) => resolveByName(db, `select * from practitioners where name ilike $1 and status = 'active' order by name`, q, 'practitioner');

async function resolveTreatment(db, query) {
  if (!query) throw new CliError('Which treatment? Give its code or name (partial is fine). See: treatments');
  const q = String(query).trim();
  const byCode = await db.query('select * from treatments where upper(code) = upper($1) and active', [q]);
  if (byCode.length === 1) return byCode[0];
  const rows = await db.query('select * from treatments where name ilike $1 and active order by name', [`%${q}%`]);
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No treatment matches "${q}". See: treatments`);
  throw new CliError(`"${q}" matches ${rows.length} treatments: ${rows.map((r) => `${r.code} ${r.name}`).join(', ')}. Say more.`);
}

async function resolveRef(db, view, prefix, ref, what) {
  if (!ref) throw new CliError(`Which ${what}? Give its reference (${prefix}-...).`);
  let q = String(ref).trim().toUpperCase();
  if (/^\d+$/.test(q)) q = `${prefix}-${q}`;
  const rows = await db.query(`select * from ${view} where upper(ref) = $1`, [q]);
  if (rows.length === 1) return rows[0];
  throw new CliError(`No ${what} matches "${ref}".`);
}

const resolveAppointment = (db, ref) => resolveRef(db, 'v_appointments', 'APT', ref, 'appointment');
const resolveInvoice = (db, ref) => resolveRef(db, 'v_invoices', 'INV', ref, 'invoice');
const resolveComplication = (db, ref) => resolveRef(db, 'v_complications', 'CMP', ref, 'complication');

async function resolveRecord(db, ref) {
  if (!ref) throw new CliError('Which record? Give TRX-... or the appointment APT-....');
  const q = String(ref).trim().toUpperCase();
  const rows = await db.query(
    `select r.*, t.code as treatment_code, t.name as treatment, t.kind as treatment_kind, t.cosmetic_procedure, t.needs_script, t.product_kind,
            c.name as client, p.name as practitioner, a.ref as appointment_ref
     from records r join clients c on c.id = r.client_id join practitioners p on p.id = r.practitioner_id
     join treatments t on t.id = r.treatment_id left join appointments a on a.id = r.appointment_id
     where upper(r.ref) = $1 or upper(a.ref) = $1 or r.ref = 'TRX-' || $1`,
    [q],
  );
  if (rows.length === 1) return rows[0];
  throw new CliError(`No treatment record matches "${ref}". A completed appointment with no record yet: record write APT-... creates it.`);
}

async function resolveProduct(db, query) {
  if (!query) throw new CliError('Which product? Give its SKU or name (partial is fine). See: stock');
  const q = String(query).trim();
  const bySku = await db.query('select * from v_stock where upper(sku) = upper($1)', [q]);
  if (bySku.length === 1) return bySku[0];
  const rows = await db.query(`select * from v_stock where (brand || ' ' || name) ilike $1 or sku ilike $1 order by sku`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No product matches "${q}". See: stock`);
  throw new CliError(`"${q}" matches ${rows.length} products: ${rows.map((r) => `${r.sku} (${r.name})`).join(', ')}. Say more.`);
}

async function resolveBatch(db, query) {
  if (!query) throw new CliError('Which batch? Give the batch number from the box. See: batches');
  const rows = await db.query('select * from v_batches where upper(batch_no) = upper($1)', [String(query).trim()]);
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No batch "${query}" on record. See: batches`);
  throw new CliError(`Batch "${query}" exists for ${rows.length} products: ${rows.map((r) => r.sku).join(', ')}. Say which.`);
}

async function mintRef(db, tableName, prefix, start) {
  const [row] = await db.query(
    `select max(nullif(regexp_replace(ref, '^[A-Z]+-', ''), '')::int) as n from ${tableName} where ref ~ $1`,
    [`^${prefix}-[0-9]+$`],
  );
  return `${prefix}-${Math.max(num(row.n) + 1, start)}`;
}

// ---------------------------------------------------------------------------
// The gates, in one place. Every caller that treats, books or charges asks
// these; nothing bypasses them.

async function currentScript(db, clientId, productKind, onDate) {
  const [s] = await db.query(
    `select * from v_scripts where client_id = $1 and product_kind = $2 and status = 'active' and is_prescriber
       and consult_on <= $3 and valid_until >= $3 and treatments_used < treatments_allowed
     order by valid_until limit 1`,
    [clientId, productKind, onDate],
  );
  return s || null;
}

async function currentConsent(db, clientId, group, onDate) {
  const [k] = await db.query(
    `select * from v_consents where client_id = $1 and consent_group = $2 and status = 'active'
       and signed_on <= $3 and expires_on >= $3 order by signed_on desc limit 1`,
    [clientId, group, onDate],
  );
  return k || null;
}

// Returns [{ gate, problem }]: empty means the treatment may go ahead that day.
async function treatmentGates(db, { client, treatment, practitioner, onDate }) {
  const adultAge = num(await setting(db, 'adult_age', '18'));
  const problems = [];
  const age = ageOn(client.date_of_birth, onDate);
  if (treatment.adult_only) {
    if (age === null) problems.push({ gate: 'age', problem: `${client.name} has no date of birth on file, and ${treatment.name} is never given under ${adultAge}. Record it first: client set "${client.name}" --dob=YYYY-MM-DD` });
    else if (age < adultAge) problems.push({ gate: 'age', problem: `${client.name} is ${age}. ${treatment.name} is never given to anyone under ${adultAge} (Ahpra non-surgical cosmetic guidelines s4.2).` });
  }
  if (treatment.kind === 'injectable' && !practitioner.injector) {
    problems.push({ gate: 'injector', problem: `${practitioner.name} is not recorded as an injector. Book it with someone who is.` });
  }
  if (treatment.cosmetic_procedure && practitioner.registration_no && practitioner.indemnity_expires && isoDate(practitioner.indemnity_expires) < onDate) {
    problems.push({ gate: 'indemnity', problem: `${practitioner.name}'s indemnity cover ended ${isoDate(practitioner.indemnity_expires)}. Record the renewal (practitioner set "${practitioner.name}" --indemnity=YYYY-MM-DD) before they treat.` });
  }
  if (treatment.needs_script) {
    const s = await currentScript(db, client.client_id || client.id, treatment.product_kind, onDate);
    if (!s) {
      const [last] = await db.query(`select ref, valid_until, treatments_used, treatments_allowed from v_scripts where client_id = $1 and product_kind = $2 order by consult_on desc limit 1`, [client.client_id || client.id, treatment.product_kind]);
      const why = last ? `the last one, ${last.ref}, ${num(last.treatments_used) >= num(last.treatments_allowed) ? 'has been used' : ''}${num(last.treatments_used) >= num(last.treatments_allowed) && isoDate(last.valid_until) < onDate ? ' and ' : ''}${isoDate(last.valid_until) < onDate ? `ran out ${isoDate(last.valid_until)}` : ''}` : 'there has never been one';
      problems.push({ gate: 'script', problem: `No current ${treatment.product_kind} script for ${client.name} on ${onDate}: ${why}. A prescriber must see them in person or by video first: consult "${client.name}" --prescriber=... --mode=video --product=${treatment.product_kind}` });
    }
  }
  if (treatment.consent_group) {
    const k = await currentConsent(db, client.client_id || client.id, treatment.consent_group, onDate);
    if (!k) problems.push({ gate: 'consent', problem: `No ${treatment.consent_group} consent for ${client.name} that covers ${onDate}. Take it in writing first: consent "${client.name}" --group=${treatment.consent_group} --financial --copy` });
    else {
      if (!k.financial_consent || !k.copy_given) problems.push({ gate: 'consent', problem: `${k.ref} has ${!k.financial_consent ? 'no financial consent recorded' : ''}${!k.financial_consent && !k.copy_given ? ' and ' : ''}${!k.copy_given ? 'no copy given to the client' : ''} (s5.3). Fix it: consent complete ${k.ref} --financial --copy` });
      if (treatment.cosmetic_procedure && k.cooling_off_until && isoDate(k.cooling_off_until) > onDate) problems.push({ gate: 'cooling_off', problem: `${client.name} signed ${k.ref} on ${isoDate(k.signed_on)} while under ${adultAge}; the cooling-off runs until ${isoDate(k.cooling_off_until)} (s4.5). Move the treatment to ${isoDate(k.cooling_off_until)} or later.` });
    }
  }
  return problems;
}

async function bookingGates(db, { practitioner, onDate, startsAt, endsAt, excludeId = null }) {
  const day = weekdayOf(onDate);
  if (!practitioner.days.split(',').map((d) => d.trim()).includes(day)) {
    throw new CliError(`${practitioner.name} does not work ${day}s (works ${practitioner.days}). Pick another day or practitioner.`);
  }
  if (startsAt < hhmm(practitioner.starts_at) || endsAt > hhmm(practitioner.ends_at)) {
    throw new CliError(`${startsAt} to ${endsAt} is outside ${practitioner.name}'s hours (${hhmm(practitioner.starts_at)} to ${hhmm(practitioner.ends_at)}).`);
  }
  const clash = await db.query(
    `select a.ref, c.name from appointments a join clients c on c.id = a.client_id
     where a.practitioner_id = $1 and a.on_date = $2 and a.status in ('booked', 'confirmed')
       and a.starts_at < $4 and a.ends_at > $3 ${excludeId ? 'and a.id <> $5' : ''}`,
    excludeId ? [practitioner.id, onDate, startsAt, endsAt, excludeId] : [practitioner.id, onDate, startsAt, endsAt],
  );
  if (clash.length) throw new CliError(`${practitioner.name} already has ${clash[0].name} (${clash[0].ref}) then. Pick another time.`);
}

// ---------------------------------------------------------------------------
// The book

function apptRow(a) {
  return { ref: a.ref, at: hhmm(a.starts_at), practitioner: a.practitioner, client: a.client, treatment: a.treatment, status: a.status };
}

async function dayFlags(db, a) {
  const flags = [];
  if (a.status === 'booked') flags.push('UNCONFIRMED');
  const [client] = await db.query('select * from v_clients where client_id = $1', [a.client_id]);
  const [treatment] = await db.query('select * from treatments where id = $1', [a.treatment_id]);
  const [practitioner] = await db.query('select * from practitioners where id = $1', [a.practitioner_id]);
  for (const g of await treatmentGates(db, { client, treatment, practitioner, onDate: isoDate(a.on_date) })) {
    flags.push({ age: 'UNDER AGE', script: 'NO SCRIPT', consent: 'CONSENT', cooling_off: 'COOLING-OFF', injector: 'NOT AN INJECTOR', indemnity: 'NO INDEMNITY' }[g.gate]);
  }
  if (client.medical_flags) flags.push(client.medical_flags);
  if (num(client.balance_cents) > 0) flags.push(`owes ${money(client.balance_cents)}`);
  return [...new Set(flags)];
}

async function cmdDay(db, flags) {
  const date = parseDate(flags.date, 'date') || today();
  const rows = await db.query(`select * from v_appointments where on_date = $1 and status in ('booked', 'confirmed', 'completed') order by starts_at, practitioner`, [date]);
  const result = [];
  for (const a of rows) result.push({ ...apptRow(a), before_they_arrive: a.status === 'completed' ? '' : (await dayFlags(db, a)).join('; ') });
  if (out(flags, { date, appointments: result })) return;
  console.log(heading(`The day sheet, ${date} (${weekdayOf(date)})`));
  if (!result.length) { console.log('  Nothing booked.'); return; }
  console.log(table(result, [{ key: 'at', label: 'at' }, { key: 'ref', label: 'ref' }, { key: 'practitioner', label: 'practitioner' }, { key: 'client', label: 'client' }, { key: 'treatment', label: 'treatment', width: 30 }, { key: 'status', label: 'status' }, { key: 'before_they_arrive', label: 'before they arrive', width: 60 }]));
}

async function cmdBook(db, flags) {
  const days = num(flags.days || 7);
  const params = [today(), addDays(today(), days)];
  let extra = '';
  if (flags.practitioner) { const p = await resolvePractitioner(db, flags.practitioner); params.push(p.id); extra = 'and practitioner_id = $3'; }
  const rows = await db.query(`select * from v_appointments where on_date between $1 and $2 and status in ('booked', 'confirmed') ${extra} order by on_date, starts_at`, params);
  const result = rows.map((a) => ({ ...apptRow(a), date: isoDate(a.on_date) }));
  if (out(flags, result)) return;
  console.log(heading(`The book, next ${days} days`));
  if (!result.length) { console.log('  Nothing booked.'); return; }
  console.log(table(result.map((r) => ({ ...r, status: r.status === 'booked' ? 'UNCONFIRMED' : r.status })), [{ key: 'date', label: 'date' }, { key: 'at', label: 'at' }, { key: 'ref', label: 'ref' }, { key: 'practitioner', label: 'practitioner' }, { key: 'client', label: 'client' }, { key: 'treatment', label: 'treatment', width: 32 }, { key: 'status', label: 'status' }]));
}

async function cmdBookAdd(db, args, flags) {
  const client = await resolveClient(db, args.join(' ') || flags.client);
  const treatment = await resolveTreatment(db, flags.treatment);
  const practitioner = await resolvePractitioner(db, flags.practitioner);
  const onDate = parseDate(flags.date, 'date');
  const startsAt = parseTime(flags.time, 'time');
  if (!onDate || !startsAt) throw new CliError('Give --date= and --time=.');
  if (onDate < today()) throw new CliError('That date has passed. Book forward.');
  const endsAt = addMinutes(startsAt, num(treatment.minutes));
  const gates = await treatmentGates(db, { client, treatment, practitioner, onDate });
  const hard = gates.filter((g) => ['age', 'injector'].includes(g.gate));
  if (hard.length) throw new CliError(hard.map((g) => g.problem).join('\n'));
  await bookingGates(db, { practitioner, onDate, startsAt, endsAt });
  const ref = await mintRef(db, 'appointments', 'APT', 1001);
  await db.query(
    `insert into appointments (ref, client_id, practitioner_id, treatment_id, on_date, starts_at, ends_at, notes) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ref, client.client_id, practitioner.id, treatment.id, onDate, startsAt, endsAt, str(flags.notes) || null],
  );
  await db.query(`update followups set status = 'booked' where client_id = $1 and status = 'open' and kind = $2`, [client.client_id, treatment.kind === 'consult' ? 'review' : 'rebook']);
  const warnings = gates.map((g) => g.problem);
  const result = { ref, client: client.name, treatment: treatment.name, practitioner: practitioner.name, date: onDate, time: startsAt, warnings };
  if (out(flags, result)) return;
  console.log(`Booked ${ref}: ${client.name}, ${treatment.name} with ${practitioner.name}, ${onDate} ${startsAt}.`);
  for (const w of warnings) console.log(`  Before the day: ${w}`);
}

async function setApptStatus(db, args, flags, status) {
  const a = await resolveAppointment(db, args[0]);
  if (!['booked', 'confirmed'].includes(a.status)) throw new CliError(`${a.ref} is ${a.status}. Nothing to change.`);
  if (status === 'cancelled' && !str(flags.reason)) throw new CliError('A cancellation needs a reason: --reason="..."');
  if (status === 'dna' && isoDate(a.on_date) > today()) throw new CliError(`${a.ref} is on ${isoDate(a.on_date)}. A no-show is recorded on or after the day.`);
  await db.query('update appointments set status = $2, cancel_reason = $3 where id = $1', [a.id, status, str(flags.reason) || null]);
  if (out(flags, { ref: a.ref, status })) return;
  console.log(`${a.ref} (${a.client}) is now ${status}.`);
}

async function cmdDeposit(db, args, flags) {
  const a = await resolveAppointment(db, args[0]);
  const amount = cents(flags.amount, 'deposit');
  if (!amount) throw new CliError('How much? --amount=100');
  if (!['booked', 'confirmed'].includes(a.status)) throw new CliError(`${a.ref} is ${a.status}.`);
  if (a.consent_group && a.cosmetic_procedure) {
    const k = await currentConsent(db, a.client_id, a.consent_group, today());
    if (k && k.cooling_off_until && isoDate(k.cooling_off_until) > today()) {
      throw new CliError(`${a.client} is inside the cooling-off period until ${isoDate(k.cooling_off_until)}. No money is taken before then, other than for the consultation (Ahpra non-surgical cosmetic guidelines s4.6).`);
    }
  }
  await db.query('update appointments set deposit_cents = deposit_cents + $2, deposit_paid_on = current_date where id = $1', [a.id, amount]);
  if (out(flags, { ref: a.ref, deposit_cents: num(a.deposit_cents) + amount })) return;
  console.log(`${price(amount)} deposit recorded on ${a.ref} (${a.client}).`);
}

// ---------------------------------------------------------------------------
// Money helpers

async function newInvoice(db, { clientId, lines, dueOn = today() }) {
  const ref = await mintRef(db, 'invoices', 'INV', 2001);
  const [inv] = await db.query('insert into invoices (ref, client_id, due_on) values ($1, $2, $3) returning id', [ref, clientId, dueOn]);
  for (const l of lines) {
    await db.query(
      'insert into invoice_items (invoice_id, description, qty, unit_cents, treatment_id, product_id, package_id) values ($1, $2, $3, $4, $5, $6, $7)',
      [inv.id, l.description, l.qty ?? 1, l.unit_cents, l.treatment_id ?? null, l.product_id ?? null, l.package_id ?? null],
    );
  }
  return { id: inv.id, ref };
}

async function recordPayment(db, invoiceId, amountCents, method = 'card', paidOn = today()) {
  const [inv] = await db.query('select * from v_invoices where id = $1', [invoiceId]);
  if (amountCents > num(inv.balance_cents)) throw new CliError(`${inv.ref} has ${money(inv.balance_cents)} owing. A payment cannot be more than that.`);
  await db.query('insert into payments (invoice_id, amount_cents, method, paid_on) values ($1, $2, $3, $4)', [invoiceId, amountCents, method, paidOn]);
  if (amountCents === num(inv.balance_cents)) await db.query(`update invoices set status = 'paid' where id = $1`, [invoiceId]);
}

// ---------------------------------------------------------------------------
// Batches: the recall trail

// Checks a batch can go into this client, and writes nothing. Called before
// any record is opened, so a refusal leaves no half-made record behind.
async function checkBatch(db, { recordId = null, scriptId = null, treatment, batchNo, qty, onDate }) {
  const b = await resolveBatch(db, batchNo);
  if (treatment.product_kind && b.kind !== treatment.product_kind) throw new CliError(`${b.batch_no} is ${b.kind} (${b.product}); ${treatment.name} uses ${treatment.product_kind}.`);
  if (isoDate(b.expires_on) < onDate) throw new CliError(`Batch ${b.batch_no} (${b.product}) expired ${isoDate(b.expires_on)}. It cannot be used. Quarantine it: stock writeoff ${b.batch_no} --reason=expired`);
  if (num(b.on_hand) < qty) throw new CliError(`Batch ${b.batch_no} has ${qtyOf(b.on_hand)} ${b.unit} on hand, not ${qtyOf(qty)}. Stock never goes below zero: use another batch, or receive stock first.`);
  if (scriptId) {
    const [s] = await db.query('select max_quantity, unit, ref from scripts where id = $1', [scriptId]);
    const [used] = recordId ? await db.query('select coalesce(sum(quantity), 0) as q from product_usage where record_id = $1', [recordId]) : [{ q: 0 }];
    if (num(used.q) + qty > num(s.max_quantity)) throw new CliError(`${s.ref} allows ${qtyOf(s.max_quantity)} ${s.unit}; this would make ${qtyOf(num(used.q) + qty)}. The prescriber changes the script, not the injector.`);
  }
  return b;
}

async function applyBatch(db, recordId, b, qty) {
  await db.query('update batches set on_hand = on_hand - $2 where id = $1', [b.id, qty]);
  await db.query('insert into product_usage (record_id, batch_id, quantity) values ($1, $2, $3)', [recordId, b.id, qty]);
}

// ---------------------------------------------------------------------------
// Completing a treatment: the gates speak, the record opens, the invoice and
// the follow-ups are made.

async function cmdComplete(db, args, flags) {
  const a = await resolveAppointment(db, args[0]);
  if (!['booked', 'confirmed'].includes(a.status)) throw new CliError(`${a.ref} is ${a.status}.`);
  const onDate = isoDate(a.on_date);
  if (onDate > today()) throw new CliError(`${a.ref} is on ${onDate}. Complete it on the day.`);
  if (flags.discount) throw new CliError(`No discounts are recorded here on a cosmetic procedure or any other treatment. Ahpra's cosmetic guidelines forbid free or discounted procedures (s14.2); change the menu price with /customise if the fee is wrong.`);
  const [client] = await db.query('select * from v_clients where client_id = $1', [a.client_id]);
  const [treatment] = await db.query('select * from treatments where id = $1', [a.treatment_id]);
  const [practitioner] = await db.query('select * from practitioners where id = $1', [a.practitioner_id]);
  const gates = await treatmentGates(db, { client, treatment, practitioner, onDate });
  if (gates.length) throw new CliError(`${a.ref} cannot be completed:\n${gates.map((g) => `  - ${g.problem}`).join('\n')}`);
  if (treatment.kind === 'injectable' && !flags.batch) throw new CliError(`Every injectable record names the batch it came from. Add --batch=<number on the box> --qty=<${treatment.product_kind === 'toxin' ? 'units' : 'ml'}>.`);

  const script = treatment.needs_script ? await currentScript(db, a.client_id, treatment.product_kind, onDate) : null;
  const consent = treatment.consent_group ? await currentConsent(db, a.client_id, treatment.consent_group, onDate) : null;
  const batch = flags.batch ? await checkBatch(db, { scriptId: script?.id, treatment, batchNo: flags.batch, qty: quantity(flags.qty), onDate }) : null;
  const ref = await mintRef(db, 'records', 'TRX', 501);
  const [rec] = await db.query(
    `insert into records (ref, appointment_id, client_id, practitioner_id, treatment_id, script_id, consent_id, on_date, areas, notes, aftercare_given)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [ref, a.id, a.client_id, a.practitioner_id, a.treatment_id, script?.id ?? null, consent?.id ?? null, onDate, str(flags.areas) || null, str(flags.notes) || null, Boolean(flags.aftercare)],
  );
  if (batch) await applyBatch(db, rec.id, batch, quantity(flags.qty));
  await db.query(`update appointments set status = 'completed' where id = $1`, [a.id]);

  // A package session, or an invoice.
  let billed;
  const [pkg] = await db.query(`select * from packages where client_id = $1 and treatment_id = $2 and status = 'active' and sessions_used < sessions_total and expires_on >= $3 order by expires_on limit 1`, [a.client_id, a.treatment_id, onDate]);
  if (pkg && !treatment.cosmetic_procedure) {
    await db.query(`update packages set sessions_used = sessions_used + 1, status = case when sessions_used + 1 = sessions_total then 'used' else status end where id = $1`, [pkg.id]);
    billed = { package: pkg.ref, session: num(pkg.sessions_used) + 1, of: num(pkg.sessions_total) };
  } else if (num(treatment.fee_cents) > 0) {
    const inv = await newInvoice(db, { clientId: a.client_id, lines: [{ description: treatment.name, unit_cents: num(treatment.fee_cents), treatment_id: treatment.id }] });
    if (num(a.deposit_cents)) await recordPayment(db, inv.id, Math.min(num(a.deposit_cents), num(treatment.fee_cents)), 'deposit', isoDate(a.deposit_paid_on || onDate));
    billed = { invoice: inv.ref, amount_cents: num(treatment.fee_cents), deposit_applied_cents: num(a.deposit_cents) };
  }

  // Follow-ups: the clinical review, and when they are due again.
  await db.query(`update followups set status = 'done' where client_id = $1 and status in ('open', 'booked') and kind = 'rebook'`, [a.client_id]);
  const followups = [];
  if (treatment.review_days) {
    await db.query(`insert into followups (client_id, record_id, kind, due_on) values ($1, $2, 'review', $3)`, [a.client_id, rec.id, addDays(onDate, num(treatment.review_days))]);
    followups.push({ kind: 'review', due_on: addDays(onDate, num(treatment.review_days)) });
  }
  if (treatment.rebook_weeks) {
    await db.query(`insert into followups (client_id, record_id, kind, due_on) values ($1, $2, 'rebook', $3)`, [a.client_id, rec.id, addDays(onDate, num(treatment.rebook_weeks) * 7)]);
    followups.push({ kind: 'rebook', due_on: addDays(onDate, num(treatment.rebook_weeks) * 7) });
  }
  const result = { ref: a.ref, record: ref, script: script?.ref ?? null, consent: consent?.ref ?? null, batch: batch ? `${batch.batch_no} (${batch.product})` : null, billed, followups };
  if (out(flags, result)) return;
  console.log(`${a.ref} completed. Record ${ref} is open in draft${script ? `, under ${script.ref}` : ''}${consent ? `, consent ${consent.ref}` : ''}.`);
  if (batch) console.log(`  ${qtyOf(flags.qty)} ${batch.unit} from batch ${batch.batch_no} (${batch.product}) recorded.`);
  if (billed?.invoice) console.log(`  Invoice ${billed.invoice}: ${price(billed.amount_cents)}${billed.deposit_applied_cents ? `, ${price(billed.deposit_applied_cents)} deposit applied` : ''}.`);
  if (billed?.package) console.log(`  Session ${billed.session} of ${billed.of} from ${billed.package}.`);
  for (const f of followups) console.log(`  ${f.kind === 'review' ? 'Review' : 'Rebook'} due ${f.due_on}.`);
  console.log(`  Write it up and finalise: record write ${ref} --notes="..." --aftercare, then record final ${ref}`);
}

// ---------------------------------------------------------------------------
// The treatment record

async function recordFromAppointment(db, ref) {
  const a = await resolveAppointment(db, ref);
  if (a.status !== 'completed') throw new CliError(`${a.ref} is ${a.status}. Complete it first: complete ${a.ref}`);
  const [treatment] = await db.query('select * from treatments where id = $1', [a.treatment_id]);
  const script = treatment.needs_script ? await db.query(`select * from v_scripts where client_id = $1 and product_kind = $2 and consult_on <= $3 and valid_until >= $3 order by consult_on desc limit 1`, [a.client_id, treatment.product_kind, isoDate(a.on_date)]) : [];
  const consent = treatment.consent_group ? await currentConsent(db, a.client_id, treatment.consent_group, isoDate(a.on_date)) : null;
  const newRef = await mintRef(db, 'records', 'TRX', 501);
  await db.query(
    `insert into records (ref, appointment_id, client_id, practitioner_id, treatment_id, script_id, consent_id, on_date) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newRef, a.id, a.client_id, a.practitioner_id, a.treatment_id, script[0]?.id ?? null, consent?.id ?? null, isoDate(a.on_date)],
  );
  return resolveRecord(db, newRef);
}

async function cmdRecordWrite(db, args, flags) {
  let r;
  try { r = await resolveRecord(db, args[0]); } catch (e) {
    if (!/^APT-/i.test(String(args[0] || ''))) throw e;
    if (flags.batch) {
      const a = await resolveAppointment(db, args[0]);
      const [t] = await db.query('select * from treatments where id = $1', [a.treatment_id]);
      const [sc] = t.needs_script ? await db.query(`select id from v_scripts where client_id = $1 and product_kind = $2 and consult_on <= $3 and valid_until >= $3 order by consult_on desc limit 1`, [a.client_id, t.product_kind, isoDate(a.on_date)]) : [];
      await checkBatch(db, { scriptId: sc?.id, treatment: t, batchNo: flags.batch, qty: quantity(flags.qty), onDate: isoDate(a.on_date) });
    }
    r = await recordFromAppointment(db, args[0]);
  }
  if (r.status === 'final') throw new CliError(`${r.ref} is finalised. Corrections are addenda: record addendum ${r.ref} "..."`);
  let batch = null;
  if (flags.batch) {
    const [treatment] = await db.query('select * from treatments where code = $1', [r.treatment_code]);
    batch = await checkBatch(db, { recordId: r.id, scriptId: r.script_id, treatment, batchNo: flags.batch, qty: quantity(flags.qty), onDate: isoDate(r.on_date) });
  }
  const sets = [];
  const vals = [r.id];
  for (const [flag, col] of [['notes', 'notes'], ['areas', 'areas']]) {
    if (flags[flag] !== undefined) { vals.push(str(flags[flag])); sets.push(`${col} = $${vals.length}`); }
  }
  if (flags.aftercare) sets.push('aftercare_given = true');
  if (sets.length) await db.query(`update records set ${sets.join(', ')} where id = $1`, vals);
  if (batch) await applyBatch(db, r.id, batch, quantity(flags.qty));
  const [after] = await db.query('select * from v_records where id = $1', [r.id]);
  if (out(flags, after)) return;
  console.log(`${after.ref} updated (${after.client}, ${after.treatment}).${batch ? ` ${qtyOf(flags.qty)} ${batch.unit} of batch ${batch.batch_no} recorded.` : ''} Finalise it when it is complete: record final ${after.ref}`);
}

async function cmdRecordFinal(db, args, flags) {
  const r = await resolveRecord(db, args[0]);
  if (r.status === 'final') throw new CliError(`${r.ref} is already final.`);
  const missing = [];
  if (!str(r.notes)) missing.push('notes (what was done and how they tolerated it)');
  if (!str(r.areas)) missing.push('areas treated');
  if (r.cosmetic_procedure && !r.aftercare_given) missing.push('written aftercare given (--aftercare)');
  if (r.treatment_kind === 'injectable') {
    const [u] = await db.query('select count(*) as n from product_usage where record_id = $1', [r.id]);
    if (!num(u.n)) missing.push('the product and batch used (--batch= --qty=)');
  }
  if (missing.length) throw new CliError(`${r.ref} cannot be finalised without: ${missing.join('; ')}. Another practitioner must be able to take over care from this record (s7.7).`);
  await db.query(`update records set status = 'final', finalised_at = now() where id = $1`, [r.id]);
  if (out(flags, { ref: r.ref, status: 'final' })) return;
  console.log(`${r.ref} is final. From here, corrections are addenda.`);
}

async function cmdRecordAddendum(db, args, flags) {
  const r = await resolveRecord(db, args[0]);
  const body = args.slice(1).join(' ') || str(flags.text);
  if (!body) throw new CliError('What does the addendum say? record addendum TRX-... "text"');
  await db.query('insert into record_addenda (record_id, body) values ($1, $2)', [r.id, body]);
  if (out(flags, { ref: r.ref, addendum: body })) return;
  console.log(`Addendum added to ${r.ref}.`);
}

async function cmdRecordShow(db, args, flags) {
  const r = await resolveRecord(db, args[0]);
  const [full] = await db.query('select * from v_records where id = $1', [r.id]);
  const addenda = await db.query('select body, created_at from record_addenda where record_id = $1 order by created_at', [r.id]);
  const photos = await db.query('select kind, taken_on, file_path, advertising from photos where record_id = $1 order by taken_on', [r.id]);
  const result = { ...full, addenda, photos };
  if (out(flags, result)) return;
  console.log(heading(`${full.ref}: ${full.client}, ${full.treatment}, ${isoDate(full.on_date)}`));
  for (const [k, v] of [['practitioner', full.practitioner], ['status', full.status], ['script', full.script_ref], ['consent', full.consent_ref], ['areas', full.areas], ['products', full.products_used], ['notes', full.notes], ['aftercare given', full.aftercare_given ? 'yes' : 'no']]) console.log(`  ${k.padEnd(16)} ${v ?? ''}`);
  for (const a of addenda) console.log(`  addendum         ${a.body}`);
  for (const p of photos) console.log(`  photo            ${p.kind} ${isoDate(p.taken_on)} ${p.file_path}${p.advertising ? ' (advertising)' : ''}`);
}

async function cmdRecordsDue(db, flags) {
  const rows = await db.query('select * from v_records_due order by on_date');
  const result = rows.map((r) => ({ ref: r.record_ref || r.ref, date: isoDate(r.on_date), days: num(r.days_since), client: r.client, practitioner: r.practitioner, treatment: r.treatment, state: r.record_state }));
  if (out(flags, result)) return;
  console.log(heading('Treatment records not finalised'));
  if (!result.length) { console.log('  None. Every treatment is written up.'); return; }
  console.log(table(result, [{ key: 'ref', label: 'ref' }, { key: 'date', label: 'treated' }, { key: 'days', label: 'days', align: 'right' }, { key: 'client', label: 'client' }, { key: 'practitioner', label: 'practitioner' }, { key: 'treatment', label: 'treatment', width: 32 }, { key: 'state', label: 'record' }]));
}

// ---------------------------------------------------------------------------
// Scripts: the prescriber's consultation

async function cmdConsult(db, args, flags) {
  const client = await resolveClient(db, args.join(' ') || flags.client);
  const prescriber = await resolvePractitioner(db, flags.prescriber);
  if (!prescriber.prescriber) throw new CliError(`${prescriber.name} is not recorded as a prescriber. A script comes from a doctor or nurse practitioner who prescribes.`);
  const mode = str(flags.mode).toLowerCase().replace(/[- ]/g, '_');
  if (!['in_person', 'video'].includes(mode)) {
    throw new CliError(`A script needs an in-person or video consultation with the client, every time (--mode=in_person or --mode=video). A script by text, email, phone form or online questionnaire is not acceptable practice (Ahpra non-surgical cosmetic guidelines s3.2; Medical Board of Australia guidelines).`);
  }
  const productKind = str(flags.product).toLowerCase();
  if (!['toxin', 'filler', 'booster'].includes(productKind)) throw new CliError('What is prescribed? --product=toxin|filler|booster');
  const onDate = parseDate(flags.date, 'date') || today();
  const adultAge = num(await setting(db, 'adult_age', '18'));
  const age = ageOn(client.date_of_birth, onDate);
  if (['toxin', 'filler'].includes(productKind) && (age === null || age < adultAge)) {
    throw new CliError(age === null ? `${client.name} has no date of birth on file. Record it before prescribing.` : `${client.name} is ${age}. Toxin and filler are not prescribed for cosmetic purposes under ${adultAge} (s4.2).`);
  }
  const max = quantity(flags.max, 'maximum quantity (--max=)');
  const unit = str(flags.unit) || (productKind === 'toxin' ? 'units' : 'ml');
  const validDays = num(flags['valid-days'] || 60);
  const ref = await mintRef(db, 'scripts', 'SCR', 301);
  await db.query(
    `insert into scripts (ref, client_id, prescriber_id, consult_on, consult_mode, product_kind, product, max_quantity, unit, areas, treatments_allowed, valid_until, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [ref, client.client_id, prescriber.id, onDate, mode, productKind, str(flags.name) || { toxin: 'Botulinum toxin type A', filler: 'Hyaluronic acid filler', booster: 'Skin booster' }[productKind],
      max, unit, str(flags.areas) || null, num(flags.treatments || 1), addDays(onDate, validDays), str(flags.notes) || null],
  );
  const result = { ref, client: client.name, prescriber: prescriber.name, mode, product_kind: productKind, max_quantity: max, valid_until: addDays(onDate, validDays) };
  if (out(flags, result)) return;
  console.log(`${ref}: ${prescriber.name} saw ${client.name} by ${mode.replace('_', ' ')} on ${onDate} and prescribed ${productKind}, up to ${qtyOf(max)} ${unit}, valid until ${result.valid_until}.`);
}

async function cmdScripts(db, args, flags) {
  const params = [];
  let where = `where status = 'active' and (current or $1::boolean)`;
  params.push(Boolean(flags.all));
  if (args.length) { const c = await resolveClient(db, args.join(' ')); params.push(c.client_id); where += ` and client_id = $${params.length}`; }
  const rows = await db.query(`select * from v_scripts ${where} order by valid_until`, params);
  const result = rows.map((s) => ({ ref: s.ref, client: s.client, prescriber: s.prescriber, consult: `${isoDate(s.consult_on)} ${s.consult_mode.replace('_', ' ')}`, product: s.product_kind, max: `${qtyOf(s.max_quantity)} ${s.unit}`, used: `${s.treatments_used}/${s.treatments_allowed}`, valid_until: isoDate(s.valid_until), days_left: num(s.days_left), current: s.current }));
  if (out(flags, result)) return;
  console.log(heading(flags.all || args.length ? 'Scripts' : 'Current scripts'));
  if (!result.length) { console.log('  None.'); return; }
  console.log(table(result, [{ key: 'ref', label: 'ref' }, { key: 'client', label: 'client' }, { key: 'prescriber', label: 'prescriber' }, { key: 'consult', label: 'consultation' }, { key: 'product', label: 'for' }, { key: 'max', label: 'up to' }, { key: 'used', label: 'used' }, { key: 'valid_until', label: 'valid until' }]));
}

// ---------------------------------------------------------------------------
// Consents

async function cmdConsentAdd(db, args, flags) {
  const client = await resolveClient(db, args.join(' ') || flags.client);
  const group = str(flags.group).toLowerCase();
  const groups = (await db.query('select distinct consent_group from treatments where consent_group is not null order by 1')).map((r) => r.consent_group);
  if (!groups.includes(group)) throw new CliError(`Which consent? --group=${groups.join('|')}`);
  const signedOn = parseDate(flags.date, 'date') || today();
  const months = num(await setting(db, 'consent_months', '12'));
  const adultAge = num(await setting(db, 'adult_age', '18'));
  const coolDays = num(await setting(db, 'cooling_off_days', '7'));
  const age = ageOn(client.date_of_birth, signedOn);
  if (age === null) throw new CliError(`${client.name} has no date of birth on file. It decides whether the cooling-off applies: client set "${client.name}" --dob=YYYY-MM-DD`);
  const coolingOff = age < adultAge ? addDays(signedOn, coolDays) : null;
  const [taker] = flags.by ? [await resolvePractitioner(db, flags.by)] : [null];
  const ref = await mintRef(db, 'consents', 'CON', 201);
  await db.query(
    `insert into consents (ref, client_id, consent_group, practitioner_id, signed_on, expires_on, financial_consent, copy_given, cooling_off_until, notes) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [ref, client.client_id, group, taker?.id ?? null, signedOn, addMonths(signedOn, months), Boolean(flags.financial), Boolean(flags.copy), coolingOff, str(flags.notes) || null],
  );
  const missing = [!flags.financial && 'the financial consent (--financial)', !flags.copy && 'a copy given to the client (--copy)'].filter(Boolean);
  const result = { ref, client: client.name, group, signed_on: signedOn, expires_on: addMonths(signedOn, months), cooling_off_until: coolingOff, missing };
  if (out(flags, result)) return;
  console.log(`${ref}: ${client.name}'s ${group} consent, signed ${signedOn}, covers treatment until ${result.expires_on}.`);
  if (coolingOff) console.log(`  ${client.name} is ${age}: no cosmetic procedure before ${coolingOff}, and no money taken before then other than for the consultation (s4.5, s4.6).`);
  if (missing.length) console.log(`  Not complete yet: ${missing.join(' and ')}. Treatment waits until it is: consent complete ${ref} --financial --copy`);
}

async function cmdConsentComplete(db, args, flags) {
  const k = await resolveRef(db, 'v_consents', 'CON', args[0], 'consent');
  const sets = [];
  if (flags.financial) sets.push('financial_consent = true');
  if (flags.copy) sets.push('copy_given = true');
  if (!sets.length) throw new CliError('What was completed? --financial and/or --copy');
  await db.query(`update consents set ${sets.join(', ')} where id = $1`, [k.id]);
  const [after] = await db.query('select * from v_consents where id = $1', [k.id]);
  if (out(flags, after)) return;
  console.log(`${after.ref} (${after.client}, ${after.consent_group}): financial consent ${after.financial_consent ? 'yes' : 'no'}, copy given ${after.copy_given ? 'yes' : 'no'}.`);
}

async function cmdConsents(db, args, flags) {
  const warn = num(await setting(db, 'consent_warn_days', '30'));
  const params = [];
  let where = `where status = 'active'`;
  if (args.length) { const c = await resolveClient(db, args.join(' ')); params.push(c.client_id); where += ` and client_id = $1`; }
  else if (flags.expiring) { params.push(warn); where += ` and expires_on between current_date and current_date + $1::int`; }
  else where += ' and expires_on >= current_date';
  const rows = await db.query(`select * from v_consents ${where} order by expires_on`, params);
  const result = rows.map((k) => ({ ref: k.ref, client: k.client, group: k.consent_group, signed: isoDate(k.signed_on), expires: isoDate(k.expires_on), financial: k.financial_consent, copy: k.copy_given, cooling_off_until: k.cooling_off_until ? isoDate(k.cooling_off_until) : null }));
  if (out(flags, result)) return;
  console.log(heading(flags.expiring ? `Consents running out in the next ${warn} days` : 'Consents'));
  if (!result.length) { console.log('  None.'); return; }
  console.log(table(result.map((r) => ({ ...r, financial: r.financial ? 'yes' : 'NO', copy: r.copy ? 'yes' : 'NO', cooling_off_until: r.cooling_off_until || '' })), [{ key: 'ref', label: 'ref' }, { key: 'client', label: 'client' }, { key: 'group', label: 'for' }, { key: 'signed', label: 'signed' }, { key: 'expires', label: 'expires' }, { key: 'financial', label: 'financial' }, { key: 'copy', label: 'copy given' }, { key: 'cooling_off_until', label: 'cooling-off until' }]));
}

// ---------------------------------------------------------------------------
// Clients

async function cmdClients(db, flags) {
  const rows = await db.query(`select * from v_clients where status = 'active' order by name`);
  const result = rows.map((c) => ({ name: c.name, age: c.age, phone: c.phone, last_treatment: c.last_treatment ? `${c.last_treatment} ${isoDate(c.last_treatment_on)}` : '', next: c.next_appt_on ? isoDate(c.next_appt_on) : '', spend_12m_cents: num(c.spend_cents_12m), owing_cents: num(c.balance_cents) }));
  if (out(flags, result)) return;
  console.log(heading(`Clients (${result.length})`));
  console.log(table(result.map((r) => ({ ...r, spend: money(r.spend_12m_cents), owing: r.owing_cents ? money(r.owing_cents) : '' })), [{ key: 'name', label: 'client' }, { key: 'age', label: 'age', align: 'right' }, { key: 'phone', label: 'phone' }, { key: 'last_treatment', label: 'last treatment', width: 44 }, { key: 'next', label: 'next visit' }, { key: 'spend', label: '12 months', align: 'right' }, { key: 'owing', label: 'owing', align: 'right' }]));
}

async function cmdClient(db, args, flags) {
  const c = await resolveClient(db, args.join(' '), { includeArchived: true });
  const id = c.client_id;
  const records = (await db.query('select ref, on_date, treatment, practitioner, areas, products_used, status from v_records where client_id = $1 order by on_date desc', [id])).map((r) => ({ ...r, on_date: isoDate(r.on_date) }));
  const scripts = (await db.query('select ref, product_kind, prescriber, consult_on, consult_mode, valid_until, current from v_scripts where client_id = $1 order by consult_on desc', [id])).map((s) => ({ ...s, consult_on: isoDate(s.consult_on), valid_until: isoDate(s.valid_until) }));
  const consents = (await db.query('select ref, consent_group, signed_on, expires_on, financial_consent, copy_given, cooling_off_until, current from v_consents where client_id = $1 order by signed_on desc', [id])).map((k) => ({ ...k, signed_on: isoDate(k.signed_on), expires_on: isoDate(k.expires_on), cooling_off_until: k.cooling_off_until ? isoDate(k.cooling_off_until) : null }));
  const upcoming = (await db.query(`select ref, on_date, starts_at, treatment, practitioner, status from v_appointments where client_id = $1 and status in ('booked', 'confirmed') and on_date >= current_date order by on_date`, [id])).map((a) => ({ ...a, on_date: isoDate(a.on_date), starts_at: hhmm(a.starts_at) }));
  const complications = await db.query('select ref, reported_on, severity, description, status from v_complications where client_id = $1 order by reported_on desc', [id]);
  const packages = await db.query('select ref, treatment, sessions_left, expires_on, status from v_packages where client_id = $1', [id]);
  const notes = await db.query('select body, created_at from client_notes where client_id = $1 order by created_at desc limit 10', [id]);
  const followups = (await db.query('select kind, due_on, status from followups where client_id = $1 and status = $2 order by due_on', [id, 'open'])).map((f) => ({ ...f, due_on: isoDate(f.due_on) }));
  const result = { client: { ...c, date_of_birth: c.date_of_birth ? isoDate(c.date_of_birth) : null }, upcoming, records, scripts, consents, complications, packages, followups, notes };
  if (out(flags, result)) return;
  console.log(heading(`${c.name}${c.age !== null ? `, ${c.age}` : ''}`));
  console.log(`  ${[c.phone, c.email].filter(Boolean).join('  ')}`);
  if (c.medical_flags) console.log(`  Medical: ${c.medical_flags}`);
  console.log(`  Photos: ${c.photo_consent}${c.ad_consent_withdrawn_on ? ` (advertising withdrawn ${isoDate(c.ad_consent_withdrawn_on)})` : ''}. Marketing: ${c.marketing_opt_in === null ? 'never asked' : c.marketing_opt_in ? 'yes' : 'no'}. Owing: ${money(c.balance_cents)}.`);
  if (upcoming.length) console.log(`\n  Booked\n${table(upcoming, [{ key: 'ref', label: 'ref' }, { key: 'on_date', label: 'date' }, { key: 'starts_at', label: 'at' }, { key: 'treatment', label: 'treatment' }, { key: 'practitioner', label: 'with' }, { key: 'status', label: 'status' }])}`);
  if (records.length) console.log(`\n  Treatments\n${table(records, [{ key: 'ref', label: 'ref' }, { key: 'on_date', label: 'date' }, { key: 'treatment', label: 'treatment', width: 30 }, { key: 'practitioner', label: 'by' }, { key: 'products_used', label: 'product and batch', width: 60 }, { key: 'status', label: 'record' }])}`);
  if (scripts.length) console.log(`\n  Scripts\n${table(scripts.map((s) => ({ ...s, current: s.current ? 'current' : '' })), [{ key: 'ref', label: 'ref' }, { key: 'product_kind', label: 'for' }, { key: 'prescriber', label: 'prescriber' }, { key: 'consult_on', label: 'consulted' }, { key: 'valid_until', label: 'valid until' }, { key: 'current', label: '' }])}`);
  if (consents.length) console.log(`\n  Consents\n${table(consents.map((k) => ({ ...k, current: k.current ? 'current' : '' })), [{ key: 'ref', label: 'ref' }, { key: 'consent_group', label: 'for' }, { key: 'signed_on', label: 'signed' }, { key: 'expires_on', label: 'expires' }, { key: 'current', label: '' }])}`);
  for (const m of complications) console.log(`\n  Complication ${m.ref} (${m.severity}, ${m.status}): ${m.description}`);
  for (const k of packages) console.log(`  Package ${k.ref}: ${k.treatment}, ${k.sessions_left} left, expires ${isoDate(k.expires_on)}`);
  for (const f of followups) console.log(`  ${f.kind} due ${f.due_on}`);
  for (const n of notes) console.log(`  Note ${isoDate(n.created_at)}: ${n.body}`);
}

const CLIENT_FIELDS = { dob: 'date_of_birth', phone: 'phone', email: 'email', medical: 'medical_flags', source: 'source' };

async function cmdClientAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('client add "Full Name" --dob= --phone= --email=');
  const dup = await db.query('select name from clients where lower(name) = lower($1)', [name]);
  if (dup.length) throw new CliError(`${dup[0].name} is already a client. Use: client set "${dup[0].name}" ...`);
  const dob = parseDate(flags.dob, 'date of birth');
  const optIn = flags.marketing === undefined ? null : yesNo(flags.marketing);
  await db.query(
    'insert into clients (name, date_of_birth, phone, email, medical_flags, source, marketing_opt_in) values ($1, $2, $3, $4, $5, $6, $7)',
    [name, dob, str(flags.phone) || null, str(flags.email) || null, str(flags.medical) || null, str(flags.source) || null, optIn],
  );
  if (out(flags, { name, date_of_birth: dob })) return;
  console.log(`${name} added.`);
}

async function cmdClientSet(db, args, flags) {
  const c = await resolveClient(db, args.join(' '), { includeArchived: true });
  const sets = [];
  const vals = [c.client_id];
  for (const [flag, col] of Object.entries(CLIENT_FIELDS)) {
    if (flags[flag] === undefined) continue;
    vals.push(flag === 'dob' ? parseDate(flags[flag], 'date of birth') : str(flags[flag]) || null);
    sets.push(`${col} = $${vals.length}`);
  }
  if (flags.marketing !== undefined) { vals.push(yesNo(flags.marketing)); sets.push(`marketing_opt_in = $${vals.length}`); }
  if (flags.archive) sets.push(`status = 'archived'`);
  if (!sets.length) throw new CliError(`Nothing to change. Flags: ${Object.keys(CLIENT_FIELDS).map((f) => `--${f}=`).join(' ')} --marketing=yes|no --archive`);
  await db.query(`update clients set ${sets.join(', ')} where id = $1`, vals);
  if (out(flags, { name: c.name, changed: sets.length })) return;
  console.log(`${c.name} updated.`);
}

async function cmdLog(db, args, flags) {
  const [who, ...rest] = args;
  const c = await resolveClient(db, who);
  const body = rest.join(' ') || str(flags.text);
  if (!body) throw new CliError('log "Client" "what happened"');
  await db.query('insert into client_notes (client_id, body) values ($1, $2)', [c.client_id, body]);
  if (out(flags, { client: c.name, body })) return;
  console.log(`Noted on ${c.name}'s card.`);
}

// ---------------------------------------------------------------------------
// Photos and the consent that covers them

async function cmdPhotoConsent(db, args, flags) {
  const level = str(flags.level).toLowerCase();
  const c = await resolveClient(db, args.join(' '));
  if (!['none', 'clinical', 'advertising', 'withdraw'].includes(level)) throw new CliError('--level=clinical (the record only) | advertising (a separate, signed consent) | withdraw (advertising stops today) | none');
  if (level === 'withdraw') {
    await db.query(`update clients set ad_consent_withdrawn_on = current_date, photo_consent = case when photo_consent = 'advertising' then 'clinical' else photo_consent end where id = $1`, [c.client_id]);
    await db.query(`update photos set advertising = false where client_id = $1`, [c.client_id]);
  } else {
    await db.query(`update clients set photo_consent = $2, photo_consent_on = current_date, ad_consent_withdrawn_on = case when $2 = 'advertising' then null else ad_consent_withdrawn_on end where id = $1`, [c.client_id, level]);
    if (level !== 'advertising') await db.query(`update photos set advertising = false where client_id = $1`, [c.client_id]);
  }
  if (out(flags, { client: c.name, level })) return;
  console.log(level === 'withdraw' ? `${c.name} withdrew advertising consent. Every photo of theirs is off advertising use from today; take down anything already published (s5.10).` : `${c.name}'s photo consent is now ${level}.`);
}

async function cmdPhotoAdd(db, args, flags) {
  const c = await resolveClient(db, args.join(' '));
  const file = str(flags.file);
  if (!file) throw new CliError('Where is the image kept? --file=photos/... (the clinic\'s secure storage, never a personal phone: s5.6)');
  if (c.photo_consent === 'none') throw new CliError(`${c.name} has not consented to photos. Ask first, and record it: photo consent "${c.name}" --level=clinical (s5.5)`);
  if (flags.advertising && (c.photo_consent !== 'advertising' || c.ad_consent_withdrawn_on)) throw new CliError(`${c.name} has not given a separate advertising consent${c.ad_consent_withdrawn_on ? ` (withdrawn ${isoDate(c.ad_consent_withdrawn_on)})` : ''}. The photo can go on the record, not in advertising (s5.8).`);
  const record = flags.record ? await resolveRecord(db, flags.record) : null;
  const kind = str(flags.kind) || 'before';
  await db.query('insert into photos (client_id, record_id, taken_on, kind, file_path, advertising) values ($1, $2, $3, $4, $5, $6)', [c.client_id, record?.id ?? null, parseDate(flags.date) || today(), kind, file, Boolean(flags.advertising)]);
  if (out(flags, { client: c.name, file, kind, advertising: Boolean(flags.advertising) })) return;
  console.log(`${kind} photo recorded for ${c.name}${record ? ` on ${record.ref}` : ''}.`);
}

async function cmdPhotos(db, flags) {
  const rows = await db.query(
    `select c.name as client, ph.kind, ph.taken_on, ph.file_path, ph.advertising, c.photo_consent, c.ad_consent_withdrawn_on, r.ref as record
     from photos ph join clients c on c.id = ph.client_id left join records r on r.id = ph.record_id
     where ($1::boolean is false or ph.advertising) order by ph.taken_on desc`,
    [Boolean(flags.advertising)],
  );
  const result = rows.map((p) => ({ client: p.client, kind: p.kind, taken: isoDate(p.taken_on), record: p.record, file: p.file_path, advertising: p.advertising, allowed: !p.advertising || (p.photo_consent === 'advertising' && !p.ad_consent_withdrawn_on) }));
  if (out(flags, result)) return;
  console.log(heading(flags.advertising ? 'Photos marked for advertising' : 'Photos'));
  console.log(table(result.map((r) => ({ ...r, use: r.advertising ? (r.allowed ? 'advertising' : 'ADVERTISING, NO CONSENT') : 'record only' })), [{ key: 'client', label: 'client' }, { key: 'kind', label: 'kind' }, { key: 'taken', label: 'taken' }, { key: 'record', label: 'record' }, { key: 'use', label: 'use' }, { key: 'file', label: 'file', width: 50 }]));
}

// ---------------------------------------------------------------------------
// Complications

async function cmdComplications(db, flags) {
  const rows = await db.query(`select * from v_complications where status = 'open' or $1::boolean order by reported_on desc`, [Boolean(flags.all)]);
  const result = rows.map((m) => ({ ref: m.ref, client: m.client, reported: isoDate(m.reported_on), days_open: m.status === 'open' ? num(m.days_open) : null, severity: m.severity, treatment: m.treatment, practitioner: m.practitioner, description: m.description, action: m.action, escalated_to: m.escalated_to, follow_up_booked: m.follow_up_booked, status: m.status }));
  if (out(flags, result)) return;
  console.log(heading(flags.all ? 'Complications' : 'Open complications'));
  if (!result.length) { console.log('  None open.'); return; }
  for (const m of result) console.log(`\n  ${m.ref}  ${m.client}  ${m.severity.toUpperCase()}  reported ${m.reported}${m.days_open !== null ? `, ${m.days_open} days open` : ''}\n    After: ${m.treatment || 'unknown'} by ${m.practitioner || 'unknown'}\n    ${m.description}\n    Action: ${m.action || 'NONE RECORDED'}${m.escalated_to ? `; escalated to ${m.escalated_to}` : ''}. Follow-up booked: ${m.follow_up_booked ? 'yes' : 'NO'}.`);
}

async function cmdComplicationAdd(db, args, flags) {
  const c = await resolveClient(db, args.join(' '));
  const severity = str(flags.severity).toLowerCase();
  if (!['minor', 'moderate', 'serious'].includes(severity)) throw new CliError('--severity=minor|moderate|serious');
  if (!str(flags.description)) throw new CliError('What is happening? --description="..."');
  const record = flags.record ? await resolveRecord(db, flags.record) : (await db.query('select id, ref from records where client_id = $1 order by on_date desc limit 1', [c.client_id]))[0];
  const ref = await mintRef(db, 'complications', 'CMP', 801);
  await db.query('insert into complications (ref, client_id, record_id, severity, description, action, escalated_to) values ($1, $2, $3, $4, $5, $6, $7)', [ref, c.client_id, record?.id ?? null, severity, str(flags.description), str(flags.action) || null, str(flags['escalated-to']) || null]);
  if (out(flags, { ref, client: c.name, severity, record: record?.ref ?? null })) return;
  console.log(`${ref} opened for ${c.name} (${severity})${record ? ` against ${record.ref}` : ''}.${severity === 'serious' && !flags['escalated-to'] ? ' A serious complication follows the clinic\'s emergency protocol: record who it went to with --escalated-to= (s7.4, s7.5).' : ''}`);
}

async function cmdComplicationMove(db, verb, args, flags) {
  const m = await resolveComplication(db, args[0]);
  if (verb === 'resolve') {
    if (!str(flags.action) && !m.action) throw new CliError('What resolved it? --action="..."');
    await db.query(`update complications set status = 'resolved', resolved_on = current_date, action = coalesce($2, action) where id = $1`, [m.id, str(flags.action) || null]);
  } else {
    await db.query('update complications set action = coalesce($2, action), escalated_to = coalesce($3, escalated_to) where id = $1', [m.id, str(flags.action) || null, str(flags['escalated-to']) || null]);
  }
  if (out(flags, { ref: m.ref, status: verb === 'resolve' ? 'resolved' : m.status })) return;
  console.log(`${m.ref} ${verb === 'resolve' ? 'resolved' : 'updated'}.`);
}

// ---------------------------------------------------------------------------
// Reviews and rebooks

async function cmdFollowups(db, flags) {
  const days = num(flags.days || 14);
  const kind = str(flags.kind);
  const rows = await db.query(`select * from v_followups where due_on <= current_date + $1::int and ($2 = '' or kind = $2) order by kind desc, due_on`, [days, kind]);
  const result = rows.map((f) => ({ client: f.client, kind: f.kind, treatment: f.treatment, due: isoDate(f.due_on), days_overdue: num(f.days_overdue), contacts: num(f.contacts), next_visit: f.next_appt_on ? isoDate(f.next_appt_on) : null, phone: f.phone, how: f.kind === 'review' ? 'call or message (clinical)' : f.marketing_opt_in === true ? 'message' : f.marketing_opt_in === false ? 'leave it: said no to marketing' : 'phone call: never asked about messages' }));
  if (out(flags, result)) return;
  console.log(heading(`Reviews and rebooks due in the next ${days} days or overdue`));
  if (!result.length) { console.log('  None.'); return; }
  console.log(table(result.map((r) => ({ ...r, overdue: r.days_overdue > 0 ? `${r.days_overdue} days` : '', next_visit: r.next_visit || '' })), [{ key: 'kind', label: 'kind' }, { key: 'client', label: 'client' }, { key: 'treatment', label: 'after', width: 30 }, { key: 'due', label: 'due' }, { key: 'overdue', label: 'overdue' }, { key: 'contacts', label: 'contacts', align: 'right' }, { key: 'how', label: 'how', width: 40 }]));
}

async function cmdFollowupMove(db, verb, args, flags) {
  const c = await resolveClient(db, args.join(' '));
  const kind = str(flags.kind);
  const [f] = await db.query(`select * from followups where client_id = $1 and status = 'open' and ($2 = '' or kind = $2) order by due_on limit 1`, [c.client_id, kind]);
  if (!f) throw new CliError(`${c.name} has no open ${kind || 'review or rebook'}.`);
  if (verb === 'contacted') await db.query('update followups set contacts = contacts + 1, last_contacted_on = current_date where id = $1', [f.id]);
  else await db.query(`update followups set status = $2 where id = $1`, [f.id, verb === 'lapse' ? 'lapsed' : 'done']);
  if (out(flags, { client: c.name, kind: f.kind, action: verb })) return;
  console.log(`${c.name}'s ${f.kind}: ${verb === 'contacted' ? `contact ${num(f.contacts) + 1} recorded` : verb === 'lapse' ? 'closed as lapsed' : 'done'}.`);
}

// ---------------------------------------------------------------------------
// Stock by batch

async function cmdStock(db, flags) {
  const rows = await db.query(`select * from v_stock where active and ($1 = '' or kind = $1) and ($2::boolean is false or low) order by kind, sku`, [str(flags.kind), Boolean(flags.low)]);
  const result = rows.map((s) => ({ sku: s.sku, kind: s.kind, name: s.name, usable: num(s.usable), expired_on_hand: num(s.expired_on_hand), unit: s.unit, reorder_at: num(s.reorder_at), next_expiry: s.next_expiry ? isoDate(s.next_expiry) : null, value_cents: num(s.value_cents), low: s.low, s4: s.s4 }));
  if (out(flags, result)) return;
  console.log(heading('Stock'));
  console.log(table(result.map((r) => ({ ...r, on_hand: `${qtyOf(r.usable)} ${r.unit}`, expired: r.expired_on_hand ? `${qtyOf(r.expired_on_hand)} EXPIRED` : '', flag: r.low ? 'REORDER' : '', value: money(r.value_cents), next_expiry: r.next_expiry || '' })), [{ key: 'sku', label: 'sku' }, { key: 'name', label: 'product', width: 38 }, { key: 'on_hand', label: 'usable', align: 'right' }, { key: 'expired', label: 'expired' }, { key: 'next_expiry', label: 'next expiry' }, { key: 'flag', label: '' }, { key: 'value', label: 'at cost', align: 'right' }]));
}

async function cmdBatches(db, flags) {
  const warn = num(await setting(db, 'batch_warn_days', '45'));
  const rows = await db.query(`select * from v_batches where on_hand > 0 and ($1::boolean is false or days_to_expiry <= $2) order by expires_on`, [Boolean(flags.expiring), warn]);
  const result = rows.map((b) => ({ batch: b.batch_no, sku: b.sku, product: b.product, on_hand: num(b.on_hand), unit: b.unit, expires: isoDate(b.expires_on), days_to_expiry: num(b.days_to_expiry), expired: b.expired, value_cents: num(b.value_cents) }));
  if (out(flags, result)) return;
  console.log(heading(flags.expiring ? `Batches expiring within ${warn} days, or expired` : 'Batches on hand, first to expire first'));
  console.log(table(result.map((r) => ({ ...r, qty: `${qtyOf(r.on_hand)} ${r.unit}`, state: r.expired ? 'EXPIRED' : r.days_to_expiry <= warn ? `${r.days_to_expiry} days` : '', value: money(r.value_cents) })), [{ key: 'batch', label: 'batch' }, { key: 'sku', label: 'sku' }, { key: 'product', label: 'product', width: 38 }, { key: 'qty', label: 'on hand', align: 'right' }, { key: 'expires', label: 'expires' }, { key: 'state', label: '' }, { key: 'value', label: 'at cost', align: 'right' }]));
}

async function cmdStockReceive(db, args, flags) {
  const p = await resolveProduct(db, args[0]);
  const batchNo = str(flags.batch);
  const expires = parseDate(flags.expires, 'expiry');
  if (!batchNo || !expires) throw new CliError('Every delivery is received by batch: --batch=<number on the box> --expires=YYYY-MM-DD --qty=');
  if (expires <= today()) throw new CliError(`That batch expires ${expires}. Do not receive expired stock; send it back.`);
  const qty = quantity(flags.qty);
  await db.query(
    `insert into batches (product_id, batch_no, expires_on, on_hand) values ($1, $2, $3, $4)
     on conflict (product_id, batch_no) do update set on_hand = batches.on_hand + excluded.on_hand`,
    [p.id, batchNo, expires, qty],
  );
  if (out(flags, { sku: p.sku, batch: batchNo, qty, expires })) return;
  console.log(`Received ${qtyOf(qty)} ${p.unit} of ${p.name}, batch ${batchNo}, expires ${expires}.`);
}

async function cmdStockWriteoff(db, args, flags) {
  const b = await resolveBatch(db, args[0]);
  if (!str(flags.reason)) throw new CliError('Why? --reason=expired|damaged|recall');
  if (!num(b.on_hand)) throw new CliError(`Batch ${b.batch_no} has nothing on hand.`);
  await db.query('update batches set on_hand = 0 where id = $1', [b.id]);
  if (out(flags, { batch: b.batch_no, written_off: num(b.on_hand), reason: str(flags.reason), value_cents: num(b.value_cents) })) return;
  console.log(`Batch ${b.batch_no}: ${qtyOf(b.on_hand)} ${b.unit} of ${b.product} written off (${str(flags.reason)}), ${money(b.value_cents)} at cost. Dispose of it under your clinical waste procedure.`);
}

async function cmdTrace(db, args, flags) {
  const b = await resolveBatch(db, args[0]);
  const rows = await db.query(
    `select r.ref, r.on_date, c.name as client, c.phone, p.name as practitioner, u.quantity, r.status
     from product_usage u join records r on r.id = u.record_id join clients c on c.id = r.client_id join practitioners p on p.id = r.practitioner_id
     where u.batch_id = $1 order by r.on_date`,
    [b.id],
  );
  const result = { batch: b.batch_no, product: b.product, expires: isoDate(b.expires_on), on_hand: num(b.on_hand), given_to: rows.map((r) => ({ ref: r.ref, date: isoDate(r.on_date), client: r.client, phone: r.phone, practitioner: r.practitioner, quantity: num(r.quantity) })) };
  if (out(flags, result)) return;
  console.log(heading(`Batch ${b.batch_no}: ${b.product}, expires ${result.expires}, ${qtyOf(b.on_hand)} ${b.unit} on hand`));
  if (!result.given_to.length) { console.log('  Not used on anyone.'); return; }
  console.log(table(result.given_to.map((r) => ({ ...r, qty: `${qtyOf(r.quantity)} ${b.unit}` })), [{ key: 'date', label: 'date' }, { key: 'ref', label: 'record' }, { key: 'client', label: 'client' }, { key: 'phone', label: 'phone' }, { key: 'practitioner', label: 'by' }, { key: 'qty', label: 'quantity', align: 'right' }]));
  console.log(`\n  ${result.given_to.length} treatment(s). If the supplier or the TGA recalls this batch, these are the people to contact.`);
}

async function cmdSell(db, args, flags) {
  const [who, sku] = args;
  const c = await resolveClient(db, who);
  const p = await resolveProduct(db, sku);
  if (p.s4) throw new CliError(`${p.name} is prescription-only. It is never sold over the counter; it is given in a treatment under a script.`);
  if (!['skincare'].includes(p.kind) || !num(p.retail_cents)) throw new CliError(`${p.name} is not a retail line.`);
  const qty = Math.round(quantity(flags.qty || 1));
  if (num(p.usable) < qty) throw new CliError(`Only ${qtyOf(p.usable)} of ${p.name} in date on hand.`);
  let left = qty;
  for (const b of await db.query(`select * from batches where product_id = $1 and on_hand > 0 and expires_on >= current_date order by expires_on`, [p.id])) {
    const take = Math.min(left, num(b.on_hand));
    await db.query('update batches set on_hand = on_hand - $2 where id = $1', [b.id, take]);
    left -= take;
    if (!left) break;
  }
  const inv = await newInvoice(db, { clientId: c.client_id, lines: [{ description: p.name, qty, unit_cents: num(p.retail_cents), product_id: p.id }] });
  if (!flags.owing) await recordPayment(db, inv.id, qty * num(p.retail_cents));
  if (out(flags, { invoice: inv.ref, client: c.name, product: p.name, qty, total_cents: qty * num(p.retail_cents) })) return;
  console.log(`${inv.ref}: ${qty} x ${p.name} to ${c.name}, ${price(qty * num(p.retail_cents))}${flags.owing ? ', owing' : ', paid'}.`);
}

// ---------------------------------------------------------------------------
// Packages

async function cmdPackages(db, flags) {
  const rows = await db.query(`select * from v_packages where status = 'active' or $1::boolean order by expires_on`, [Boolean(flags.all)]);
  const result = rows.map((k) => ({ ref: k.ref, client: k.client, treatment: k.treatment, cosmetic_procedure: k.cosmetic_procedure, sessions: `${k.sessions_used}/${k.sessions_total}`, sessions_left: num(k.sessions_left), expires: isoDate(k.expires_on), days_left: num(k.days_left), unused_value_cents: num(k.unused_value_cents), status: k.status }));
  if (out(flags, result)) return;
  console.log(heading('Packages'));
  if (!result.length) { console.log('  None.'); return; }
  console.log(table(result.map((r) => ({ ...r, unused: money(r.unused_value_cents), flag: r.cosmetic_procedure ? 'NOT ALLOWED ON A COSMETIC PROCEDURE' : '' })), [{ key: 'ref', label: 'ref' }, { key: 'client', label: 'client' }, { key: 'treatment', label: 'treatment', width: 30 }, { key: 'sessions', label: 'used' }, { key: 'expires', label: 'expires' }, { key: 'unused', label: 'unused value', align: 'right' }, { key: 'flag', label: '' }]));
}

async function cmdPackageSell(db, args, flags) {
  const c = await resolveClient(db, args.join(' '));
  const t = await resolveTreatment(db, flags.treatment);
  if (t.cosmetic_procedure) throw new CliError(`${t.name} is a cosmetic procedure. A package works as an incentive to have more procedures, which Ahpra's cosmetic guidelines forbid (s14.2, s14.4). Packages are for skin treatments outside the guidelines, such as peels and facials.`);
  const sessions = Math.round(quantity(flags.sessions, 'sessions'));
  const priceCents = cents(flags.price, 'price');
  if (priceCents === null) throw new CliError('--price= for the whole package');
  const months = num(flags.months || 12);
  const ref = await mintRef(db, 'packages', 'PKG', 601);
  const [k] = await db.query('insert into packages (ref, client_id, treatment_id, sessions_total, price_cents, expires_on) values ($1, $2, $3, $4, $5, $6) returning id', [ref, c.client_id, t.id, sessions, priceCents, addMonths(today(), months)]);
  const inv = await newInvoice(db, { clientId: c.client_id, lines: [{ description: `${t.name} package, ${sessions} sessions`, unit_cents: priceCents, package_id: k.id }] });
  if (!flags.owing) await recordPayment(db, inv.id, priceCents);
  if (out(flags, { ref, invoice: inv.ref, client: c.name, treatment: t.name, sessions, price_cents: priceCents })) return;
  console.log(`${ref}: ${sessions} x ${t.name} for ${c.name}, ${price(priceCents)} (${inv.ref}), expires ${addMonths(today(), months)}.`);
}

// ---------------------------------------------------------------------------
// Money

async function cmdInvoices(db, flags) {
  const rows = await db.query(`select * from v_invoices where status = 'sent' or $1::boolean order by issued_on desc`, [Boolean(flags.all)]);
  const result = rows.map((i) => ({ ref: i.ref, client: i.client, issued: isoDate(i.issued_on), total_cents: num(i.total_cents), paid_cents: num(i.paid_cents), balance_cents: num(i.balance_cents), days_overdue: num(i.days_overdue), status: i.status }));
  if (out(flags, result)) return;
  console.log(heading(flags.all ? 'Invoices' : 'Invoices with money owing'));
  if (!result.length) { console.log('  Nothing owing.'); return; }
  console.log(table(result.map((r) => ({ ...r, total: money(r.total_cents), balance: money(r.balance_cents) })), [{ key: 'ref', label: 'ref' }, { key: 'client', label: 'client' }, { key: 'issued', label: 'issued' }, { key: 'total', label: 'total', align: 'right' }, { key: 'balance', label: 'owing', align: 'right' }, { key: 'days_overdue', label: 'days', align: 'right' }]));
}

async function cmdDebtors(db, flags) {
  const rows = await db.query(`select client, count(*) as invoices, sum(balance_cents) as owing, max(days_overdue) as oldest from v_invoices where status = 'sent' and balance_cents > 0 group by client order by 3 desc`);
  const result = rows.map((r) => ({ client: r.client, invoices: num(r.invoices), owing_cents: num(r.owing), oldest_days: num(r.oldest) }));
  if (out(flags, result)) return;
  console.log(heading('Who owes the clinic'));
  if (!result.length) { console.log('  Nobody.'); return; }
  console.log(table(result.map((r) => ({ ...r, owing: money(r.owing_cents) })), [{ key: 'client', label: 'client' }, { key: 'invoices', label: 'invoices', align: 'right' }, { key: 'owing', label: 'owing', align: 'right' }, { key: 'oldest_days', label: 'oldest (days)', align: 'right' }]));
}

async function cmdPay(db, args, flags) {
  const inv = await resolveInvoice(db, args[0]);
  const amount = cents(flags.amount, 'amount') ?? num(inv.balance_cents);
  if (!amount) throw new CliError(`${inv.ref} has nothing owing.`);
  await recordPayment(db, inv.id, amount, str(flags.method) || 'card');
  if (out(flags, { ref: inv.ref, paid_cents: amount })) return;
  console.log(`${price(amount)} recorded against ${inv.ref} (${inv.client}).`);
}

async function cmdTakings(db, flags) {
  const days = num(flags.days || 30);
  const rows = await db.query(`select line, sum(takings_cents) as cents from v_takings where on_date > current_date - $1::int group by line order by 2 desc`, [days]);
  const byPractitioner = await db.query(
    `select p.name as practitioner, count(*) as treatments, sum(t.fee_cents) as fees
     from records r join practitioners p on p.id = r.practitioner_id join treatments t on t.id = r.treatment_id
     where r.on_date > current_date - $1::int group by p.name order by 3 desc`, [days]);
  const result = { days, lines: rows.map((r) => ({ line: r.line, cents: num(r.cents) })), by_practitioner: byPractitioner.map((r) => ({ practitioner: r.practitioner, treatments: num(r.treatments), menu_value_cents: num(r.fees) })) };
  if (out(flags, result)) return;
  console.log(heading(`Takings, last ${days} days`));
  console.log(table(result.lines.map((r) => ({ ...r, amount: money(r.cents) })), [{ key: 'line', label: 'line' }, { key: 'amount', label: 'invoiced', align: 'right' }]));
  console.log(`\n${table(result.by_practitioner.map((r) => ({ ...r, value: money(r.menu_value_cents) })), [{ key: 'practitioner', label: 'practitioner' }, { key: 'treatments', label: 'treatments', align: 'right' }, { key: 'value', label: 'at menu price', align: 'right' }])}`);
}

async function cmdRetention(db, flags) {
  const rows = await db.query(`select * from v_retention where due_back_on <= current_date and due_back_on > current_date - 365`);
  const by = {};
  for (const r of rows) {
    const k = r.practitioner;
    by[k] ||= { practitioner: k, due_back: 0, came_back: 0 };
    by[k].due_back++;
    if (r.came_back) by[k].came_back++;
  }
  const result = { by_practitioner: Object.values(by).map((x) => ({ ...x, rate: x.due_back ? Math.round((100 * x.came_back) / x.due_back) : null })), not_back: rows.filter((r) => !r.came_back).map((r) => ({ client: r.client, treatment: r.treatment, practitioner: r.practitioner, due_back_on: isoDate(r.due_back_on), phone: r.phone })) };
  if (out(flags, result)) return;
  console.log(heading('Retention: clients due back in the last year, and who came back'));
  console.log(table(result.by_practitioner.map((r) => ({ ...r, rate: r.rate === null ? '' : `${r.rate}%` })), [{ key: 'practitioner', label: 'practitioner' }, { key: 'due_back', label: 'due back', align: 'right' }, { key: 'came_back', label: 'came back', align: 'right' }, { key: 'rate', label: 'retention', align: 'right' }]));
  if (result.not_back.length) console.log(`\n  Due back and not booked:\n${table(result.not_back, [{ key: 'due_back_on', label: 'due' }, { key: 'client', label: 'client' }, { key: 'treatment', label: 'last treatment', width: 32 }, { key: 'practitioner', label: 'with' }, { key: 'phone', label: 'phone' }])}`);
}

// ---------------------------------------------------------------------------
// The team and the menu

async function cmdTeam(db, flags) {
  const rows = await db.query(`select * from practitioners where status = 'active' order by name`);
  const result = rows.map((p) => ({ name: p.name, role: p.role, registration_no: p.registration_no, prescriber: p.prescriber, injector: p.injector, indemnity_expires: p.indemnity_expires ? isoDate(p.indemnity_expires) : null, days: p.days, hours: `${hhmm(p.starts_at)}-${hhmm(p.ends_at)}` }));
  if (out(flags, result)) return;
  console.log(heading('The team'));
  console.log(table(result.map((r) => ({ ...r, role: r.role.replace('_', ' '), can: [r.prescriber && 'prescribes', r.injector && 'injects'].filter(Boolean).join(', '), registration_no: r.registration_no || 'unregistered', indemnity_expires: r.indemnity_expires || '' })), [{ key: 'name', label: 'name' }, { key: 'role', label: 'role' }, { key: 'registration_no', label: 'registration' }, { key: 'can', label: 'can' }, { key: 'indemnity_expires', label: 'indemnity to' }, { key: 'days', label: 'days' }, { key: 'hours', label: 'hours' }]));
}

async function cmdPractitionerAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('practitioner add "Name" --role=doctor|nurse_practitioner|nurse|dentist|dermal_therapist --registration= --indemnity=YYYY-MM-DD [--prescriber --injector --days=mon,tue --hours=09:00-17:30]');
  const role = str(flags.role) || 'other';
  const [s, e] = (str(flags.hours) || '09:00-17:30').split('-');
  if (flags.prescriber && !['doctor', 'nurse_practitioner', 'dentist'].includes(role)) throw new CliError(`A ${role.replace('_', ' ')} does not prescribe here. Prescribers are doctors, nurse practitioners or dentists.`);
  if (flags.injector && !['doctor', 'nurse_practitioner', 'nurse', 'dentist'].includes(role)) throw new CliError('Injectables are given by a registered health practitioner: doctor, nurse practitioner, nurse or dentist.');
  await db.query(
    'insert into practitioners (name, role, registration_no, prescriber, injector, indemnity_expires, days, starts_at, ends_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [name, role, str(flags.registration) || null, Boolean(flags.prescriber), Boolean(flags.injector), parseDate(flags.indemnity, 'indemnity date'), str(flags.days) || 'mon,tue,wed,thu,fri', parseTime(s), parseTime(e)],
  );
  if (out(flags, { name, role })) return;
  console.log(`${name} added.`);
}

async function cmdPractitionerSet(db, args, flags) {
  const p = await resolvePractitioner(db, args.join(' '));
  const sets = [];
  const vals = [p.id];
  if (flags.indemnity) { vals.push(parseDate(flags.indemnity, 'indemnity date')); sets.push(`indemnity_expires = $${vals.length}`); }
  if (flags.days) { vals.push(str(flags.days)); sets.push(`days = $${vals.length}`); }
  if (flags.registration) { vals.push(str(flags.registration)); sets.push(`registration_no = $${vals.length}`); }
  if (flags.leave) sets.push(`status = 'former'`);
  if (!sets.length) throw new CliError('Nothing to change: --indemnity= --days= --registration= --leave');
  await db.query(`update practitioners set ${sets.join(', ')} where id = $1`, vals);
  if (out(flags, { name: p.name, changed: sets.length })) return;
  console.log(`${p.name} updated.`);
}

async function cmdTreatments(db, flags) {
  const rows = await db.query('select * from treatments where active order by kind, code');
  const result = rows.map((t) => ({ code: t.code, name: t.name, kind: t.kind, minutes: t.minutes, fee_cents: t.fee_cents, cosmetic_procedure: t.cosmetic_procedure, needs_script: t.needs_script, adult_only: t.adult_only, consent: t.consent_group, review_days: t.review_days, rebook_weeks: t.rebook_weeks }));
  if (out(flags, result)) return;
  console.log(heading('The menu'));
  console.log(table(result.map((r) => ({ ...r, fee: price(r.fee_cents), rules: [r.needs_script && 'script', r.adult_only && '18+', r.consent && `consent: ${r.consent}`, r.cosmetic_procedure && 'no packages'].filter(Boolean).join(', '), back: [r.review_days && `review ${r.review_days}d`, r.rebook_weeks && `rebook ${r.rebook_weeks}w`].filter(Boolean).join(', ') })), [{ key: 'code', label: 'code' }, { key: 'name', label: 'treatment', width: 34 }, { key: 'minutes', label: 'min', align: 'right' }, { key: 'fee', label: 'fee', align: 'right' }, { key: 'rules', label: 'rules', width: 40 }, { key: 'back', label: 'follow-up' }]));
}

// ---------------------------------------------------------------------------
// Attention: everything that wants a decision, worst first

async function cmdAttention(db, flags) {
  const rows = [];
  const push = (rank, reason, who, ref, detail) => rows.push({ rank, reason, who, ref, detail });
  const s = async (k, d) => num(await setting(db, k, d));
  const recordDue = await s('record_due_days', '1');
  const scriptWarn = await s('script_warn_days', '14');
  const batchWarn = await s('batch_warn_days', '45');
  const grace = await s('rebook_grace_days', '14');
  const indemnityWarn = await s('indemnity_warn_days', '30');
  const debtorDays = await s('debtor_days', '14');
  const packageWarn = await s('package_warn_days', '30');

  // [1] Open complications: the client comes before everything else.
  for (const m of await db.query(`select * from v_complications where status = 'open' order by severity desc, reported_on`)) {
    if (m.severity === 'minor' && m.follow_up_booked) continue;
    push(1, 'complication_open', m.client, m.ref, `${m.client} reported "${m.description}" ${m.days_open} day(s) ago after ${m.treatment || 'treatment'} by ${m.practitioner || 'unknown'} (${m.severity}). ${m.follow_up_booked ? 'A visit is booked.' : 'Nothing is booked to see them.'} ${m.escalated_to ? `Escalated to ${m.escalated_to}.` : ''}Call ${m.phone || '(no phone)'} today and book them in with the treating practitioner; follow the complications protocol.`);
  }

  // [1] and [2] Upcoming treatments that cannot lawfully go ahead as booked.
  for (const a of await db.query(`select * from v_appointments where status in ('booked', 'confirmed') and on_date between current_date and current_date + 60 order by on_date, starts_at`)) {
    const [client] = await db.query('select * from v_clients where client_id = $1', [a.client_id]);
    const [treatment] = await db.query('select * from treatments where id = $1', [a.treatment_id]);
    const [practitioner] = await db.query('select * from practitioners where id = $1', [a.practitioner_id]);
    const onDate = isoDate(a.on_date);
    const soon = daysBetween(today(), onDate) <= scriptWarn;
    const gates = await treatmentGates(db, { client, treatment, practitioner, onDate });
    const g = (name) => gates.find((x) => x.gate === name);
    const when = `${onDate} ${hhmm(a.starts_at)}`;
    if (g('age')) { push(1, 'under_18_injectable', a.client, a.ref, `${a.client} is booked ${when} (${a.ref}) for ${a.treatment}. ${g('age').problem} Cancel it and tell them why: cancel ${a.ref} --reason="under 18"`); continue; }
    if (g('indemnity')) push(1, 'no_indemnity', a.practitioner, a.ref, `${a.ref} (${a.client}, ${when}): ${g('indemnity').problem}`);
    if (g('script')) {
      if (soon) push(1, 'no_script', a.client, a.ref, `${a.client} is booked ${when} (${a.ref}) for ${a.treatment}, and the treatment cannot go ahead: ${g('script').problem.replace(/^No current/, 'there is no current')}`);
      else {
        const [last] = await db.query(`select ref, valid_until from v_scripts where client_id = $1 and product_kind = $2 and current order by valid_until desc limit 1`, [a.client_id, a.product_kind]);
        push(4, 'script_expires_before_visit', a.client, a.ref, last ? `${a.client}'s ${last.ref} runs out ${isoDate(last.valid_until)}, before their ${a.treatment} on ${when} (${a.ref}). Book the prescriber consultation for the week of the visit.` : `${a.client} is booked ${when} (${a.ref}) for ${a.treatment} with no script yet. Book the prescriber consultation.`);
      }
    }
    if (g('cooling_off')) push(1, 'inside_cooling_off', a.client, a.ref, `${a.client} is booked ${when} (${a.ref}) for ${a.treatment}. ${g('cooling_off').problem}`);
    if (g('consent') && !g('cooling_off')) {
      const [k] = await db.query(`select ref, expires_on from v_consents where client_id = $1 and consent_group = $2 and status = 'active' and expires_on >= current_date order by expires_on desc limit 1`, [a.client_id, a.consent_group]);
      if (k && isoDate(k.expires_on) < onDate) push(4, 'consent_expires_before_visit', a.client, a.ref, `${a.client}'s ${a.consent_group} consent ${k.ref} runs out ${isoDate(k.expires_on)}, before their ${a.treatment} on ${when} (${a.ref}). Take a fresh written consent at the visit, before treatment.`);
      else push(soon ? 2 : 4, 'consent_missing', a.client, a.ref, `${a.ref} (${a.client}, ${when}): ${g('consent').problem}`);
    }
    if (a.cosmetic_procedure && num(a.deposit_cents) && a.consent_group) {
      const [k] = await db.query(`select ref, cooling_off_until from consents where client_id = $1 and consent_group = $2 and cooling_off_until is not null and $3 < cooling_off_until order by signed_on desc limit 1`, [a.client_id, a.consent_group, isoDate(a.deposit_paid_on || today())]);
      if (k) push(2, 'deposit_in_cooling_off', a.client, a.ref, `A ${price(a.deposit_cents)} deposit was taken on ${isoDate(a.deposit_paid_on)} for ${a.ref}, inside ${a.client}'s cooling-off (until ${isoDate(k.cooling_off_until)}). No money is taken before it ends other than for the consultation (s4.6): refund it now.`);
    }
  }

  // [1] The treatment record.
  for (const r of await db.query('select * from v_records_due order by on_date')) {
    const late = num(r.days_since) > recordDue;
    push(1, r.record_state === 'missing' ? 'record_missing' : 'record_draft', r.client, r.record_ref || r.ref, `${r.client}'s ${r.treatment} with ${r.practitioner} on ${isoDate(r.on_date)} has ${r.record_state === 'missing' ? 'no treatment record at all' : `a record still in draft (${r.record_ref})`}${late ? `, ${r.days_since} days on` : ''}. Another practitioner could not take over their care from this. Write it now: record write ${r.record_ref || r.ref} --notes="..." --areas="..." --aftercare${r.record_state === 'missing' ? ' --batch=... --qty=...' : ''}, then record final ${r.record_ref || r.ref}`);
  }

  // [2] Consents that are not complete.
  for (const k of await db.query(`select * from v_consents where status = 'active' and expires_on >= current_date and (not financial_consent or not copy_given)`)) {
    push(2, 'consent_incomplete', k.client, k.ref, `${k.client}'s ${k.consent_group} consent ${k.ref} has ${!k.financial_consent ? 'no financial consent' : ''}${!k.financial_consent && !k.copy_given ? ' and ' : ''}${!k.copy_given ? 'no record of a copy given to the client' : ''} (s5.3). Give them the copy and record it: consent complete ${k.ref}${!k.financial_consent ? ' --financial' : ''}${!k.copy_given ? ' --copy' : ''}`);
  }

  // [2] Photos in advertising without a current advertising consent.
  for (const p of await db.query(
    `select c.name, c.photo_consent, c.ad_consent_withdrawn_on, count(*) as n from photos ph join clients c on c.id = ph.client_id
     where ph.advertising and (c.photo_consent <> 'advertising' or c.ad_consent_withdrawn_on is not null) group by c.name, c.photo_consent, c.ad_consent_withdrawn_on`,
  )) {
    push(2, 'photo_ad_withdrawn', p.name, '', `${p.n} photo(s) of ${p.name} are still marked for advertising, ${p.ad_consent_withdrawn_on ? `but they withdrew consent on ${isoDate(p.ad_consent_withdrawn_on)}` : 'without a separate advertising consent'}. Take them down wherever they are published, then: photo consent "${p.name}" --level=withdraw (s5.10)`);
  }

  // [2] Expired stock still on the shelf.
  for (const b of await db.query('select * from v_batches where expired and on_hand > 0 order by expires_on')) {
    push(2, 'batch_expired', b.product, b.batch_no, `Batch ${b.batch_no} of ${b.product} expired ${isoDate(b.expires_on)} and ${qtyOf(b.on_hand)} ${b.unit} are still on the shelf (${money(b.value_cents)} at cost). It cannot be used: quarantine it and write it off: stock writeoff ${b.batch_no} --reason=expired`);
  }

  // [2] Packages sold on a cosmetic procedure.
  for (const k of await db.query(`select * from v_packages where status = 'active' and cosmetic_procedure`)) {
    push(2, 'package_on_procedure', k.client, k.ref, `${k.client} holds ${k.ref}, a ${k.sessions_total}-session package of ${k.treatment} sold ${isoDate(k.sold_on)}, with ${k.sessions_left} left (${money(k.unused_value_cents)} unused). Packages on cosmetic procedures are not allowed (s14.2, s14.4): offer a refund of the unused sessions and bill future visits at the menu price.`);
  }

  // [3] Clinical reviews overdue.
  for (const f of await db.query(`select * from v_followups where kind = 'review' and due_on < current_date and next_appt_on is null order by due_on`)) {
    push(3, 'review_overdue', f.client, f.record_ref || '', `${f.client}'s two-week review after ${f.treatment} was due ${isoDate(f.due_on)}, ${f.days_overdue} days ago, after ${f.contacts} contact(s), and nothing is booked. It is clinical care: call ${f.phone || '(no phone)'} whatever their marketing answer.`);
  }

  // [3] Indemnity running out.
  for (const p of await db.query(`select * from practitioners where status = 'active' and indemnity_expires is not null and indemnity_expires <= current_date + $1::int order by indemnity_expires`, [indemnityWarn])) {
    const left = daysBetween(today(), isoDate(p.indemnity_expires));
    push(left < 0 ? 1 : 3, 'indemnity_expiring', p.name, '', `${p.name}'s professional indemnity cover ${left < 0 ? 'ended' : 'ends'} ${isoDate(p.indemnity_expires)}${left >= 0 ? ` (${left} days)` : ''}. No cover, no treating: renew it and record it: practitioner set "${p.name}" --indemnity=YYYY-MM-DD`);
  }

  // [4] Money owed.
  for (const d of await db.query(`select * from v_invoices where status = 'sent' and balance_cents > 0 and days_overdue > $1 order by days_overdue desc`, [debtorDays])) {
    push(4, 'debtor', d.client, d.ref, `${d.client} owes ${money(d.balance_cents)} on ${d.ref}, ${d.days_overdue} days overdue. Chase it (/draft-reminders), or take it at their next visit.`);
  }

  // [5] Stock and batches.
  for (const b of await db.query(`select * from v_batches where not expired and on_hand > 0 and days_to_expiry <= $1 order by expires_on`, [batchWarn])) {
    push(5, 'batch_expiring', b.product, b.batch_no, `Batch ${b.batch_no} of ${b.product} expires ${isoDate(b.expires_on)} (${b.days_to_expiry} days) with ${qtyOf(b.on_hand)} ${b.unit} left. Use it first.`);
  }
  for (const p of await db.query('select * from v_stock where active and low order by kind, sku')) {
    push(5, 'stock_low', p.name, p.sku, `${p.name} is down to ${qtyOf(p.usable)} ${p.unit} in date, reorder point ${qtyOf(p.reorder_at)}. Order more, then receive it by batch: stock receive ${p.sku} --batch= --expires= --qty=`);
  }
  for (const k of await db.query(`select * from v_packages where status = 'active' and not cosmetic_procedure and sessions_left > 0 and days_left between 0 and $1 order by expires_on`, [packageWarn])) {
    push(5, 'package_expiring', k.client, k.ref, `${k.client}'s ${k.ref} (${k.treatment}) has ${k.sessions_left} of ${k.sessions_total} sessions left and expires ${isoDate(k.expires_on)} (${k.days_left} days): ${money(k.unused_value_cents)} they paid for. Book the sessions in.`);
  }

  // [5] Reviews falling due.
  for (const f of await db.query(`select * from v_followups where kind = 'review' and due_on between current_date and current_date + 3 and next_appt_on is null order by due_on`)) {
    push(5, 'review_due_soon', f.client, f.record_ref || '', `${f.client}'s two-week review after ${f.treatment} falls due ${isoDate(f.due_on)}. Book it (/new-appointment with REV).`);
  }

  // [6] Rebooks overdue.
  for (const f of await db.query(`select * from v_followups where kind = 'rebook' and due_on < current_date - $1::int and next_appt_on is null order by due_on`, [grace])) {
    const how = f.marketing_opt_in === true ? 'a rebook message is ready to draft (/draft-rebook)' : f.marketing_opt_in === false ? 'they said no to marketing, so leave it until they book' : `they were never asked about messages, so it is a phone call: ${f.phone || '(no phone)'}`;
    push(6, 'rebook_overdue', f.client, '', `${f.client} was due back for ${f.treatment} on ${isoDate(f.due_on)}, ${f.days_overdue} days ago, and nothing is booked; ${how}.`);
  }

  // [6] Tomorrow's unconfirmed bookings.
  for (const a of await db.query(`select * from v_appointments where status = 'booked' and on_date = current_date + 1 order by starts_at`)) {
    push(6, 'unconfirmed', a.client, a.ref, `${a.client} is booked tomorrow ${hhmm(a.starts_at)} (${a.ref}, ${a.treatment}) and has not confirmed. Remind them (/draft-reminders), then: confirm ${a.ref}`);
  }

  rows.sort((a, b) => a.rank - b.rank);
  if (out(flags, rows)) return;
  console.log(heading('Needs a decision, worst first'));
  if (!rows.length) { console.log('  Nothing. The record is clean.'); return; }
  for (const r of rows) console.log(`\n  [${r.rank}] ${r.reason}  ${r.who}${r.ref ? `  ${r.ref}` : ''}\n      ${r.detail}`);
}

// ---------------------------------------------------------------------------
// Compliance: the rule book run against the records

const G = 'Ahpra and National Boards, Guidelines for registered health practitioners who perform non-surgical cosmetic procedures (2 September 2025)';
const MBA = 'Medical Board of Australia, Guidelines for registered medical practitioners who perform cosmetic surgery and procedures (2023)';

async function cmdCompliance(db, args, flags) {
  const recordDue = num(await setting(db, 'record_due_days', '1'));
  const adultAge = num(await setting(db, 'adult_age', '18'));
  const checks = [];
  const add = (rule, name, source, bad, okText) => checks.push({ rule, name, source, ok: bad.length === 0, found: bad.length ? bad.join(', ') : okText });

  const late = await db.query('select * from v_records_due where days_since > $1', [recordDue]);
  add('records', 'Every treatment has a finalised record another practitioner could take over from', `${G}, s7.7; ${MBA}; docs/compliance.md`,
    late.map((r) => `${r.record_ref || r.ref} (${r.client}, ${r.record_state}, ${r.days_since} days)`), 'every treatment is recorded and final inside the window');

  const scriptless = await db.query(
    `select r.ref, c.name from records r join clients c on c.id = r.client_id join treatments t on t.id = r.treatment_id
     left join scripts s on s.id = r.script_id left join practitioners p on p.id = s.prescriber_id
     where t.needs_script and not r.imported and (s.id is null or s.client_id <> r.client_id or not p.prescriber or r.on_date < s.consult_on or r.on_date > s.valid_until)`,
  );
  add('scripts', 'Every prescription-only injectable given under that client\'s own script, after an in-person or video consultation', `${G}, s3.2 and s3.3; ${MBA}; docs/compliance.md`,
    scriptless.map((r) => `${r.ref} (${r.name})`), 'every injectable sits inside a current script from a prescriber (the database refuses a script without a real-time consultation)');

  const minors = await db.query(
    `select r.ref, c.name, extract(year from age(r.on_date, c.date_of_birth))::int as age from records r join clients c on c.id = r.client_id join treatments t on t.id = r.treatment_id
     where t.adult_only and (c.date_of_birth is null or extract(year from age(r.on_date, c.date_of_birth)) < $1)`, [adultAge]);
  const minorBookings = await db.query(`select ref, client from v_appointments where adult_only and status in ('booked', 'confirmed') and (age_on_day is null or age_on_day < $1)`, [adultAge]);
  add('under-18', `No toxin or filler for anyone under ${adultAge}`, `${G}, s4.2; ${MBA}; docs/compliance.md`,
    [...minors.map((r) => `${r.ref} (${r.name}, ${r.age ?? 'no date of birth'})`), ...minorBookings.map((a) => `${a.ref} booked (${a.client})`)], 'none given, none booked');

  const noConsent = await db.query(
    `select r.ref, c.name, k.ref as con, k.financial_consent, k.copy_given from records r join clients c on c.id = r.client_id join treatments t on t.id = r.treatment_id
     left join consents k on k.id = r.consent_id
     where t.cosmetic_procedure and not r.imported and (k.id is null or not k.financial_consent or not k.copy_given or r.on_date < k.signed_on or r.on_date > k.expires_on)`,
  );
  add('consent', 'Every cosmetic procedure under a written consent, financial consent included, copy given', `${G}, s5.1 to s5.3; docs/compliance.md`,
    noConsent.map((r) => `${r.ref} (${r.name}${r.con ? `, ${r.con}: ${!r.financial_consent ? 'no financial consent' : ''}${!r.copy_given ? 'no copy given' : ''}` : ', no consent'})`), 'every procedure has a complete consent');

  const coolTreated = await db.query(
    `select r.ref, c.name from records r join clients c on c.id = r.client_id join consents k on k.id = r.consent_id
     where k.cooling_off_until is not null and r.on_date < k.cooling_off_until`);
  const coolMoney = await db.query(
    `select a.ref, c.name from appointments a join clients c on c.id = a.client_id join treatments t on t.id = a.treatment_id
     join consents k on k.client_id = a.client_id and k.consent_group = t.consent_group
     where t.cosmetic_procedure and a.deposit_cents > 0 and k.cooling_off_until is not null and a.deposit_paid_on < k.cooling_off_until and a.deposit_paid_on >= k.signed_on`);
  add('cooling-off', 'Under 18: seven days between consent and procedure, and no money taken before then', `${G}, s4.5 and s4.6; ${MBA}; docs/compliance.md`,
    [...coolTreated.map((r) => `${r.ref} treated inside the cooling-off (${r.name})`), ...coolMoney.map((a) => `${a.ref} deposit taken inside the cooling-off (${a.name})`)], 'every cooling-off respected');

  const noBatch = await db.query(
    `select r.ref, c.name from records r join clients c on c.id = r.client_id join treatments t on t.id = r.treatment_id
     where t.kind = 'injectable' and not r.imported and r.status = 'final' and not exists (select 1 from product_usage u where u.record_id = r.id)`);
  const expiredUse = await db.query(
    `select r.ref, c.name, b.batch_no from product_usage u join records r on r.id = u.record_id join batches b on b.id = u.batch_id join clients c on c.id = r.client_id
     where r.on_date > b.expires_on`);
  add('batches', 'Every injectable record names the product and batch, and no expired batch was used', `${G}, s6.1 and s7.6; TGA, Uniform Recall Procedure for Therapeutic Goods; docs/compliance.md`,
    [...noBatch.map((r) => `${r.ref} (${r.name}, no batch)`), ...expiredUse.map((r) => `${r.ref} (${r.name}, expired batch ${r.batch_no})`)], 'every syringe traces to a batch that was in date');

  const photos = await db.query(
    `select c.name, count(*) as n from photos ph join clients c on c.id = ph.client_id
     where ph.advertising and (c.photo_consent <> 'advertising' or c.ad_consent_withdrawn_on is not null) group by c.name`);
  add('photos', 'Photos in advertising only with a separate advertising consent that has not been withdrawn', `${G}, s5.5 to s5.10; docs/compliance.md`,
    photos.map((p) => `${p.name} (${p.n} photo(s))`), 'every advertising photo is covered');

  const inducements = await db.query(`select ref, client, treatment from v_packages where cosmetic_procedure and status = 'active'`);
  add('inducements', 'No packages, discounts or free procedures on a cosmetic procedure', `${G}, s14.2 and s14.4; docs/compliance.md`,
    inducements.map((k) => `${k.ref} (${k.client}, ${k.treatment})`), 'no package or discount on a cosmetic procedure');

  const cover = await db.query(
    `select distinct p.name, p.indemnity_expires, p.registration_no from records r join practitioners p on p.id = r.practitioner_id join treatments t on t.id = r.treatment_id
     where t.cosmetic_procedure and not r.imported and (p.registration_no is null or p.indemnity_expires is null or p.indemnity_expires < r.on_date)`);
  add('practitioners', 'Every cosmetic procedure given by a registered practitioner with indemnity cover on the day', `${G}, s1 (application) and the Boards' professional indemnity insurance registration standards; docs/compliance.md`,
    cover.map((p) => `${p.name} (${!p.registration_no ? 'no registration' : `cover ${p.indemnity_expires ? `ended ${isoDate(p.indemnity_expires)}` : 'not recorded'}`})`), 'every treating practitioner was registered and covered');

  const unmanaged = await db.query(`select ref, client, severity from v_complications where status = 'open' and (action is null or (severity = 'serious' and escalated_to is null))`);
  add('complications', 'Every complication has an action recorded, and serious ones are escalated', `${G}, s7.3 to s7.5; docs/compliance.md`,
    unmanaged.map((m) => `${m.ref} (${m.client}, ${m.severity})`), 'every open complication is being managed');

  const breached = checks.filter((c) => !c.ok).length;
  if (out(flags, { checks, breached })) return;
  console.log(heading('The rule book against the records'));
  for (const c of checks) console.log(`\n  ${c.ok ? 'OK    ' : 'BREACH'}  ${c.name}\n          ${c.found}\n          Source: ${c.source}`);
  console.log(`\n  ${breached ? `${breached} rule(s) breached.` : 'Every rule holds.'} Nothing here is legal advice: docs/compliance.md lists the rules the clinic has told the system to enforce.`);
}

async function cmdSettings(db, args, flags) {
  if ((args[0] || '').toLowerCase() === 'set') {
    const [, key, ...rest] = args;
    const value = rest.join(' ');
    const [row] = await db.query('select key from settings where key = $1', [key]);
    if (!row) throw new CliError(`No setting "${key}". See: settings`);
    await db.query('update settings set value = $2 where key = $1', [key, value]);
    if (out(flags, { key, value })) return;
    console.log(`${key} = ${value}`);
    return;
  }
  const rows = await db.query('select key, value, note from settings order by key');
  if (out(flags, rows)) return;
  console.log(heading('Settings'));
  console.log(table(rows, [{ key: 'key', label: 'setting' }, { key: 'value', label: 'value' }, { key: 'note', label: 'what it does', width: 80 }]));
}

// ---------------------------------------------------------------------------
// Import from Pabau, export to CSV

async function cmdImport(db, args, flags) {
  const source = (args[0] || 'pabau').toLowerCase();
  if (source !== 'pabau') throw new CliError(`Import knows Pabau's client and appointment reports. For "${source}", map its columns to Pabau's names or ask Claude Code to add a mapping.`);
  const clientsFile = str(flags.clients);
  const apptsFile = str(flags.appointments);
  if (!clientsFile && !apptsFile) throw new CliError('import pabau --clients=Clients.csv [--appointments=Appointments.csv] [--dry-run]');
  const dryRun = Boolean(flags['dry-run']);
  const created = [];
  const updated = [];
  const skipped = [];
  const ids = new Map((await db.query('select id, lower(name) as n from clients')).map((r) => [r.n, r.id]));
  const find = (name) => ids.get(name.toLowerCase()) || null;
  const nameOf = (row) => (pick(row, 'client name', 'client', 'name', 'full name') || `${pick(row, 'first name', 'firstname', 'given name') || ''} ${pick(row, 'last name', 'lastname', 'surname') || ''}`).trim().replace(/\s+/g, ' ');

  if (clientsFile) {
    if (!existsSync(clientsFile)) throw new CliError(`No file at ${clientsFile}.`);
    for (const row of parseCsv(readFileSync(clientsFile, 'utf8'))) {
      const name = nameOf(row);
      if (!name) { skipped.push({ what: 'client', why: 'a row with no name' }); continue; }
      let dob = null;
      try { dob = parseDate(pick(row, 'dob', 'date of birth', 'birthday', 'birth date'), 'date of birth'); } catch { skipped.push({ what: 'client', why: `${name}: unreadable date of birth "${pick(row, 'dob', 'date of birth', 'birthday', 'birth date')}"` }); continue; }
      const optRaw = pick(row, 'marketing opt in', 'opt in', 'opt in sms', 'opt in email', 'marketing', 'newsletter');
      const optIn = optRaw === undefined || optRaw === null || String(optRaw).trim() === '' ? null : yesNo(optRaw);
      const fields = [dob, pick(row, 'mobile', 'phone', 'mobile phone', 'phone number') || null, pick(row, 'email', 'email address') || null, pick(row, 'medical alerts', 'alerts', 'medical', 'allergies') || null, pick(row, 'source', 'lead source', 'how did you hear') || null, optIn];
      const id = find(name);
      if (id) {
        if (!dryRun) await db.query(
          `update clients set date_of_birth = coalesce(date_of_birth, $2), phone = coalesce(phone, $3), email = coalesce(email, $4), medical_flags = coalesce(medical_flags, $5), source = coalesce(source, $6), marketing_opt_in = coalesce(marketing_opt_in, $7) where id = $1`,
          [id, ...fields]);
        updated.push({ what: 'client', name });
        continue;
      }
      if (!dryRun) {
        const [c] = await db.query('insert into clients (name, date_of_birth, phone, email, medical_flags, source, marketing_opt_in, imported) values ($1, $2, $3, $4, $5, $6, $7, true) returning id', [name, ...fields]);
        ids.set(name.toLowerCase(), c.id);
      } else ids.set(name.toLowerCase(), `dry:${name}`);
      created.push({ what: 'client', name, date_of_birth: dob });
    }
  }

  if (apptsFile) {
    if (!existsSync(apptsFile)) throw new CliError(`No file at ${apptsFile}.`);
    const treatments = await db.query('select * from treatments where active');
    const practitioners = await db.query(`select * from practitioners where status = 'active'`);
    const lastByPair = new Map();
    for (const row of parseCsv(readFileSync(apptsFile, 'utf8'))) {
      const name = nameOf(row);
      const id = name ? find(name) : null;
      if (!id) { skipped.push({ what: 'appointment', why: `${name || '(no name)'}: not on the client list (import clients first)` }); continue; }
      const svc = String(pick(row, 'service', 'service name', 'treatment', 'appointment type') || '').trim();
      const t = treatments.find((x) => x.code.toLowerCase() === svc.toLowerCase()) || treatments.find((x) => x.name.toLowerCase() === svc.toLowerCase()) || treatments.find((x) => svc && (x.name.toLowerCase().includes(svc.toLowerCase()) || svc.toLowerCase().includes(x.name.toLowerCase())));
      if (!t) { skipped.push({ what: 'appointment', why: `${name}: service "${svc || '(none)'}" is not on the menu (add it with /customise, then import again)` }); continue; }
      const staff = String(pick(row, 'employee', 'staff', 'practitioner', 'staff member', 'provider') || '').trim();
      const p = practitioners.find((x) => x.name.toLowerCase() === staff.toLowerCase()) || practitioners.find((x) => staff && x.name.toLowerCase().includes(staff.toLowerCase().split(' ').pop()));
      if (!p) { skipped.push({ what: 'appointment', why: `${name}: practitioner "${staff || '(none)'}" is not on the team (practitioner add, then import again)` }); continue; }
      let onDate = null;
      try { onDate = parseDate(pick(row, 'date', 'appointment date', 'start date'), 'date'); } catch { /* named below */ }
      if (!onDate) { skipped.push({ what: 'appointment', why: `${name}: missing or unreadable date` }); continue; }
      let startsAt = null;
      try { startsAt = parseTime(pick(row, 'start time', 'time', 'start')) || '09:00'; } catch { startsAt = '09:00'; }
      const status = String(pick(row, 'status', 'appointment status') || '').toLowerCase();
      const past = onDate < today();
      if (/cancel|no.?show|dna/.test(status)) { skipped.push({ what: 'appointment', why: `${name} ${onDate}: ${status}, not carried across` }); continue; }
      const endsAt = addMinutes(startsAt, num(t.minutes));
      const exists = dryRun || String(id).startsWith('dry:') ? [] : await db.query('select id from appointments where client_id = $1 and treatment_id = $2 and on_date = $3 and starts_at = $4', [id, t.id, onDate, startsAt]);
      if (exists.length) { updated.push({ what: 'appointment', name, date: onDate }); continue; }
      if (!dryRun) {
        const ref = await mintRef(db, 'appointments', 'APT', 1001);
        const [a] = await db.query(
          `insert into appointments (ref, client_id, practitioner_id, treatment_id, on_date, starts_at, ends_at, status, imported) values ($1, $2, $3, $4, $5, $6, $7, $8, true) returning id`,
          [ref, id, p.id, t.id, onDate, startsAt, endsAt, past ? 'completed' : 'booked']);
        if (past && t.kind !== 'consult') {
          const rref = await mintRef(db, 'records', 'TRX', 501);
          const [r] = await db.query(
            `insert into records (ref, appointment_id, client_id, practitioner_id, treatment_id, on_date, notes, status, finalised_at, imported) values ($1, $2, $3, $4, $5, $6, 'Carried across from Pabau. The clinical record stays in the Pabau export.', 'final', now(), true) returning id`,
            [rref, a.id, id, p.id, t.id, onDate]);
          const key = `${id}:${t.id}`;
          if (!lastByPair.has(key) || lastByPair.get(key).onDate < onDate) lastByPair.set(key, { onDate, recordId: r.id, clientId: id, t });
        }
      }
      created.push({ what: past ? 'past treatment' : 'booking', name, date: onDate, treatment: t.code });
    }
    // The rebook clock: from each client's latest treatment of each kind.
    for (const { onDate, recordId, clientId, t } of lastByPair.values()) {
      if (!t.rebook_weeks) continue;
      const [open] = await db.query(`select 1 from followups where client_id = $1 and kind = 'rebook' and status in ('open', 'booked')`, [clientId]);
      if (open) continue;
      await db.query(`insert into followups (client_id, record_id, kind, due_on) values ($1, $2, 'rebook', $3)`, [clientId, recordId, addDays(onDate, num(t.rebook_weeks) * 7)]);
      created.push({ what: 'rebook', client_id: clientId, due_on: addDays(onDate, num(t.rebook_weeks) * 7) });
    }
  }

  const result = { dry_run: dryRun, created, updated, skipped };
  if (out(flags, result)) return;
  const count = (arr, what) => arr.filter((x) => x.what === what).length;
  console.log(`${dryRun ? 'Dry run, nothing written. ' : ''}Clients: ${count(created, 'client')} new, ${count(updated, 'client')} matched. Past treatments: ${count(created, 'past treatment')}. Bookings: ${count(created, 'booking')}. Rebook dates: ${count(created, 'rebook')}.`);
  for (const s of skipped) console.log(`  Skipped ${s.what}: ${s.why}`);
  console.log('  Consents, scripts and medical forms do not come across: take a fresh written consent at each client\'s first visit here.');
  if (dryRun) console.log('  Happy with that? Run the same command without --dry-run.');
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

async function cmdExport(db, flags) {
  const dir = path.resolve(str(flags.out) || 'export');
  mkdirSync(dir, { recursive: true });
  const sets = {
    'clients.csv': 'select name, date_of_birth, phone, email, medical_flags, photo_consent, marketing_opt_in, source, status from clients order by name',
    'appointments.csv': 'select ref, client, practitioner, treatment, on_date, starts_at, status, deposit_cents, notes from v_appointments order by on_date, starts_at',
    'records.csv': 'select ref, client, practitioner, treatment, on_date, areas, products_used, notes, aftercare_given, script_ref, consent_ref, status from v_records order by on_date',
    'scripts.csv': 'select ref, client, prescriber, consult_on, consult_mode, product_kind, product, max_quantity, unit, areas, treatments_allowed, treatments_used, valid_until, status from v_scripts order by consult_on',
    'consents.csv': 'select ref, client, consent_group, signed_on, expires_on, financial_consent, copy_given, cooling_off_until, status from v_consents order by signed_on',
    'batches.csv': 'select batch_no, sku, product, on_hand, unit, expires_on, received_on from v_batches order by expires_on',
    'batch-usage.csv': 'select b.batch_no, pr.name as product, r.ref as record, c.name as client, r.on_date, u.quantity from product_usage u join batches b on b.id = u.batch_id join products pr on pr.id = b.product_id join records r on r.id = u.record_id join clients c on c.id = r.client_id order by r.on_date',
    'complications.csv': 'select ref, client, record_ref, reported_on, severity, description, action, escalated_to, status, resolved_on from v_complications order by reported_on',
    'invoices.csv': 'select ref, client, issued_on, due_on, total_cents, paid_cents, balance_cents, status from v_invoices order by issued_on',
    'packages.csv': 'select ref, client, treatment, sessions_total, sessions_used, price_cents, sold_on, expires_on, status from v_packages order by sold_on',
  };
  const written = [];
  for (const [file, sql] of Object.entries(sets)) {
    const rows = await db.query(sql);
    writeFileSync(path.join(dir, file), toCsv(rows));
    written.push({ file, rows: rows.length });
  }
  if (out(flags, { dir, written })) return;
  console.log(`Exported ${written.length} files to ${dir}:`);
  for (const w of written) console.log(`  ${w.file}  ${w.rows} rows`);
}

async function cmdStats(db, flags) {
  const [s] = await db.query(`
    select (select count(*) from clients where status = 'active') as active_clients,
           (select count(*) from practitioners where status = 'active') as practitioners,
           (select count(*) from appointments where status in ('booked', 'confirmed') and on_date >= current_date) as booked_ahead,
           (select count(*) from v_records_due) as records_not_final,
           (select count(*) from v_scripts where current) as scripts_current,
           (select count(*) from v_consents where status = 'active' and expires_on >= current_date and (not financial_consent or not copy_given)) as consents_incomplete,
           (select count(*) from v_complications where status = 'open') as complications_open,
           (select count(*) from v_followups where kind = 'review' and due_on < current_date) as reviews_overdue,
           (select count(*) from v_followups where kind = 'rebook' and due_on < current_date) as rebooks_overdue,
           (select count(*) from v_batches where expired and on_hand > 0) as batches_expired,
           (select count(*) from v_stock where active and low) as stock_low,
           (select count(*) from v_packages where status = 'active' and cosmetic_procedure) as packages_on_procedures,
           (select coalesce(sum(balance_cents), 0) from v_invoices where status = 'sent') as clients_owe_cents`);
  const result = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, num(v)]));
  if (out(flags, result)) return;
  console.log(heading('The clinic in numbers'));
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.replace(/_/g, ' ').padEnd(24)} ${k.endsWith('_cents') ? money(v) : v}`);
}

function help() {
  console.log(`skin-clinic-for-claude-code

  The book     day [--date=]  book [--days=7 --practitioner=]  book add CLIENT --treatment=TOX --practitioner= --date= --time= [--notes=]
               confirm APT  cancel APT --reason=  dna APT  deposit APT --amount=
               complete APT [--batch= --qty= --areas= --notes= --aftercare]
  The record   record APT|TRX  record write APT|TRX [--notes= --areas= --aftercare --batch= --qty=]  record final TRX
               record addendum TRX "text"  records-due
  Scripts      consult CLIENT --prescriber= --mode=in_person|video --product=toxin|filler|booster --max= [--areas= --valid-days=60 --treatments=1]
               scripts [CLIENT] [--all]
  Consent      consent CLIENT --group=toxin|filler|booster|laser|peel [--financial --copy --by=]  consent complete CON [--financial --copy]
               consents [CLIENT] [--expiring]
  Clients      clients  client NAME  client add NAME --dob= ...  client set NAME ...  log NAME "text"
  Photos       photo consent CLIENT --level=clinical|advertising|withdraw|none  photo add CLIENT --file= [--record= --kind= --advertising]  photos [--advertising]
  Aftercare    complications [--all]  complication add CLIENT --severity= --description= [--action= --escalated-to=]
               complication update|resolve CMP [--action= --escalated-to=]  followups [--days= --kind=review|rebook]
               followup contacted|done|lapse CLIENT [--kind=]
  Stock        stock [--kind= --low]  batches [--expiring]  stock receive SKU --batch= --expires= --qty=  stock writeoff BATCH --reason=
               trace BATCH  sell CLIENT SKU [--qty= --owing]
  Packages     packages [--all]  package sell CLIENT --treatment= --sessions= --price= [--months=12]
  Money        invoices [--all]  debtors  pay INV [--amount= --method=]  takings [--days=30]  retention
  Clinic       attention  compliance  team  practitioner add|set NAME ...  treatments  settings [set KEY VALUE]  stats
  Data         import pabau --clients=FILE [--appointments=FILE] [--dry-run]  export [--out=DIR]

  Add --json to any command for machine output.`);
}

// ---------------------------------------------------------------------------
// Dispatch

const { args, flags } = parseArgv(process.argv.slice(2));
const [cmd, ...rest] = args;
if (!cmd || cmd === 'help' || (flags.help && !cmd)) { help(); process.exit(0); }

const db = await getDb();
try {
  const sub = (rest[0] || '').toLowerCase();
  switch (cmd) {
    case 'day': await cmdDay(db, flags); break;
    case 'book': if (sub === 'add') await cmdBookAdd(db, rest.slice(1), flags); else await cmdBook(db, flags); break;
    case 'confirm': await setApptStatus(db, rest, flags, 'confirmed'); break;
    case 'cancel': await setApptStatus(db, rest, flags, 'cancelled'); break;
    case 'dna': await setApptStatus(db, rest, flags, 'dna'); break;
    case 'deposit': await cmdDeposit(db, rest, flags); break;
    case 'complete': await cmdComplete(db, rest, flags); break;
    case 'record':
      if (sub === 'write') await cmdRecordWrite(db, rest.slice(1), flags);
      else if (sub === 'final') await cmdRecordFinal(db, rest.slice(1), flags);
      else if (sub === 'addendum') await cmdRecordAddendum(db, rest.slice(1), flags);
      else await cmdRecordShow(db, rest, flags);
      break;
    case 'records-due': await cmdRecordsDue(db, flags); break;
    case 'consult': await cmdConsult(db, rest, flags); break;
    case 'scripts': await cmdScripts(db, rest, flags); break;
    case 'consent':
      if (sub === 'complete') await cmdConsentComplete(db, rest.slice(1), flags);
      else await cmdConsentAdd(db, rest, flags);
      break;
    case 'consents': await cmdConsents(db, rest, flags); break;
    case 'clients': await cmdClients(db, flags); break;
    case 'client':
      if (sub === 'add') await cmdClientAdd(db, rest.slice(1), flags);
      else if (sub === 'set') await cmdClientSet(db, rest.slice(1), flags);
      else await cmdClient(db, rest, flags);
      break;
    case 'log': await cmdLog(db, rest, flags); break;
    case 'photo':
      if (sub === 'consent') await cmdPhotoConsent(db, rest.slice(1), flags);
      else if (sub === 'add') await cmdPhotoAdd(db, rest.slice(1), flags);
      else throw new CliError('photo consent|add CLIENT ... (list: photos)');
      break;
    case 'photos': await cmdPhotos(db, flags); break;
    case 'complications': await cmdComplications(db, flags); break;
    case 'complication':
      if (sub === 'add') await cmdComplicationAdd(db, rest.slice(1), flags);
      else if (['update', 'resolve'].includes(sub)) await cmdComplicationMove(db, sub, rest.slice(1), flags);
      else throw new CliError('complication add|update|resolve ... (list: complications)');
      break;
    case 'followups': await cmdFollowups(db, flags); break;
    case 'followup':
      if (['contacted', 'done', 'lapse'].includes(sub)) await cmdFollowupMove(db, sub, rest.slice(1), flags);
      else throw new CliError('followup contacted|done|lapse CLIENT (list: followups)');
      break;
    case 'stock':
      if (sub === 'receive') await cmdStockReceive(db, rest.slice(1), flags);
      else if (sub === 'writeoff') await cmdStockWriteoff(db, rest.slice(1), flags);
      else await cmdStock(db, flags);
      break;
    case 'batches': await cmdBatches(db, flags); break;
    case 'trace': await cmdTrace(db, rest, flags); break;
    case 'sell': await cmdSell(db, rest, flags); break;
    case 'packages': await cmdPackages(db, flags); break;
    case 'package':
      if (sub !== 'sell') throw new CliError('package sell CLIENT ... (list: packages)');
      await cmdPackageSell(db, rest.slice(1), flags);
      break;
    case 'invoices': await cmdInvoices(db, flags); break;
    case 'debtors': await cmdDebtors(db, flags); break;
    case 'pay': await cmdPay(db, rest, flags); break;
    case 'takings': await cmdTakings(db, flags); break;
    case 'retention': await cmdRetention(db, flags); break;
    case 'team': await cmdTeam(db, flags); break;
    case 'practitioner':
      if (sub === 'add') await cmdPractitionerAdd(db, rest.slice(1), flags);
      else if (sub === 'set') await cmdPractitionerSet(db, rest.slice(1), flags);
      else throw new CliError('practitioner add|set NAME (list: team)');
      break;
    case 'treatments': await cmdTreatments(db, flags); break;
    case 'attention': await cmdAttention(db, flags); break;
    case 'compliance': await cmdCompliance(db, rest, flags); break;
    case 'settings': await cmdSettings(db, rest, flags); break;
    case 'import': await cmdImport(db, rest, flags); break;
    case 'export': await cmdExport(db, flags); break;
    case 'stats': await cmdStats(db, flags); break;
    default:
      throw new CliError(`Unknown command "${cmd}". Run with no arguments for the list.`);
  }
} catch (e) {
  if (e instanceof CliError) {
    console.error(e.message);
    process.exitCode = e.code;
  } else {
    throw e;
  }
} finally {
  await db.close();
}
