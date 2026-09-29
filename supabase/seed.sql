-- Demo data for skin-clinic-for-claude-code.
-- Harbour Lane Skin Clinic, a fictional aesthetic and skin clinic in
-- Wollongong, New South Wales: a doctor who prescribes, a nurse injector and
-- a dermal therapist, nineteen clients, a treatment menu from toxin to
-- peels, scripts and consents, the treatment record with the batch in every
-- syringe, product stock by batch, packages, and a booked week ahead.
--
-- Deliberately messy, so the attention list has something to say:
--   Zara Ahmed is booked tomorrow for toxin and her only script was used
--     and has run out: the treatment cannot go ahead without a new
--     prescriber consultation
--   Chloe Bennett is 17 and booked for lip filler in five days
--   Emily Ross is 17, signed her laser consent yesterday, is booked in
--     three days (inside the seven-day cooling-off) and has already paid
--     a $200 deposit
--   Mia Kowalski reported a firm, tender lump in her cheek three days after
--     filler, the complication is open and nothing is booked to see her
--   Olivia Grant was treated two days ago and there is NO record; Hannah
--     Price's lip filler record from four days ago is still in draft
--   Priya Sharma's two-week review is six days overdue and Grace Liu's
--     falls due in two days
--   Ruby Walsh withdrew her advertising consent five days ago and her
--     before-and-after photo is still marked for advertising
--   Lucy Harper holds a three-session toxin package sold last year, which
--     the guidelines no longer allow; Natalie Brooks has four peels left on
--     a package that expires in twenty days
--   Mia's consent has no record of a copy given
--   a toxin batch expired ten days ago with 20 units still on the shelf,
--     a lip filler batch expires in thirty days, toxin and sunscreen are
--     under their reorder points
--   Isabella Nguyen is booked in twenty days and both her toxin consent
--     and her script run out before then
--   Sophie Carter, Kate Delaney and Amelia Stone are past their rebook
--     dates: Sophie said yes to messages, Kate was never asked, Amelia
--     said no
--   Jess Taylor's indemnity cover ends in twenty days
--   Holly Evans owes $299 from a month ago
--
-- Dates are relative to current_date so the demo is coherent whatever day
-- you run it. Ids derive from names with seed_uuid, and every insert is
-- ON CONFLICT DO NOTHING, so running it twice changes nothing.
--
-- Practitioners, clients, fees, products, batch numbers and events are DEMO
-- VALUES for a fictional business. No real person, product or clinic is
-- depicted.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

update settings set value = 'Harbour Lane Skin Clinic' where key = 'clinic_name';

-- The team --------------------------------------------------------------------------------

insert into practitioners (id, name, role, registration_no, prescriber, injector, indemnity_expires, days, starts_at, ends_at) values
  (seed_uuid('pr:mei'),  'Dr Mei Chen', 'doctor',           'MED0001234567', true,  true,  current_date + 210, 'mon,wed,fri',                 '09:00', '17:00'),
  (seed_uuid('pr:jess'), 'Jess Taylor', 'nurse',            'NMW0001987654', false, true,  current_date + 20,  'tue,wed,thu,fri,sat',         '09:00', '18:00'),
  (seed_uuid('pr:ava'),  'Ava Morris',  'dermal_therapist', null,            false, false, null,               'mon,tue,wed,thu,fri,sat,sun', '09:00', '17:30')
on conflict (id) do nothing;

-- The menu (demo fees; load your own) ----------------------------------------------------------

insert into treatments (id, code, name, kind, cosmetic_procedure, needs_script, adult_only, product_kind, consent_group, minutes, fee_cents, review_days, rebook_weeks) values
  (seed_uuid('tx:cons'), 'CONS', 'Cosmetic consultation',              'consult',    false, false, false, null,        null,     30,  5000, null, null),
  (seed_uuid('tx:rev'),  'REV',  'Two-week review',                    'consult',    false, false, false, null,        null,     15,     0, null, null),
  (seed_uuid('tx:tox'),  'TOX',  'Toxin, upper face (three areas)',    'injectable', true,  true,  true,  'toxin',     'toxin',  30, 45000,   14,   12),
  (seed_uuid('tx:toxm'), 'TOXM', 'Toxin, masseter',                    'injectable', true,  true,  true,  'toxin',     'toxin',  30, 55000,   14,   16),
  (seed_uuid('tx:fil'),  'FIL',  'Dermal filler, lips (1 ml)',         'injectable', true,  true,  true,  'filler',    'filler', 45, 65000,   14,   26),
  (seed_uuid('tx:filc'), 'FILC', 'Dermal filler, cheeks (2 ml)',       'injectable', true,  true,  true,  'filler',    'filler', 60, 120000,  14,   52),
  (seed_uuid('tx:sb'),   'SB',   'Skin booster (2 ml)',                'injectable', true,  false, false, 'booster',   'booster', 30, 55000, null,   26),
  (seed_uuid('tx:lsr'),  'LSR',  'Fractional laser resurfacing',       'laser',      true,  false, false, null,        'laser',  60, 60000, null, null),
  (seed_uuid('tx:peel'), 'PEEL', 'Chemical peel',                      'skin',       false, false, false, 'consumable','peel',   45, 18000, null,    4),
  (seed_uuid('tx:fac'),  'FAC',  'Hydrating facial',                   'skin',       false, false, false, null,        null,     60, 19000, null,    4)
on conflict (id) do nothing;

-- Clients --------------------------------------------------------------------------------

