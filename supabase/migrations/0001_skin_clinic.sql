-- skin-clinic-for-claude-code: core schema.
-- An aesthetic and skin clinic's operating record the way Pabau sells it:
-- the injectors, prescribers and skin therapists and their hours, the client
-- book, the treatment menu, the appointment book, prescriber consultations
-- (scripts) for prescription-only injectables, written consents, the
-- treatment record with the product batch in every syringe, before and
-- after photos with the consent that covers them, complications, reviews
-- and rebooks, product stock by batch, skin packages, invoices and
-- payments.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
-- Money is in cents, AUD by default. GST and payroll stay in accounting,
-- deliberately.
--
-- Deliberately NOT here: payment processing, an online booking page, SMS
-- sending, the photos themselves (a record holds the file path, the image
-- stays on the clinic's secure storage), and ePrescribing. Reminders and
-- rebook messages draft to drafts/ and a person sends them.
--
-- The sharp edges are deliberate, and each one cites its source in
-- docs/compliance.md:
--   * a prescription-only injectable is never given without a current
--     script for that one client, written by a prescriber after an
--     in-person or video consultation; there is no column for an
--     asynchronous script (Ahpra, Guidelines for registered health
--     practitioners who perform non-surgical cosmetic procedures, 2025,
--     s3.2 and s3.3; Medical Board of Australia guidelines, 2023)
--   * botulinum toxin and dermal filler are never booked or given to a
--     client under 18 (s4.2)
--   * every cosmetic procedure has a written consent, with the financial
--     consent recorded and a copy given; a client under 18 waits at least
--     seven days after consenting, and no money is taken before then
--     (s4.5, s4.6, s5.3)
--   * every injectable record names the product and the batch it came
--     from, and an expired batch is never used (s6.1, s7.6; TGA Uniform
--     Recall Procedure for Therapeutic Goods)
--   * a finalised treatment record never changes: corrections are addenda
--   * no package, discount or free procedure on a cosmetic procedure
--     (s14.2, s14.4); skin packages for treatments outside the guidelines
--     are fine
--   * a photo is taken only with consent, and used in advertising only
--     with a separate advertising consent that has not been withdrawn
--     (s5.5 to s5.10)
--   * stock never goes below zero, and a payment never exceeds a balance
--   * nobody is double-booked, and nothing is booked outside a
--     practitioner's recorded working hours
--   * no deleting records: appointments cancel with a reason, clients
--     archive, the clinical record stays

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Settings ------------------------------------------------------------------------

create table if not exists settings (
  key         text primary key,
  value       text not null,
  note        text,
  updated_at  timestamptz not null default now()
);

insert into settings (key, value, note) values
  ('clinic_name',          'Your Clinic', 'Printed on documents and drafts'),
  ('currency',             'AUD',  'Money is stored in cents of this currency'),
  ('record_due_days',      '1',    'Days after a treatment before an unfinalised record is overdue'),
  ('consent_months',       '12',   'How long a signed consent covers repeat treatments of the same kind'),
  ('cooling_off_days',     '7',    'Days a client under 18 waits between consent and a cosmetic procedure (Ahpra 2025 s4.5)'),
  ('adult_age',            '18',   'Age under which toxin and filler are refused and the cooling-off applies'),
  ('script_warn_days',     '14',   'Days before a script runs out that it is raised'),
  ('consent_warn_days',    '30',   'Days before a consent runs out that it is raised'),
  ('batch_warn_days',      '45',   'Days before a batch expires that it is raised'),
  ('rebook_grace_days',    '14',   'Days past a rebook date before it is raised'),
  ('indemnity_warn_days',  '30',   'Days before a practitioner''s indemnity cover ends that it is raised'),
  ('debtor_days',          '14',   'Days an invoice can be overdue before it is chased'),
  ('package_warn_days',    '30',   'Days before a package expires with sessions left that it is raised')
on conflict (key) do nothing;

-- The team ------------------------------------------------------------------------

create table if not exists practitioners (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  role               text not null check (role in ('doctor', 'nurse_practitioner', 'nurse', 'dentist', 'dermal_therapist', 'other')),
  registration_no    text,             -- Ahpra MED / NMW / DEN number; null for an unregistered therapist
  prescriber         boolean not null default false,  -- may write scripts for prescription-only injectables
  injector           boolean not null default false,  -- may give injectables
  indemnity_expires  date,             -- professional indemnity cover ends
  days               text not null default 'mon,tue,wed,thu,fri',
  starts_at          time not null default '09:00',
  ends_at            time not null default '17:30',
  status             text not null default 'active' check (status in ('active', 'former')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
drop trigger if exists practitioners_updated on practitioners;
create trigger practitioners_updated before update on practitioners for each row execute function set_updated_at();

-- Clients -------------------------------------------------------------------------

create table if not exists clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  date_of_birth      date,
  phone              text,
  email              text,
  medical_flags      text,             -- allergies, medicines, pregnancy, conditions that change the plan
  photo_consent      text not null default 'none' check (photo_consent in ('none', 'clinical', 'advertising')),
  photo_consent_on   date,
  ad_consent_withdrawn_on date,        -- advertising use stops from this day
  marketing_opt_in   boolean,          -- null = never asked
  source             text,             -- how they found the clinic
  status             text not null default 'active' check (status in ('active', 'archived')),
  imported           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists clients_name on clients (lower(name));
drop trigger if exists clients_updated on clients;
create trigger clients_updated before update on clients for each row execute function set_updated_at();

create table if not exists client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- The menu: what goes in the book, what it needs, and when the client comes back.

create table if not exists treatments (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  kind                text not null check (kind in ('injectable', 'laser', 'skin', 'consult', 'other')),
  cosmetic_procedure  boolean not null default false,  -- covered by the Ahpra cosmetic guidelines
  needs_script        boolean not null default false,  -- a prescription-only medicine
  adult_only          boolean not null default false,  -- toxin and filler: never under 18
  product_kind        text check (product_kind in ('toxin', 'filler', 'booster', 'skincare', 'consumable')),
  consent_group       text,                            -- one consent covers every treatment in the group
  minutes             int not null default 30 check (minutes > 0),
  fee_cents           int not null default 0 check (fee_cents >= 0),
  review_days         int,             -- the clinical check after treatment (toxin: 14)
  rebook_weeks        int,             -- when the result wears off and they are due again
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
drop trigger if exists treatments_updated on treatments;
create trigger treatments_updated before update on treatments for each row execute function set_updated_at();

-- The appointment book --------------------------------------------------------------

create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,        -- APT-1001
  client_id        uuid not null references clients(id),
  practitioner_id  uuid not null references practitioners(id),
  treatment_id     uuid not null references treatments(id),
  on_date          date not null,
  starts_at        time not null,
  ends_at          time not null,
  status           text not null default 'booked'
                   check (status in ('booked', 'confirmed', 'completed', 'cancelled', 'dna')),
  notes            text,
  deposit_cents    int not null default 0 check (deposit_cents >= 0),
  deposit_paid_on  date,
  cancel_reason    text,
  imported         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_day on appointments (on_date, practitioner_id);
drop trigger if exists appointments_updated on appointments;
create trigger appointments_updated before update on appointments for each row execute function set_updated_at();

-- Scripts: the prescriber's consultation that makes an injectable lawful.
-- consult_mode has no 'async' value on purpose: a script by text, email or
-- online form is not acceptable practice (Ahpra 2025 s3.2).

create table if not exists scripts (
  id                  uuid primary key default gen_random_uuid(),
  ref                 text not null unique,     -- SCR-301
  client_id           uuid not null references clients(id),  -- one client per script: no batch prescribing (s3.3)
  prescriber_id       uuid not null references practitioners(id),
  consult_on          date not null,
  consult_mode        text not null check (consult_mode in ('in_person', 'video')),
  product_kind        text not null check (product_kind in ('toxin', 'filler', 'booster')),
  product             text not null,            -- as prescribed
  max_quantity        numeric(8,2) not null check (max_quantity > 0),
  unit                text not null default 'units',
  areas               text,
  treatments_allowed  int not null default 1 check (treatments_allowed > 0),
  valid_until         date not null,
  status              text not null default 'active' check (status in ('active', 'cancelled')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (valid_until >= consult_on)
);
drop trigger if exists scripts_updated on scripts;
create trigger scripts_updated before update on scripts for each row execute function set_updated_at();

-- Consents: written, procedural and financial, with a copy given (s5.3).

create table if not exists consents (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique,      -- CON-201
  client_id          uuid not null references clients(id),
  consent_group      text not null,
  practitioner_id    uuid references practitioners(id),
  signed_on          date not null,
  expires_on         date not null,
  financial_consent  boolean not null default false,
  copy_given         boolean not null default false,
  cooling_off_until  date,                      -- set when the client was under 18 at signing
  notes              text,
  status             text not null default 'active' check (status in ('active', 'withdrawn')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (expires_on > signed_on)
);
drop trigger if exists consents_updated on consents;
create trigger consents_updated before update on consents for each row execute function set_updated_at();

-- Products and batches ---------------------------------------------------------------

create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  brand         text not null,
  name          text not null,
  kind          text not null check (kind in ('toxin', 'filler', 'booster', 'skincare', 'consumable')),
  unit          text not null default 'each',   -- units, ml, each
  s4            boolean not null default false, -- prescription-only: never sold over the counter
  cost_cents    int not null default 0 check (cost_cents >= 0),   -- per unit
  retail_cents  int not null default 0 check (retail_cents >= 0), -- per unit, retail lines only
  reorder_at    numeric(8,2) not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists products_updated on products;
create trigger products_updated before update on products for each row execute function set_updated_at();

create table if not exists batches (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id),
  batch_no     text not null,
  expires_on   date not null,
  received_on  date not null default current_date,
  on_hand      numeric(8,2) not null default 0 check (on_hand >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (product_id, batch_no)
);
drop trigger if exists batches_updated on batches;
create trigger batches_updated before update on batches for each row execute function set_updated_at();

-- The treatment record ---------------------------------------------------------------

create table if not exists records (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,        -- TRX-501
  appointment_id   uuid unique references appointments(id),
  client_id        uuid not null references clients(id),
  practitioner_id  uuid not null references practitioners(id),
  treatment_id     uuid not null references treatments(id),
  script_id        uuid references scripts(id),
  consent_id       uuid references consents(id),
  on_date          date not null,
  areas            text,
  notes            text,
  aftercare_given  boolean not null default false,
  status           text not null default 'draft' check (status in ('draft', 'final')),
  finalised_at     timestamptz,
  imported         boolean not null default false,  -- past treatment carried across so rebooks are right
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists records_client on records (client_id, on_date);
drop trigger if exists records_updated on records;
create trigger records_updated before update on records for each row execute function set_updated_at();

-- A finalised record never changes. The database enforces it too.
create or replace function records_lock_final() returns trigger
language plpgsql as $$
begin
  if old.status = 'final' then
    raise exception 'Treatment record % is finalised and cannot be edited. Add an addendum.', old.ref;
  end if;
  return new;
end
$$;
drop trigger if exists records_lock on records;
create trigger records_lock before update on records for each row execute function records_lock_final();

create table if not exists record_addenda (
  id          uuid primary key default gen_random_uuid(),
  record_id   uuid not null references records(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- What went into the client, batch by batch: the recall trail.
create table if not exists product_usage (
  id          uuid primary key default gen_random_uuid(),
  record_id   uuid not null references records(id),
  batch_id    uuid not null references batches(id),
  quantity    numeric(8,2) not null check (quantity > 0),
  created_at  timestamptz not null default now()
);

create table if not exists photos (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id),
  record_id    uuid references records(id),
  taken_on     date not null default current_date,
  kind         text not null default 'before' check (kind in ('before', 'after', 'progress')),
  file_path    text not null,        -- on the clinic's secure storage, never a personal phone (s5.6)
  advertising  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists photos_updated on photos;
create trigger photos_updated before update on photos for each row execute function set_updated_at();

-- Complications: reported, acted on, escalated, resolved (s7.4).
create table if not exists complications (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,       -- CMP-801
  client_id     uuid not null references clients(id),
  record_id     uuid references records(id),
  reported_on   date not null default current_date,
  severity      text not null check (severity in ('minor', 'moderate', 'serious')),
  description   text not null,
  action        text,
  escalated_to  text,
  status        text not null default 'open' check (status in ('open', 'resolved')),
  resolved_on   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists complications_updated on complications;
create trigger complications_updated before update on complications for each row execute function set_updated_at();

-- Reviews and rebooks.
create table if not exists followups (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id),
  record_id         uuid references records(id),
  kind              text not null check (kind in ('review', 'rebook', 'complication')),
  due_on            date not null,
  status            text not null default 'open' check (status in ('open', 'booked', 'done', 'lapsed')),
  contacts          int not null default 0,
  last_contacted_on date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists followups_updated on followups;
create trigger followups_updated before update on followups for each row execute function set_updated_at();

-- Invoices and payments -------------------------------------------------------------

create table if not exists invoices (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null unique,          -- INV-2001
  client_id   uuid not null references clients(id),
  issued_on   date not null default current_date,
  due_on      date not null default current_date,
  status      text not null default 'sent' check (status in ('sent', 'paid', 'void')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists invoices_updated on invoices;
create trigger invoices_updated before update on invoices for each row execute function set_updated_at();

create table if not exists invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id),
  description   text not null,
  qty           numeric(8,2) not null default 1 check (qty > 0),
  unit_cents    int not null check (unit_cents >= 0),
  treatment_id  uuid references treatments(id),
  product_id    uuid references products(id),
  package_id    uuid,
  created_at    timestamptz not null default now()
);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id),
  amount_cents  int not null check (amount_cents > 0),
  method        text not null default 'card',
  paid_on       date not null default current_date,
  created_at    timestamptz not null default now()
);

-- Packages: courses of skin treatments paid up front. Never on a cosmetic
-- procedure (s14.2, s14.4); the CLI refuses one.
create table if not exists packages (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,     -- PKG-601
  client_id       uuid not null references clients(id),
  treatment_id    uuid not null references treatments(id),
  sessions_total  int not null check (sessions_total > 0),
  sessions_used   int not null default 0 check (sessions_used >= 0),
  price_cents     int not null check (price_cents >= 0),
  sold_on         date not null default current_date,
  expires_on      date not null,
  status          text not null default 'active' check (status in ('active', 'used', 'expired', 'refunded')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (sessions_used <= sessions_total)
);
drop trigger if exists packages_updated on packages;
create trigger packages_updated before update on packages for each row execute function set_updated_at();

-- ===================================================================================
-- Views: what the commands and the dashboards read.

create or replace view v_invoices as
select i.id, i.ref, i.client_id, c.name as client, i.issued_on, i.due_on, i.status,
       coalesce(t.total_cents, 0)::int as total_cents,
       coalesce(pa.paid_cents, 0)::int as paid_cents,
       (coalesce(t.total_cents, 0) - coalesce(pa.paid_cents, 0))::int as balance_cents,
       greatest(0, current_date - i.due_on) as days_overdue
from invoices i
join clients c on c.id = i.client_id
left join (select invoice_id, round(sum(qty * unit_cents)) as total_cents from invoice_items group by invoice_id) t on t.invoice_id = i.id
left join (select invoice_id, sum(amount_cents) as paid_cents from payments group by invoice_id) pa on pa.invoice_id = i.id;

create or replace view v_appointments as
select a.id, a.ref, a.client_id, c.name as client, c.phone, c.date_of_birth,
       a.practitioner_id, p.name as practitioner, p.role as practitioner_role,
       t.id as treatment_id, t.code as treatment_code, t.name as treatment, t.kind as treatment_kind,
       t.cosmetic_procedure, t.needs_script, t.adult_only, t.product_kind, t.consent_group, t.fee_cents,
       a.on_date, a.starts_at, a.ends_at, a.status, a.notes, a.deposit_cents, a.deposit_paid_on,
       a.cancel_reason, a.imported,
       case when c.date_of_birth is null then null
            else extract(year from age(a.on_date, c.date_of_birth))::int end as age_on_day
from appointments a
join clients c on c.id = a.client_id
join practitioners p on p.id = a.practitioner_id
join treatments t on t.id = a.treatment_id;

create or replace view v_scripts as
select s.id, s.ref, s.client_id, c.name as client, s.prescriber_id, p.name as prescriber, p.prescriber as is_prescriber,
       s.consult_on, s.consult_mode, s.product_kind, s.product, s.max_quantity, s.unit, s.areas,
       s.treatments_allowed, coalesce(u.used, 0)::int as treatments_used,
       s.valid_until, s.status, (s.valid_until - current_date) as days_left,
       (s.status = 'active' and s.valid_until >= current_date and coalesce(u.used, 0) < s.treatments_allowed) as current
from scripts s
join clients c on c.id = s.client_id
join practitioners p on p.id = s.prescriber_id
left join (select script_id, count(*) as used from records where script_id is not null group by script_id) u on u.script_id = s.id;

create or replace view v_consents as
select k.id, k.ref, k.client_id, c.name as client, k.consent_group, k.signed_on, k.expires_on,
       k.financial_consent, k.copy_given, k.cooling_off_until, k.status, k.notes,
       p.name as taken_by,
       (k.expires_on - current_date) as days_left,
       (k.status = 'active' and k.expires_on >= current_date and k.financial_consent and k.copy_given) as current
from consents k
join clients c on c.id = k.client_id
left join practitioners p on p.id = k.practitioner_id;

create or replace view v_batches as
select b.id, b.batch_no, b.product_id, pr.sku, pr.brand, pr.name as product, pr.kind, pr.unit, pr.s4,
       b.expires_on, b.received_on, b.on_hand, (b.expires_on - current_date) as days_to_expiry,
       b.expires_on < current_date as expired,
       round(b.on_hand * pr.cost_cents)::int as value_cents
from batches b join products pr on pr.id = b.product_id;

create or replace view v_stock as
select pr.id, pr.sku, pr.brand, pr.name, pr.kind, pr.unit, pr.s4, pr.cost_cents, pr.retail_cents, pr.reorder_at, pr.active,
       coalesce(sum(b.on_hand) filter (where b.expires_on >= current_date), 0) as usable,
       coalesce(sum(b.on_hand) filter (where b.expires_on < current_date), 0) as expired_on_hand,
       min(b.expires_on) filter (where b.on_hand > 0 and b.expires_on >= current_date) as next_expiry,
       coalesce(round(sum(b.on_hand * pr.cost_cents)), 0)::int as value_cents,
       coalesce(sum(b.on_hand) filter (where b.expires_on >= current_date), 0) <= pr.reorder_at as low
from products pr left join batches b on b.product_id = pr.id
group by pr.id;

create or replace view v_records as
select r.id, r.ref, r.appointment_id, r.client_id, c.name as client, r.practitioner_id, p.name as practitioner,
       t.code as treatment_code, t.name as treatment, t.kind as treatment_kind, t.cosmetic_procedure, t.needs_script,
       r.on_date, r.areas, r.notes, r.aftercare_given, r.status, r.imported,
       s.ref as script_ref, k.ref as consent_ref,
       (select string_agg(pr.brand || ' ' || pr.name || ' ' || u.quantity || ' ' || pr.unit || ' batch ' || b.batch_no, '; ')
          from product_usage u join batches b on b.id = u.batch_id join products pr on pr.id = b.product_id
         where u.record_id = r.id) as products_used
from records r
join clients c on c.id = r.client_id
join practitioners p on p.id = r.practitioner_id
join treatments t on t.id = r.treatment_id
left join scripts s on s.id = r.script_id
left join consents k on k.id = r.consent_id;

-- Completed treatments whose record is missing or still in draft.
create or replace view v_records_due as
select a.id as appointment_id, a.ref, a.client_id, a.client, a.practitioner, a.treatment, a.on_date,
       (current_date - a.on_date) as days_since,
       r.ref as record_ref,
       case when r.id is null then 'missing' else r.status end as record_state
from v_appointments a
left join records r on r.appointment_id = a.id
where a.status = 'completed' and a.treatment_kind <> 'consult' and not a.imported
  and (r.id is null or r.status <> 'final');

create or replace view v_clients as
with last_tx as (
  select distinct on (client_id) client_id, on_date as last_treatment_on, t.name as last_treatment
  from records r join treatments t on t.id = r.treatment_id order by client_id, on_date desc
),
next_appt as (
  select client_id, min(on_date) as next_appt_on
  from appointments where status in ('booked', 'confirmed') and on_date >= current_date group by client_id
),
spend as (
  select i.client_id, round(sum(ii.qty * ii.unit_cents))::int as spend_cents_12m
  from invoices i join invoice_items ii on ii.invoice_id = i.id
  where i.status <> 'void' and i.issued_on > current_date - 365
  group by i.client_id
),
bal as (
  select client_id, sum(balance_cents)::int as balance_cents from v_invoices where status = 'sent' group by client_id
)
select c.id as client_id, c.name, c.date_of_birth, c.phone, c.email, c.medical_flags,
       c.photo_consent, c.ad_consent_withdrawn_on, c.marketing_opt_in, c.source, c.status, c.imported,
       case when c.date_of_birth is null then null
            else extract(year from age(current_date, c.date_of_birth))::int end as age,
       lt.last_treatment_on, lt.last_treatment, na.next_appt_on,
       coalesce(s.spend_cents_12m, 0) as spend_cents_12m,
       coalesce(b.balance_cents, 0) as balance_cents
from clients c
left join last_tx lt on lt.client_id = c.id
left join next_appt na on na.client_id = c.id
left join spend s on s.client_id = c.id
left join bal b on b.client_id = c.id;

create or replace view v_followups as
select f.id, f.client_id, c.name as client, c.phone, c.email, c.marketing_opt_in, f.kind, f.due_on,
       f.status, f.contacts, f.last_contacted_on, (current_date - f.due_on) as days_overdue,
       vc.next_appt_on, r.ref as record_ref, t.name as treatment
from followups f
join clients c on c.id = f.client_id
join v_clients vc on vc.client_id = c.id
left join records r on r.id = f.record_id
left join treatments t on t.id = r.treatment_id
where f.status = 'open' and c.status = 'active';

create or replace view v_complications as
select m.id, m.ref, m.client_id, c.name as client, c.phone, m.reported_on, m.severity, m.description,
       m.action, m.escalated_to, m.status, m.resolved_on, r.ref as record_ref, t.name as treatment,
       p.name as practitioner, (current_date - m.reported_on) as days_open,
       exists (select 1 from appointments a where a.client_id = m.client_id and a.status in ('booked', 'confirmed') and a.on_date >= current_date) as follow_up_booked
from complications m
join clients c on c.id = m.client_id
left join records r on r.id = m.record_id
left join treatments t on t.id = r.treatment_id
left join practitioners p on p.id = r.practitioner_id;

create or replace view v_packages as
select k.id, k.ref, k.client_id, c.name as client, t.code as treatment_code, t.name as treatment, t.cosmetic_procedure,
       k.sessions_total, k.sessions_used, (k.sessions_total - k.sessions_used) as sessions_left,
       k.price_cents, k.sold_on, k.expires_on, k.status, (k.expires_on - current_date) as days_left,
       round(k.price_cents::numeric * (k.sessions_total - k.sessions_used) / k.sessions_total)::int as unused_value_cents
from packages k
join clients c on c.id = k.client_id
join treatments t on t.id = k.treatment_id;

create or replace view v_takings as
select i.issued_on as on_date,
       case when ii.package_id is not null then 'packages'
            when ii.treatment_id is not null then coalesce(t.kind, 'treatments')
            when ii.product_id is not null then 'retail'
            else 'other' end as line,
       round(sum(ii.qty * ii.unit_cents))::int as takings_cents
from invoices i join invoice_items ii on ii.invoice_id = i.id
left join treatments t on t.id = ii.treatment_id
where i.status <> 'void'
group by i.issued_on, 2;

-- Each injector's clients and whether they came back for the next one:
-- the retention number every clinic owner watches.
create or replace view v_retention as
select r.id as record_id, r.ref, r.on_date, p.name as practitioner, r.client_id, c.name as client, c.phone,
       t.name as treatment, t.rebook_weeks,
       (r.on_date + (t.rebook_weeks * 7))::date as due_back_on,
       exists (select 1 from records r2 where r2.client_id = r.client_id and r2.treatment_id = r.treatment_id
                 and r2.on_date > r.on_date) or
       exists (select 1 from appointments a where a.client_id = r.client_id and a.treatment_id = r.treatment_id
                 and a.status in ('booked', 'confirmed') and a.on_date > r.on_date) as came_back
from records r
join practitioners p on p.id = r.practitioner_id
join clients c on c.id = r.client_id
join treatments t on t.id = r.treatment_id
where t.rebook_weeks is not null;
