#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.
//
// The seed anchors everything to current_date offsets, so every assertion
// here holds whatever day you run it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'skin-clinic-smoke-'));
const scratch = mkdtempSync(path.join(tmpdir(), 'skin-clinic-smoke-files-'));
const env = { ...process.env, DATA_DIR: dataDir, OUTPUT_DIR: scratch };
delete env.DATABASE_URL; // the smoke test always runs embedded

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json && !expectFail ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function refuses(label, args, pattern) {
  const r = run(label, args, { expectFail: true });
  assert(pattern.test(r.stderr), `${label}: the refusal says why (${r.stderr.trim()})`);
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const iso = (d) => {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const now = new Date();
const day = (offset) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
const dmy = (offset) => day(offset).split('-').reverse().join('/');
const C = 'clinic.mjs';

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the numbers, before anything moves ------------------------------------

  const stats = run('stats', [C, 'stats']);
  assert(n(stats.active_clients) === 19, `nineteen clients (${stats.active_clients})`);
  assert(n(stats.practitioners) === 3, 'three practitioners');
  assert(n(stats.records_not_final) === 2, `two treatments without a final record (${stats.records_not_final})`);
  assert(n(stats.complications_open) === 1, 'one open complication');
  assert(n(stats.reviews_overdue) === 1 && n(stats.rebooks_overdue) === 3, `one review and three rebooks overdue (${stats.reviews_overdue}, ${stats.rebooks_overdue})`);
  assert(n(stats.batches_expired) === 1 && n(stats.stock_low) === 2, 'one expired batch on the shelf, two lines to reorder');
  assert(n(stats.packages_on_procedures) === 1 && n(stats.consents_incomplete) === 1, 'one package on a procedure, one incomplete consent');
  assert(n(stats.clients_owe_cents) === 64900, `clients owe $649 (${stats.clients_owe_cents})`);

  const attention = run('attention', [C, 'attention']);
  const reasons = new Set(attention.map((r) => r.reason));
  for (const r of ['complication_open', 'no_script', 'under_18_injectable', 'inside_cooling_off', 'record_missing', 'record_draft', 'deposit_in_cooling_off', 'consent_incomplete', 'photo_ad_withdrawn', 'batch_expired', 'package_on_procedure', 'review_overdue', 'indemnity_expiring', 'script_expires_before_visit', 'consent_expires_before_visit', 'debtor', 'batch_expiring', 'stock_low', 'package_expiring', 'review_due_soon', 'rebook_overdue', 'unconfirmed']) {
    assert(reasons.has(r), `attention raises ${r}`);
  }
  assert(attention[0].rank === 1 && attention[0].reason === 'complication_open', 'the complication comes first');
  assert(attention.find((r) => r.reason === 'no_script').who === 'Zara Ahmed', 'Zara has no script for tomorrow');
  assert(attention.find((r) => r.reason === 'under_18_injectable').who === 'Chloe Bennett', 'Chloe is 17 and booked for filler');
  assert(/phone call/.test(attention.find((r) => r.who === 'Kate Delaney').detail), 'Kate was never asked: she gets a call');
  assert(/leave it/.test(attention.find((r) => r.who === 'Amelia Stone').detail), 'Amelia said no: nobody chases her');

  const compliance = run('compliance', [C, 'compliance']);
  const breached = new Set(compliance.checks.filter((c) => !c.ok).map((c) => c.rule));
  for (const r of ['records', 'under-18', 'consent', 'cooling-off', 'photos', 'inducements']) assert(breached.has(r), `compliance breaches ${r}`);
  for (const r of ['scripts', 'batches', 'practitioners', 'complications']) assert(!breached.has(r), `compliance holds ${r}`);
  assert(compliance.checks.every((c) => /docs\/compliance\.md/.test(c.source)), 'every rule cites its source');

  for (const cmd of ['day', 'book', 'records-due', 'scripts', 'consents', 'clients', 'photos', 'complications', 'followups', 'stock', 'batches', 'packages', 'invoices', 'debtors', 'takings', 'retention', 'team', 'treatments', 'settings']) {
    run(cmd, [C, cmd]);
  }
  const tomorrow = run('the day sheet flags tomorrow', [C, 'day', '--date=tomorrow']);
  assert(/NO SCRIPT/.test(tomorrow.appointments.find((a) => a.client === 'Zara Ahmed').before_they_arrive), 'Zara flagged NO SCRIPT on the day sheet');
  const mia = run('one client card', [C, 'client', 'Mia']);
  assert(mia.complications.length === 1 && mia.records[0].products_used.includes('VF2405'), 'Mia\'s card shows the complication and the batch in her cheeks');

  // ---- the gates ----------------------------------------------------------------------

  // Everyone injects every day for the rest of the test, so it holds on any weekday.
  run('practitioner hours changed', [C, 'practitioner', 'set', 'Jess Taylor', '--days=mon,tue,wed,thu,fri,sat,sun']);
  refuses('no toxin under 18, even booking it', [C, 'book', 'add', 'Chloe Bennett', '--treatment=TOX', '--practitioner=Jess', `--date=${day(2)}`, '--time=09:00'], /never given to anyone under 18/);
  refuses('no script by text or online form', [C, 'consult', 'Zara Ahmed', '--prescriber=Mei', '--mode=async', '--product=toxin', '--max=40'], /in-person or video/);
  refuses('a nurse does not write scripts', [C, 'consult', 'Zara Ahmed', '--prescriber=Jess', '--mode=video', '--product=toxin', '--max=40'], /not recorded as a prescriber/);
  refuses('no filler script for a 17-year-old', [C, 'consult', 'Chloe Bennett', '--prescriber=Mei', '--mode=video', '--product=filler', '--max=1'], /not prescribed for cosmetic purposes under 18/);
  const zaraScript = run('Zara sees Dr Chen by video', [C, 'consult', 'Zara Ahmed', '--prescriber=Mei', '--mode=video', '--product=toxin', '--max=40', '--areas=Frown, forehead, crow\'s feet']);
  assert(zaraScript.ref === 'SCR-315', `a new script (${zaraScript.ref})`);
  const after = run('Zara is cleared', [C, 'attention']);
  assert(!after.some((r) => r.reason === 'no_script' && r.who === 'Zara Ahmed'), 'the no-script row is gone');
  refuses('no deposit inside the cooling-off', [C, 'deposit', 'APT-1032', '--amount=100'], /cooling-off period/);
  refuses('no package on a cosmetic procedure', [C, 'package', 'sell', 'Lucy Harper', '--treatment=TOX', '--sessions=3', '--price=1200'], /s14\.2/);
  const peelPkg = run('a peel package is fine', [C, 'package', 'sell', 'Ella Martin', '--treatment=PEEL', '--sessions=4', '--price=600']);
  assert(peelPkg.ref === 'PKG-603', 'package sold');
  refuses('no advertising photo without the separate consent', [C, 'photo', 'add', 'Grace Liu', '--file=photos/grace/after.jpg', '--advertising'], /separate advertising consent/);
  refuses('no photo without photo consent', [C, 'photo', 'add', 'Holly Evans', '--file=photos/holly/before.jpg'], /not consented to photos/);
  run('Ruby\'s withdrawal is honoured', [C, 'photo', 'consent', 'Ruby Walsh', '--level=withdraw']);
  const ads = run('no advertising photos left without consent', [C, 'photos', '--advertising']);
  assert(ads.length === 0, 'Ruby\'s photos are off advertising');
  refuses('prescription-only products never sell over the counter', [C, 'sell', 'Holly Evans', 'TOXA-100'], /prescription-only/);
  const spf = run('sunscreen sells', [C, 'sell', 'Holly Evans', 'SPF50', '--qty=2']);
  assert(spf.total_cents === 9800, 'two sunscreens, $98');

  // ---- a toxin treatment, start to finish ---------------------------------------------

  run('Georgia sees Dr Chen', [C, 'consult', 'Georgia Reid', '--prescriber=Mei', '--mode=in_person', '--product=toxin', '--max=40']);
  const booked = run('book Georgia today', [C, 'book', 'add', 'Georgia Reid', '--treatment=TOX', '--practitioner=Jess', `--date=${day(0)}`, '--time=17:00']);
  assert(booked.ref && booked.warnings.length === 0, `booked clean (${JSON.stringify(booked.warnings)})`);
  refuses('no double booking', [C, 'book', 'add', 'Grace Liu', '--treatment=TOX', '--practitioner=Jess', `--date=${day(0)}`, '--time=17:15'], /already has Georgia Reid/);
  refuses('no booking outside hours', [C, 'book', 'add', 'Grace Liu', '--treatment=TOX', '--practitioner=Jess', `--date=${day(0)}`, '--time=17:45'], /outside Jess Taylor's hours/);
  refuses('no discount on a procedure', [C, 'complete', booked.ref, '--batch=TA2406', '--qty=40', '--discount=50'], /s14\.2/);
  refuses('an injectable names its batch', [C, 'complete', booked.ref], /names the batch/);
  refuses('an expired batch is never used', [C, 'complete', booked.ref, '--batch=TA2311', '--qty=20'], /expired/);
  refuses('the script caps the dose', [C, 'complete', booked.ref, '--batch=TA2406', '--qty=60'], /allows 40 units/);
  const done = run('complete with the batch', [C, 'complete', booked.ref, '--batch=TA2406', '--qty=40', '--areas=Frown 20, forehead 20']);
  assert(done.record && done.script && done.consent === 'CON-215' && done.billed.invoice, `record, script, consent and invoice (${JSON.stringify(done)})`);
  assert(done.followups.some((f) => f.kind === 'review' && f.due_on === day(14)) && done.followups.some((f) => f.kind === 'rebook' && f.due_on === day(84)), 'review in 14 days, rebook in 12 weeks');
  refuses('a record is not final without its notes and aftercare', [C, 'record', 'final', done.record], /cannot be finalised without/);
  run('write it up', [C, 'record', 'write', done.record, '--notes=Tolerated well, no immediate reaction', '--aftercare']);
  run('finalise it', [C, 'record', 'final', done.record]);
  refuses('a final record never changes', [C, 'record', 'write', done.record, '--notes=changed'], /finalised/);
  run('addenda instead', [C, 'record', 'addendum', done.record, 'Client rang day 3: all settled.']);
  const trace = run('trace the batch', [C, 'trace', 'TA2406']);
  assert(trace.given_to.some((g) => g.client === 'Georgia Reid' && g.quantity === 40) && trace.on_hand === 110, `the batch trail names Georgia and the stock fell to 110 (${trace.on_hand})`);
  const used = run('the script is used', [C, 'scripts', 'Georgia', '--all']);
  assert(used.find((s) => s.ref === 'SCR-316').used === '1/1', 'one treatment on one script');

  // ---- clearing yesterday's list ------------------------------------------------------

  const olivia = run('Olivia\'s missing record is written', [C, 'record', 'write', 'APT-1021', '--notes=Tolerated well', '--areas=Frown 18, forehead 12', '--aftercare', '--batch=TA2406', '--qty=30']);
  assert(olivia.script_ref === 'SCR-302' && /TA2406/.test(olivia.products_used), 'under her own script, from a batch');
  run('and finalised', [C, 'record', 'final', olivia.ref]);
  run('Hannah\'s draft is finished', [C, 'record', 'write', 'TRX-502', '--notes=Lips 1 ml, antiviral taken', '--aftercare']);
  run('and finalised', [C, 'record', 'final', 'TRX-502']);
  const due = run('no records owing', [C, 'records-due']);
  assert(due.length === 0, 'every treatment is written up');
  run('Mia\'s consent copy recorded', [C, 'consent', 'complete', 'CON-207', '--copy']);
  const minor = run('consent for a 17-year-old starts the cooling-off', [C, 'consent', 'Chloe Bennett', '--group=peel', '--financial', '--copy']);
  assert(minor.cooling_off_until === day(7), `cooling-off to ${minor.cooling_off_until}`);
  run('the complication is seen', [C, 'complication', 'update', 'CMP-801', '--action=Seen by Dr Chen: hyaluronidase not needed, massage and review in 3 days']);
  run('and resolved', [C, 'complication', 'resolve', 'CMP-801']);
  run('the expired batch is written off', [C, 'stock', 'writeoff', 'TA2311', '--reason=expired']);
  run('new stock received by batch', [C, 'stock', 'receive', 'TOXA-100', '--batch=TA2409', `--expires=${day(300)}`, '--qty=200']);
  refuses('never receive expired stock', [C, 'stock', 'receive', 'SPF50', '--batch=OLD1', `--expires=${day(-1)}`, '--qty=5'], /Do not receive expired stock/);
  run('Jess renewed her cover', [C, 'practitioner', 'set', 'Jess Taylor', `--indemnity=${day(365)}`]);
  run('Holly paid', [C, 'pay', 'INV-2007']);
  run('Kate was called', [C, 'followup', 'contacted', 'Kate Delaney']);
  const clean = run('compliance after the clean-up', [C, 'compliance']);
  const still = new Set(clean.checks.filter((c) => !c.ok).map((c) => c.rule));
  assert(!still.has('records') && !still.has('consent') && !still.has('photos'), `records, consent and photos now hold (${[...still].join(', ')})`);

  // ---- import from Pabau --------------------------------------------------------------------

  const clientsCsv = path.join(scratch, 'Clients.csv');
  writeFileSync(clientsCsv, [
    'First Name,Last Name,Email,Mobile,DOB,Medical Alerts,Opt In SMS',
    `Nina,Patel,nina@example.com,0400 111 222,12/05/1988,,Yes`,
    'Zara,Ahmed,,,,,',
    ',,,0400 999 000,,,',
    'Walter,Price,,0400 333 444,31/31/1970,,',
  ].join('\n'));
  const apptsCsv = path.join(scratch, 'Appointments.csv');
  writeFileSync(apptsCsv, [
    'Client Name,Service,Employee,Date,Start Time,Status',
    `Nina Patel,Toxin,Jess Taylor,${dmy(-100)},10:00,Completed`,
    `Nina Patel,Chemical peel,Ava Morris,${dmy(-40)},11:00,Completed`,
    `Nina Patel,Chemical peel,Ava Morris,${dmy(6)},11:00,Booked`,
    `Nina Patel,Lip flip,Jess Taylor,${dmy(-20)},10:00,Completed`,
    `Nobody Here,Toxin,Jess Taylor,${dmy(-10)},10:00,Completed`,
  ].join('\n'));
  const dry = run('import dry run', [C, 'import', 'pabau', `--clients=${clientsCsv}`, `--appointments=${apptsCsv}`, '--dry-run']);
  assert(dry.dry_run === true && dry.created.some((c) => c.what === 'client' && c.name === 'Nina Patel'), 'the dry run names who would land');
  assert(dry.skipped.some((s) => /no name/.test(s.why)) && dry.skipped.some((s) => /Walter Price: unreadable date of birth/.test(s.why)), `and names the bad rows (${JSON.stringify(dry.skipped)})`);
  const before = run('nothing was written', [C, 'stats']);
  assert(n(before.active_clients) === 19, 'still nineteen after the dry run');
  const imported = run('import for real', [C, 'import', 'pabau', `--clients=${clientsCsv}`, `--appointments=${apptsCsv}`]);
  assert(imported.created.filter((c) => c.what === 'past treatment').length === 2 && imported.created.some((c) => c.what === 'booking'), 'two past treatments and a booking came across');
  assert(imported.created.some((c) => c.what === 'rebook'), 'with the rebook clock');
  assert(imported.updated.some((u) => u.what === 'client' && u.name === 'Zara Ahmed'), 'Zara matched, not duplicated');
  assert(imported.skipped.some((s) => /Lip flip/.test(s.why)) && imported.skipped.some((s) => /Nobody Here/.test(s.why)), 'an unknown service and an unknown client are named');
  const again = run('import again (idempotent)', [C, 'import', 'pabau', `--clients=${clientsCsv}`, `--appointments=${apptsCsv}`]);
  assert(!again.created.length, `the second pass creates nothing (${JSON.stringify(again.created)})`);
  const nina = run('Nina arrives with no consent on file', [C, 'client', 'Nina']);
  assert(nina.consents.length === 0 && nina.client.marketing_opt_in === true && nina.records.length === 2, 'history and opt-in came across; consent is taken fresh');
  const importedDue = run('imported history does not owe records', [C, 'records-due']);
  assert(importedDue.every((r) => r.client !== 'Nina Patel'), 'the old record lives in the Pabau export');
  const importedCompliance = run('nor break the rules', [C, 'compliance']);
  assert(!importedCompliance.checks.filter((c) => !c.ok).some((c) => /Nina Patel/.test(c.found)), 'imported treatments are not judged as if given here');

  // ---- views, documents, export --------------------------------------------------------------------

  run('views render', ['view.mjs'], { json: false });
  for (const v of ['week', 'clinical', 'money']) assert(existsSync(path.join(scratch, 'views', `${v}.html`)), `${v}.html rendered`);
  run('documents render', ['docs.mjs'], { json: false });
  for (const d of ['invoice', 'consent', 'aftercare', 'treatment-record']) assert(readdirSync(path.join(scratch, 'docs-out', d)).length > 0, `${d} documents rendered`);
  const minorDoc = readdirSync(path.join(scratch, 'docs-out', 'consent')).find((f) => f.startsWith('con-202'));
  assert(minorDoc && /No procedure and no payment before/.test(readFileSync(path.join(scratch, 'docs-out', 'consent', minorDoc), 'utf8')), 'the under-18 consent states its cooling-off');

  const exported = run('export', [C, 'export', `--out=${path.join(scratch, 'out')}`]);
  assert(exported.written.length === 10, `ten files (${exported.written.length})`);
  for (const w of exported.written) {
    assert(existsSync(path.join(scratch, 'out', w.file)), `${w.file} exists`);
    assert(readFileSync(path.join(scratch, 'out', w.file), 'utf8').split('\n').length > 2, `${w.file} has rows`);
  }

  console.log(`\nPASS: ${step} steps.`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