insert into clients (id, name, date_of_birth, phone, email, medical_flags, photo_consent, photo_consent_on, ad_consent_withdrawn_on, marketing_opt_in, source) values
  (seed_uuid('cl:zara'),     'Zara Ahmed',      (current_date - interval '34 years 2 months')::date, '0412 555 101', 'zara.a@example.com',     null,                                   'clinical',    current_date - 92,  null,              true,  'Instagram'),
  (seed_uuid('cl:chloe'),    'Chloe Bennett',   (current_date - interval '17 years 3 months')::date, '0412 555 102', 'chloe.b@example.com',    null,                                   'none',        null,               null,              null,  'Friend'),
  (seed_uuid('cl:emily'),    'Emily Ross',      (current_date - interval '17 years 6 months')::date, '0412 555 103', 'emily.r@example.com',    'Acne scarring; no isotretinoin in the last 12 months (confirmed by parent)', 'clinical', current_date - 1, null, null, 'Google'),
  (seed_uuid('cl:hannah'),   'Hannah Price',    (current_date - interval '41 years')::date,          '0412 555 104', 'hannah.p@example.com',   'Cold sores: antiviral before lip work', 'clinical',    current_date - 6,   null,              true,  'Walk-in'),
  (seed_uuid('cl:olivia'),   'Olivia Grant',    (current_date - interval '29 years 4 months')::date, '0412 555 105', 'olivia.g@example.com',   null,                                   'clinical',    current_date - 5,   null,              true,  'Instagram'),
  (seed_uuid('cl:grace'),    'Grace Liu',       (current_date - interval '38 years')::date,          '0412 555 106', 'grace.l@example.com',    null,                                   'clinical',    current_date - 13,  null,              true,  'Referral'),
  (seed_uuid('cl:priya'),    'Priya Sharma',    (current_date - interval '36 years 8 months')::date, '0412 555 107', 'priya.s@example.com',    null,                                   'clinical',    current_date - 21,  null,              false, 'Google'),
  (seed_uuid('cl:mia'),      'Mia Kowalski',    (current_date - interval '45 years')::date,          '0412 555 108', 'mia.k@example.com',      'Blood thinner (low-dose aspirin)',     'clinical',    current_date - 9,   null,              true,  'Referral'),
  (seed_uuid('cl:isabella'), 'Isabella Nguyen', (current_date - interval '52 years')::date,          '0412 555 109', 'isabella.n@example.com', null,                                   'clinical',    current_date - 355, null,              true,  'Google'),
  (seed_uuid('cl:ruby'),     'Ruby Walsh',      (current_date - interval '31 years')::date,          '0412 555 110', 'ruby.w@example.com',     null,                                   'advertising', current_date - 80,  current_date - 5,  true,  'Instagram'),
  (seed_uuid('cl:lucy'),     'Lucy Harper',     (current_date - interval '36 years')::date,          '0412 555 111', 'lucy.h@example.com',     null,                                   'clinical',    current_date - 240, null,              true,  'Walk-in'),
  (seed_uuid('cl:natalie'),  'Natalie Brooks',  (current_date - interval '44 years')::date,          '0412 555 112', 'natalie.b@example.com',  null,                                   'none',        null,               null,              true,  'Google'),
  (seed_uuid('cl:sophie'),   'Sophie Carter',   (current_date - interval '39 years')::date,          '0412 555 113', 'sophie.c@example.com',   null,                                   'clinical',    current_date - 112, null,              true,  'Instagram'),
  (seed_uuid('cl:kate'),     'Kate Delaney',    (current_date - interval '47 years')::date,          '0412 555 114', 'kate.d@example.com',     null,                                   'clinical',    current_date - 126, null,              null,  'Referral'),
  (seed_uuid('cl:amelia'),   'Amelia Stone',    (current_date - interval '50 years')::date,          '0412 555 115', 'amelia.s@example.com',   null,                                   'clinical',    current_date - 425, null,              false, 'Google'),
  (seed_uuid('cl:georgia'),  'Georgia Reid',    (current_date - interval '33 years')::date,          '0412 555 116', 'georgia.r@example.com',  null,                                   'clinical',    current_date - 40,  null,              true,  'Instagram'),
  (seed_uuid('cl:jack'),     'Jack Morgan',     (current_date - interval '42 years')::date,          '0412 555 117', 'jack.m@example.com',     'Grinds teeth at night',                'clinical',    current_date - 3,   null,              null,  'Referral'),
  (seed_uuid('cl:holly'),    'Holly Evans',     (current_date - interval '60 years')::date,          '0412 555 118', 'holly.e@example.com',    null,                                   'none',        null,               null,              true,  'Walk-in'),
  (seed_uuid('cl:ella'),     'Ella Martin',     (current_date - interval '27 years')::date,          '0412 555 119', 'ella.m@example.com',     null,                                   'none',        null,               null,              true,  'Instagram')
on conflict (id) do nothing;

insert into client_notes (id, client_id, body, created_at) values
  (seed_uuid('note:mia'),   seed_uuid('cl:mia'),   'Rang about the lump in her left cheek. Warm compress advised, asked her to send a photo. Needs to be seen.', now() - interval '3 days'),
  (seed_uuid('note:chloe'), seed_uuid('cl:chloe'), 'Booked online for lip filler. Mother rang to ask about prices.', now() - interval '4 days'),
  (seed_uuid('note:ruby'),  seed_uuid('cl:ruby'),  'Emailed to say she no longer wants her photos on our social media.', now() - interval '5 days')
on conflict (id) do nothing;

-- Products and batches -------------------------------------------------------------------

