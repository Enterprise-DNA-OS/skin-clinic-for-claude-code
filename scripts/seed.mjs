#!/usr/bin/env node
// Loads supabase/seed.sql: Harbour Lane Skin Clinic, a fictional Wollongong
// clinic with a prescribing doctor, a nurse injector and a dermal therapist,
// nineteen clients, scripts, consents, the treatment record with the batch
// in every syringe, stock by batch, packages and a booked week ahead. Every
// row has a derived id and inserts with ON CONFLICT DO NOTHING, so
// re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from practitioners)  as practitioners,
           (select count(*) from clients)        as clients,
           (select count(*) from treatments)     as treatments,
           (select count(*) from appointments)   as appointments,
           (select count(*) from scripts)        as scripts,
           (select count(*) from consents)       as consents,
           (select count(*) from records)        as records,
           (select count(*) from product_usage)  as product_usage,
           (select count(*) from batches)        as batches,
           (select count(*) from photos)         as photos,
           (select count(*) from complications)  as complications,
           (select count(*) from followups)      as followups,
           (select count(*) from packages)       as packages,
           (select count(*) from invoices)       as invoices,
           (select count(*) from payments)       as payments
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const db = await getDb();
  try {
    const counts = await seed(db);
    console.log('seeded:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  } finally {
    await db.close();
  }
}