insert into products (id, sku, brand, name, kind, unit, s4, cost_cents, retail_cents, reorder_at) values
  (seed_uuid('p:toxa'),  'TOXA-100', 'Demo Pharma',      'Botulinum toxin type A, 100 unit vial', 'toxin',      'units', true,   400,    0, 200),
  (seed_uuid('p:hafl'),  'HAF-LIP',  'Demo Aesthetics',  'Hyaluronic acid filler, lips',          'filler',     'ml',    true, 12000,    0,   4),
  (seed_uuid('p:hafv'),  'HAF-VOL',  'Demo Aesthetics',  'Hyaluronic acid filler, volume',        'filler',     'ml',    true, 14000,    0,   4),
  (seed_uuid('p:sbh'),   'SB-HA2',   'Demo Aesthetics',  'Skin booster, hyaluronic acid',         'booster',    'ml',    false, 10000,   0,   4),
  (seed_uuid('p:spf'),   'SPF50',    'Clinic Range',     'Mineral sunscreen SPF 50',              'skincare',   'each',  false, 1800, 4900,   6),
  (seed_uuid('p:serc'),  'SER-C',    'Clinic Range',     'Vitamin C serum 30 ml',                 'skincare',   'each',  false, 3200, 8900,   3),
  (seed_uuid('p:peel'),  'PEEL-L',   'Clinic Range',     'Lactic peel solution (one treatment)',  'consumable', 'each',  false,  900,    0,   5)
on conflict (id) do nothing;

insert into batches (id, product_id, batch_no, expires_on, received_on, on_hand) values
  (seed_uuid('b:ta2311'), seed_uuid('p:toxa'), 'TA2311', current_date - 10,  current_date - 200, 20),
  (seed_uuid('b:ta2406'), seed_uuid('p:toxa'), 'TA2406', current_date + 120, current_date - 70,  150),
  (seed_uuid('b:lf2402'), seed_uuid('p:hafl'), 'LF2402', current_date + 30,  current_date - 150, 3),
  (seed_uuid('b:lf2409'), seed_uuid('p:hafl'), 'LF2409', current_date + 400, current_date - 20,  6),
  (seed_uuid('b:vf2311'), seed_uuid('p:hafv'), 'VF2311', current_date - 100, current_date - 500, 0),
  (seed_uuid('b:vf2405'), seed_uuid('p:hafv'), 'VF2405', current_date + 300, current_date - 60,  8),
  (seed_uuid('b:sb2404'), seed_uuid('p:sbh'),  'SB2404', current_date + 200, current_date - 90,  6),
  (seed_uuid('b:spf250'), seed_uuid('p:spf'),  'SPF250', current_date + 500, current_date - 40,  4),
  (seed_uuid('b:vc2401'), seed_uuid('p:serc'), 'VC2401', current_date + 300, current_date - 40,  9),
  (seed_uuid('b:pl2403'), seed_uuid('p:peel'), 'PL2403', current_date + 200, current_date - 40,  12)
on conflict (id) do nothing;

-- Scripts: every one after a video or in-person consultation with Dr Chen -----------------------

insert into scripts (id, ref, client_id, prescriber_id, consult_on, consult_mode, product_kind, product, max_quantity, unit, areas, treatments_allowed, valid_until) values
  (seed_uuid('s:301'), 'SCR-301', seed_uuid('cl:zara'),     seed_uuid('pr:mei'), current_date - 92,  'video',     'toxin',  'Botulinum toxin type A', 40, 'units', 'Frown, forehead, crow''s feet', 1, current_date - 2),
  (seed_uuid('s:302'), 'SCR-302', seed_uuid('cl:olivia'),   seed_uuid('pr:mei'), current_date - 5,   'video',     'toxin',  'Botulinum toxin type A', 30, 'units', 'Frown, forehead',               1, current_date + 55),
  (seed_uuid('s:303'), 'SCR-303', seed_uuid('cl:hannah'),   seed_uuid('pr:mei'), current_date - 6,   'in_person', 'filler', 'Hyaluronic acid filler', 1,  'ml',    'Lips',                          1, current_date + 54),
  (seed_uuid('s:304'), 'SCR-304', seed_uuid('cl:grace'),    seed_uuid('pr:mei'), current_date - 13,  'video',     'toxin',  'Botulinum toxin type A', 50, 'units', 'Frown, forehead, crow''s feet', 1, current_date + 47),
  (seed_uuid('s:305'), 'SCR-305', seed_uuid('cl:priya'),    seed_uuid('pr:mei'), current_date - 21,  'video',     'toxin',  'Botulinum toxin type A', 40, 'units', 'Frown, crow''s feet',           1, current_date + 39),
  (seed_uuid('s:306'), 'SCR-306', seed_uuid('cl:mia'),      seed_uuid('pr:mei'), current_date - 9,   'in_person', 'filler', 'Hyaluronic acid filler', 2,  'ml',    'Cheeks',                        1, current_date + 51),
  (seed_uuid('s:307'), 'SCR-307', seed_uuid('cl:isabella'), seed_uuid('pr:mei'), current_date - 10,  'video',     'toxin',  'Botulinum toxin type A', 40, 'units', 'Frown, forehead',               1, current_date + 12),
  (seed_uuid('s:308'), 'SCR-308', seed_uuid('cl:georgia'),  seed_uuid('pr:mei'), current_date - 41,  'video',     'toxin',  'Botulinum toxin type A', 40, 'units', 'Frown, forehead',               1, current_date + 20),
  (seed_uuid('s:309'), 'SCR-309', seed_uuid('cl:jack'),     seed_uuid('pr:mei'), current_date - 4,   'in_person', 'toxin',  'Botulinum toxin type A', 50, 'units', 'Masseters',                     1, current_date + 56),
  (seed_uuid('s:310'), 'SCR-310', seed_uuid('cl:sophie'),   seed_uuid('pr:mei'), current_date - 113, 'video',     'toxin',  'Botulinum toxin type A', 40, 'units', 'Frown, forehead',               1, current_date - 53),
  (seed_uuid('s:311'), 'SCR-311', seed_uuid('cl:kate'),     seed_uuid('pr:mei'), current_date - 127, 'video',     'toxin',  'Botulinum toxin type A', 40, 'units', 'Frown, crow''s feet',           1, current_date - 67),
  (seed_uuid('s:312'), 'SCR-312', seed_uuid('cl:amelia'),   seed_uuid('pr:mei'), current_date - 426, 'in_person', 'filler', 'Hyaluronic acid filler', 2,  'ml',    'Cheeks',                        1, current_date - 366),
  (seed_uuid('s:313'), 'SCR-313', seed_uuid('cl:lucy'),     seed_uuid('pr:mei'), current_date - 61,  'video',     'toxin',  'Botulinum toxin type A', 40, 'units', 'Frown, forehead',               1, current_date - 1),
  (seed_uuid('s:314'), 'SCR-314', seed_uuid('cl:ruby'),     seed_uuid('pr:mei'), current_date - 81,  'in_person', 'filler', 'Hyaluronic acid filler', 1,  'ml',    'Lips',                          1, current_date - 21)
on conflict (id) do nothing;

-- Consents ---------------------------------------------------------------------------------

insert into consents (id, ref, client_id, consent_group, practitioner_id, signed_on, expires_on, financial_consent, copy_given, cooling_off_until) values
  (seed_uuid('c:zara'),     'CON-201', seed_uuid('cl:zara'),     'toxin',   seed_uuid('pr:jess'), current_date - 92,  current_date + 273, true, true,  null),
  (seed_uuid('c:emily'),    'CON-202', seed_uuid('cl:emily'),    'laser',   seed_uuid('pr:jess'), current_date - 1,   current_date + 364, true, true,  current_date + 6),
  (seed_uuid('c:hannah'),   'CON-203', seed_uuid('cl:hannah'),   'filler',  seed_uuid('pr:jess'), current_date - 6,   current_date + 359, true, true,  null),
  (seed_uuid('c:olivia'),   'CON-204', seed_uuid('cl:olivia'),   'toxin',   seed_uuid('pr:jess'), current_date - 5,   current_date + 360, true, true,  null),
  (seed_uuid('c:grace'),    'CON-205', seed_uuid('cl:grace'),    'toxin',   seed_uuid('pr:jess'), current_date - 13,  current_date + 352, true, true,  null),
  (seed_uuid('c:priya'),    'CON-206', seed_uuid('cl:priya'),    'toxin',   seed_uuid('pr:jess'), current_date - 21,  current_date + 344, true, true,  null),
  (seed_uuid('c:mia'),      'CON-207', seed_uuid('cl:mia'),      'filler',  seed_uuid('pr:mei'),  current_date - 9,   current_date + 356, true, false, null),
  (seed_uuid('c:isabella'), 'CON-208', seed_uuid('cl:isabella'), 'toxin',   seed_uuid('pr:jess'), current_date - 355, current_date + 10,  true, true,  null),
  (seed_uuid('c:ruby'),     'CON-209', seed_uuid('cl:ruby'),     'filler',  seed_uuid('pr:jess'), current_date - 81,  current_date + 284, true, true,  null),
  (seed_uuid('c:lucy'),     'CON-210', seed_uuid('cl:lucy'),     'toxin',   seed_uuid('pr:jess'), current_date - 240, current_date + 125, true, true,  null),
  (seed_uuid('c:natalie'),  'CON-211', seed_uuid('cl:natalie'),  'peel',    seed_uuid('pr:ava'),  current_date - 60,  current_date + 305, true, true,  null),
  (seed_uuid('c:sophie'),   'CON-212', seed_uuid('cl:sophie'),   'toxin',   seed_uuid('pr:jess'), current_date - 112, current_date + 253, true, true,  null),
  (seed_uuid('c:kate'),     'CON-213', seed_uuid('cl:kate'),     'toxin',   seed_uuid('pr:jess'), current_date - 126, current_date + 239, true, true,  null),
  (seed_uuid('c:amelia'),   'CON-214', seed_uuid('cl:amelia'),   'filler',  seed_uuid('pr:mei'),  current_date - 425, current_date - 60,  true, true,  null),
  (seed_uuid('c:georgia'),  'CON-215', seed_uuid('cl:georgia'),  'toxin',   seed_uuid('pr:jess'), current_date - 40,  current_date + 325, true, true,  null),
  (seed_uuid('c:jack'),     'CON-216', seed_uuid('cl:jack'),     'toxin',   seed_uuid('pr:jess'), current_date - 3,   current_date + 362, true, true,  null),
  (seed_uuid('c:holly'),    'CON-217', seed_uuid('cl:holly'),    'booster', seed_uuid('pr:jess'), current_date - 30,  current_date + 335, true, true,  null),
  (seed_uuid('c:ella'),     'CON-218', seed_uuid('cl:ella'),     'peel',    seed_uuid('pr:ava'),  current_date - 30,  current_date + 335, true, true,  null)
on conflict (id) do nothing;

-- The appointment book ----------------------------------------------------------------------

insert into appointments (id, ref, client_id, practitioner_id, treatment_id, on_date, starts_at, ends_at, status, notes, deposit_cents, deposit_paid_on) values
  -- behind us
  (seed_uuid('a:1020'), 'APT-1020', seed_uuid('cl:hannah'),  seed_uuid('pr:jess'), seed_uuid('tx:fil'),  current_date - 4,  '10:00', '10:45', 'completed', null, 0, null),
  (seed_uuid('a:1021'), 'APT-1021', seed_uuid('cl:olivia'),  seed_uuid('pr:jess'), seed_uuid('tx:tox'),  current_date - 2,  '11:00', '11:30', 'completed', null, 0, null),
  (seed_uuid('a:1022'), 'APT-1022', seed_uuid('cl:jack'),    seed_uuid('pr:jess'), seed_uuid('tx:toxm'), current_date - 3,  '15:00', '15:30', 'completed', null, 0, null),
  (seed_uuid('a:1023'), 'APT-1023', seed_uuid('cl:grace'),   seed_uuid('pr:jess'), seed_uuid('tx:tox'),  current_date - 12, '12:00', '12:30', 'completed', null, 0, null),
  (seed_uuid('a:1024'), 'APT-1024', seed_uuid('cl:mia'),     seed_uuid('pr:mei'),  seed_uuid('tx:filc'), current_date - 9,  '14:00', '15:00', 'completed', null, 0, null),
  (seed_uuid('a:1025'), 'APT-1025', seed_uuid('cl:priya'),   seed_uuid('pr:jess'), seed_uuid('tx:tox'),  current_date - 20, '09:30', '10:00', 'completed', null, 0, null),
  -- ahead of us
  (seed_uuid('a:1030'), 'APT-1030', seed_uuid('cl:zara'),     seed_uuid('pr:jess'), seed_uuid('tx:tox'),  current_date + 1,  '10:00', '10:30', 'booked',    'Maintenance, same as last time', 0, null),
  (seed_uuid('a:1031'), 'APT-1031', seed_uuid('cl:chloe'),    seed_uuid('pr:jess'), seed_uuid('tx:fil'),  current_date + 5,  '11:00', '11:45', 'booked',    'Booked online: "fuller lips for formal"', 0, null),
  (seed_uuid('a:1032'), 'APT-1032', seed_uuid('cl:emily'),    seed_uuid('pr:jess'), seed_uuid('tx:lsr'),  current_date + 3,  '14:00', '15:00', 'confirmed', 'Acne scarring, first session', 20000, current_date - 1),
  (seed_uuid('a:1033'), 'APT-1033', seed_uuid('cl:isabella'), seed_uuid('pr:jess'), seed_uuid('tx:tox'),  current_date + 20, '10:00', '10:30', 'confirmed', null, 0, null),
  (seed_uuid('a:1034'), 'APT-1034', seed_uuid('cl:ella'),     seed_uuid('pr:ava'),  seed_uuid('tx:peel'), current_date + 1,  '13:00', '13:45', 'booked',    null, 0, null),
  (seed_uuid('a:1035'), 'APT-1035', seed_uuid('cl:natalie'),  seed_uuid('pr:ava'),  seed_uuid('tx:peel'), current_date + 7,  '09:30', '10:15', 'confirmed', 'Package session 3 of 6', 0, null),
  (seed_uuid('a:1036'), 'APT-1036', seed_uuid('cl:georgia'),  seed_uuid('pr:ava'),  seed_uuid('tx:fac'),  current_date + 2,  '15:00', '16:00', 'confirmed', null, 0, null)
on conflict (id) do nothing;

-- The treatment record, with the batch in every syringe ---------------------------------------------

insert into records (id, ref, appointment_id, client_id, practitioner_id, treatment_id, script_id, consent_id, on_date, areas, notes, aftercare_given, status, finalised_at) values
  (seed_uuid('r:501'), 'TRX-501', null,                 seed_uuid('cl:zara'),     seed_uuid('pr:jess'), seed_uuid('tx:tox'),  seed_uuid('s:301'), seed_uuid('c:zara'),     current_date - 91,  'Frown 20, forehead 10, crow''s feet 10', 'Good result expected. No immediate reaction.', true, 'final', now() - interval '91 days'),
  (seed_uuid('r:502'), 'TRX-502', seed_uuid('a:1020'),  seed_uuid('cl:hannah'),   seed_uuid('pr:jess'), seed_uuid('tx:fil'),  seed_uuid('s:303'), seed_uuid('c:hannah'),   current_date - 4,   'Lips, vermilion border and body', null, false, 'draft', null),
  (seed_uuid('r:503'), 'TRX-503', seed_uuid('a:1023'),  seed_uuid('cl:grace'),    seed_uuid('pr:jess'), seed_uuid('tx:tox'),  seed_uuid('s:304'), seed_uuid('c:grace'),    current_date - 12,  'Frown 20, forehead 14, crow''s feet 16', 'Tolerated well.', true, 'final', now() - interval '12 days'),
  (seed_uuid('r:504'), 'TRX-504', seed_uuid('a:1025'),  seed_uuid('cl:priya'),    seed_uuid('pr:jess'), seed_uuid('tx:tox'),  seed_uuid('s:305'), seed_uuid('c:priya'),    current_date - 20,  'Frown 20, crow''s feet 16', 'Mild bruise left crow''s feet.', true, 'final', now() - interval '20 days'),
  (seed_uuid('r:505'), 'TRX-505', seed_uuid('a:1024'),  seed_uuid('cl:mia'),      seed_uuid('pr:mei'),  seed_uuid('tx:filc'), seed_uuid('s:306'), seed_uuid('c:mia'),      current_date - 9,   'Cheeks, 1 ml each side, cannula', 'Aspirin noted: bruising risk discussed.', true, 'final', now() - interval '9 days'),
  (seed_uuid('r:506'), 'TRX-506', null,                 seed_uuid('cl:georgia'),  seed_uuid('pr:jess'), seed_uuid('tx:tox'),  seed_uuid('s:308'), seed_uuid('c:georgia'),  current_date - 40,  'Frown 20, forehead 20', 'Tolerated well.', true, 'final', now() - interval '40 days'),
  (seed_uuid('r:507'), 'TRX-507', seed_uuid('a:1022'),  seed_uuid('cl:jack'),     seed_uuid('pr:jess'), seed_uuid('tx:toxm'), seed_uuid('s:309'), seed_uuid('c:jack'),     current_date - 3,   'Masseters, 24 units each side', 'Tolerated well.', true, 'final', now() - interval '3 days'),
  (seed_uuid('r:508'), 'TRX-508', null,                 seed_uuid('cl:sophie'),   seed_uuid('pr:jess'), seed_uuid('tx:tox'),  seed_uuid('s:310'), seed_uuid('c:sophie'),   current_date - 112, 'Frown 20, forehead 10', 'Tolerated well.', true, 'final', now() - interval '112 days'),
  (seed_uuid('r:509'), 'TRX-509', null,                 seed_uuid('cl:kate'),     seed_uuid('pr:jess'), seed_uuid('tx:tox'),  seed_uuid('s:311'), seed_uuid('c:kate'),     current_date - 126, 'Frown 20, crow''s feet 16', 'Tolerated well.', true, 'final', now() - interval '126 days'),
  (seed_uuid('r:510'), 'TRX-510', null,                 seed_uuid('cl:amelia'),   seed_uuid('pr:mei'),  seed_uuid('tx:filc'), seed_uuid('s:312'), seed_uuid('c:amelia'),   current_date - 425, 'Cheeks, 1 ml each side', 'Tolerated well.', true, 'final', now() - interval '425 days'),
  (seed_uuid('r:511'), 'TRX-511', null,                 seed_uuid('cl:lucy'),     seed_uuid('pr:jess'), seed_uuid('tx:tox'),  seed_uuid('s:313'), seed_uuid('c:lucy'),     current_date - 60,  'Frown 20, forehead 20', 'Package session 1 of 3.', true, 'final', now() - interval '60 days'),
  (seed_uuid('r:512'), 'TRX-512', null,                 seed_uuid('cl:natalie'),  seed_uuid('pr:ava'),  seed_uuid('tx:peel'), null,               seed_uuid('c:natalie'),  current_date - 60,  'Full face', 'Package session 1 of 6.', true, 'final', now() - interval '60 days'),
  (seed_uuid('r:513'), 'TRX-513', null,                 seed_uuid('cl:natalie'),  seed_uuid('pr:ava'),  seed_uuid('tx:peel'), null,               seed_uuid('c:natalie'),  current_date - 30,  'Full face', 'Package session 2 of 6.', true, 'final', now() - interval '30 days'),
  (seed_uuid('r:514'), 'TRX-514', null,                 seed_uuid('cl:holly'),    seed_uuid('pr:jess'), seed_uuid('tx:sb'),   null,               seed_uuid('c:holly'),    current_date - 30,  'Cheeks and neck', 'Tolerated well.', true, 'final', now() - interval '30 days'),
  (seed_uuid('r:515'), 'TRX-515', null,                 seed_uuid('cl:ella'),     seed_uuid('pr:ava'),  seed_uuid('tx:peel'), null,               seed_uuid('c:ella'),     current_date - 30,  'Full face', 'Mild redness, settled.', true, 'final', now() - interval '30 days'),
  (seed_uuid('r:516'), 'TRX-516', null,                 seed_uuid('cl:ruby'),     seed_uuid('pr:jess'), seed_uuid('tx:fil'),  seed_uuid('s:314'), seed_uuid('c:ruby'),     current_date - 80,  'Lips', 'Tolerated well.', true, 'final', now() - interval '80 days')
on conflict (id) do nothing;

insert into product_usage (id, record_id, batch_id, quantity) values
  (seed_uuid('u:501'), seed_uuid('r:501'), seed_uuid('b:ta2311'), 40),
  (seed_uuid('u:502'), seed_uuid('r:502'), seed_uuid('b:lf2402'), 1),
  (seed_uuid('u:503'), seed_uuid('r:503'), seed_uuid('b:ta2406'), 50),
  (seed_uuid('u:504'), seed_uuid('r:504'), seed_uuid('b:ta2406'), 36),
  (seed_uuid('u:505'), seed_uuid('r:505'), seed_uuid('b:vf2405'), 2),
  (seed_uuid('u:506'), seed_uuid('r:506'), seed_uuid('b:ta2406'), 40),
  (seed_uuid('u:507'), seed_uuid('r:507'), seed_uuid('b:ta2406'), 48),
  (seed_uuid('u:508'), seed_uuid('r:508'), seed_uuid('b:ta2311'), 30),
  (seed_uuid('u:509'), seed_uuid('r:509'), seed_uuid('b:ta2311'), 36),
  (seed_uuid('u:510'), seed_uuid('r:510'), seed_uuid('b:vf2311'), 2),
  (seed_uuid('u:511'), seed_uuid('r:511'), seed_uuid('b:ta2406'), 40),
  (seed_uuid('u:512'), seed_uuid('r:512'), seed_uuid('b:pl2403'), 1),
  (seed_uuid('u:513'), seed_uuid('r:513'), seed_uuid('b:pl2403'), 1),
  (seed_uuid('u:514'), seed_uuid('r:514'), seed_uuid('b:sb2404'), 2),
  (seed_uuid('u:515'), seed_uuid('r:515'), seed_uuid('b:pl2403'), 1),
  (seed_uuid('u:516'), seed_uuid('r:516'), seed_uuid('b:lf2402'), 1)
on conflict (id) do nothing;

insert into photos (id, client_id, record_id, taken_on, kind, file_path, advertising) values
  (seed_uuid('ph:ruby1'),   seed_uuid('cl:ruby'),   seed_uuid('r:516'), current_date - 80, 'before', 'photos/ruby-walsh/before-lips.jpg', true),
  (seed_uuid('ph:ruby2'),   seed_uuid('cl:ruby'),   seed_uuid('r:516'), current_date - 66, 'after',  'photos/ruby-walsh/after-lips.jpg',  true),
  (seed_uuid('ph:hannah1'), seed_uuid('cl:hannah'), seed_uuid('r:502'), current_date - 4,  'before', 'photos/hannah-price/before-lips.jpg', false),
  (seed_uuid('ph:mia1'),    seed_uuid('cl:mia'),    seed_uuid('r:505'), current_date - 9,  'before', 'photos/mia-kowalski/before-cheeks.jpg', false),
  (seed_uuid('ph:mia2'),    seed_uuid('cl:mia'),    seed_uuid('r:505'), current_date - 3,  'progress', 'photos/mia-kowalski/lump-left-cheek.jpg', false)
on conflict (id) do nothing;

insert into complications (id, ref, client_id, record_id, reported_on, severity, description, action, escalated_to, status, resolved_on) values
  (seed_uuid('m:800'), 'CMP-800', seed_uuid('cl:priya'), seed_uuid('r:504'), current_date - 18, 'minor',    'Bruise at the left crow''s feet injection point', 'Reassured; arnica and cold compress', null, 'resolved', current_date - 12),
  (seed_uuid('m:801'), 'CMP-801', seed_uuid('cl:mia'),   seed_uuid('r:505'), current_date - 3,  'moderate', 'Firm, tender lump in the left cheek, no change in skin colour', 'Warm compress advised by phone; photo received', null, 'open', null)
on conflict (id) do nothing;

insert into followups (id, client_id, record_id, kind, due_on, status, contacts, last_contacted_on) values
  (seed_uuid('f:grace'),    seed_uuid('cl:grace'),    seed_uuid('r:503'), 'review', current_date + 2,   'open',   0, null),
  (seed_uuid('f:priya'),    seed_uuid('cl:priya'),    seed_uuid('r:504'), 'review', current_date - 6,   'open',   1, current_date - 5),
  (seed_uuid('f:jack'),     seed_uuid('cl:jack'),     seed_uuid('r:507'), 'review', current_date + 11,  'open',   0, null),
  (seed_uuid('f:hannah'),   seed_uuid('cl:hannah'),   seed_uuid('r:502'), 'review', current_date + 10,  'open',   0, null),
  (seed_uuid('f:mia'),      seed_uuid('cl:mia'),      seed_uuid('r:505'), 'review', current_date + 5,   'open',   0, null),
  (seed_uuid('f:zara'),     seed_uuid('cl:zara'),     seed_uuid('r:501'), 'rebook', current_date - 7,   'booked', 1, current_date - 10),
  (seed_uuid('f:sophie'),   seed_uuid('cl:sophie'),   seed_uuid('r:508'), 'rebook', current_date - 28,  'open',   1, current_date - 20),
  (seed_uuid('f:kate'),     seed_uuid('cl:kate'),     seed_uuid('r:509'), 'rebook', current_date - 42,  'open',   0, null),
  (seed_uuid('f:amelia'),   seed_uuid('cl:amelia'),   seed_uuid('r:510'), 'rebook', current_date - 61,  'open',   0, null),
  (seed_uuid('f:georgia'),  seed_uuid('cl:georgia'),  seed_uuid('r:506'), 'rebook', current_date + 44,  'open',   0, null),
  (seed_uuid('f:lucy'),     seed_uuid('cl:lucy'),     seed_uuid('r:511'), 'rebook', current_date + 24,  'open',   0, null),
  (seed_uuid('f:ruby'),     seed_uuid('cl:ruby'),     seed_uuid('r:516'), 'rebook', current_date + 102, 'open',   0, null),
  (seed_uuid('f:holly'),    seed_uuid('cl:holly'),    seed_uuid('r:514'), 'rebook', current_date + 152, 'open',   0, null),
  (seed_uuid('f:ella'),     seed_uuid('cl:ella'),     seed_uuid('r:515'), 'rebook', current_date - 2,   'booked', 0, null)
on conflict (id) do nothing;

-- Packages -----------------------------------------------------------------------------------

insert into packages (id, ref, client_id, treatment_id, sessions_total, sessions_used, price_cents, sold_on, expires_on) values
  (seed_uuid('k:601'), 'PKG-601', seed_uuid('cl:lucy'),    seed_uuid('tx:tox'),  3, 1, 120000, current_date - 240, current_date + 125),
  (seed_uuid('k:602'), 'PKG-602', seed_uuid('cl:natalie'), seed_uuid('tx:peel'), 6, 2,  90000, current_date - 150, current_date + 20)
on conflict (id) do nothing;

-- Invoices and payments ---------------------------------------------------------------------------

insert into invoices (id, ref, client_id, issued_on, due_on, status) values
  (seed_uuid('i:2001'), 'INV-2001', seed_uuid('cl:zara'),    current_date - 91,  current_date - 91,  'paid'),
  (seed_uuid('i:2002'), 'INV-2002', seed_uuid('cl:hannah'),  current_date - 4,   current_date - 4,   'sent'),
  (seed_uuid('i:2003'), 'INV-2003', seed_uuid('cl:grace'),   current_date - 12,  current_date - 12,  'paid'),
  (seed_uuid('i:2004'), 'INV-2004', seed_uuid('cl:priya'),   current_date - 20,  current_date - 20,  'paid'),
  (seed_uuid('i:2005'), 'INV-2005', seed_uuid('cl:mia'),     current_date - 9,   current_date - 9,   'paid'),
  (seed_uuid('i:2006'), 'INV-2006', seed_uuid('cl:jack'),    current_date - 3,   current_date - 3,   'paid'),
  (seed_uuid('i:2007'), 'INV-2007', seed_uuid('cl:holly'),   current_date - 30,  current_date - 30,  'sent'),
  (seed_uuid('i:2008'), 'INV-2008', seed_uuid('cl:lucy'),    current_date - 240, current_date - 240, 'paid'),
  (seed_uuid('i:2009'), 'INV-2009', seed_uuid('cl:natalie'), current_date - 150, current_date - 150, 'paid'),
  (seed_uuid('i:2010'), 'INV-2010', seed_uuid('cl:ella'),    current_date - 30,  current_date - 30,  'paid'),
  (seed_uuid('i:2011'), 'INV-2011', seed_uuid('cl:olivia'),  current_date - 2,   current_date - 2,   'paid'),
  (seed_uuid('i:2012'), 'INV-2012', seed_uuid('cl:georgia'), current_date - 40,  current_date - 40,  'paid'),
  (seed_uuid('i:2013'), 'INV-2013', seed_uuid('cl:ruby'),    current_date - 80,  current_date - 80,  'paid')
on conflict (id) do nothing;

insert into invoice_items (id, invoice_id, description, qty, unit_cents, treatment_id, product_id, package_id) values
  (seed_uuid('ii:2001'),  seed_uuid('i:2001'), 'Toxin, upper face (three areas)', 1, 45000, seed_uuid('tx:tox'),  null, null),
  (seed_uuid('ii:2002'),  seed_uuid('i:2002'), 'Dermal filler, lips (1 ml)',      1, 65000, seed_uuid('tx:fil'),  null, null),
  (seed_uuid('ii:2003'),  seed_uuid('i:2003'), 'Toxin, upper face (three areas)', 1, 45000, seed_uuid('tx:tox'),  null, null),
  (seed_uuid('ii:2004'),  seed_uuid('i:2004'), 'Toxin, upper face (three areas)', 1, 45000, seed_uuid('tx:tox'),  null, null),
  (seed_uuid('ii:2005'),  seed_uuid('i:2005'), 'Dermal filler, cheeks (2 ml)',    1, 120000, seed_uuid('tx:filc'), null, null),
  (seed_uuid('ii:2006'),  seed_uuid('i:2006'), 'Toxin, masseter',                 1, 55000, seed_uuid('tx:toxm'), null, null),
  (seed_uuid('ii:2007a'), seed_uuid('i:2007'), 'Skin booster (2 ml)',             1, 55000, seed_uuid('tx:sb'),   null, null),
  (seed_uuid('ii:2007b'), seed_uuid('i:2007'), 'Mineral sunscreen SPF 50',        1,  4900, null, seed_uuid('p:spf'), null),
  (seed_uuid('ii:2008'),  seed_uuid('i:2008'), 'Toxin package, three sessions',   1, 120000, null, null, seed_uuid('k:601')),
  (seed_uuid('ii:2009'),  seed_uuid('i:2009'), 'Peel package, six sessions',      1,  90000, null, null, seed_uuid('k:602')),
  (seed_uuid('ii:2010a'), seed_uuid('i:2010'), 'Chemical peel',                   1, 18000, seed_uuid('tx:peel'), null, null),
  (seed_uuid('ii:2010b'), seed_uuid('i:2010'), 'Vitamin C serum 30 ml',           1,  8900, null, seed_uuid('p:serc'), null),
  (seed_uuid('ii:2011'),  seed_uuid('i:2011'), 'Toxin, upper face (three areas)', 1, 45000, seed_uuid('tx:tox'),  null, null),
  (seed_uuid('ii:2012'),  seed_uuid('i:2012'), 'Toxin, upper face (three areas)', 1, 45000, seed_uuid('tx:tox'),  null, null),
  (seed_uuid('ii:2013'),  seed_uuid('i:2013'), 'Dermal filler, lips (1 ml)',      1, 65000, seed_uuid('tx:fil'),  null, null)
on conflict (id) do nothing;

insert into payments (id, invoice_id, amount_cents, method, paid_on) values
  (seed_uuid('pay:2001'), seed_uuid('i:2001'), 45000,  'card', current_date - 91),
  (seed_uuid('pay:2002'), seed_uuid('i:2002'), 30000,  'card', current_date - 4),
  (seed_uuid('pay:2003'), seed_uuid('i:2003'), 45000,  'card', current_date - 12),
  (seed_uuid('pay:2004'), seed_uuid('i:2004'), 45000,  'card', current_date - 20),
  (seed_uuid('pay:2005'), seed_uuid('i:2005'), 120000, 'card', current_date - 9),
  (seed_uuid('pay:2006'), seed_uuid('i:2006'), 55000,  'card', current_date - 3),
  (seed_uuid('pay:2007'), seed_uuid('i:2007'), 30000,  'card', current_date - 30),
  (seed_uuid('pay:2008'), seed_uuid('i:2008'), 120000, 'card', current_date - 240),
  (seed_uuid('pay:2009'), seed_uuid('i:2009'), 90000,  'card', current_date - 150),
  (seed_uuid('pay:2010'), seed_uuid('i:2010'), 26900,  'card', current_date - 30),
  (seed_uuid('pay:2011'), seed_uuid('i:2011'), 45000,  'card', current_date - 2),
  (seed_uuid('pay:2012'), seed_uuid('i:2012'), 45000,  'card', current_date - 40),
  (seed_uuid('pay:2013'), seed_uuid('i:2013'), 65000,  'card', current_date - 80)
on conflict (id) do nothing;
