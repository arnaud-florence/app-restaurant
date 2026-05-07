-- ============================================================
-- 0027 — Module 17 : Obligations légales (/admin/legal)
-- ============================================================
-- Réutilise obligations_legales (Module 1 init) pour licence IV,
-- permis exploitation, assurances, bail commercial.
--
-- Ajoute :
--   1. accidents_travail              (registre obligatoire)
--   2. affichages_verifications       (checklist affichages réglementaires)
--   3. Disable RLS
-- ============================================================

-- ─── 1. accidents_travail ───────────────────────────────────
create table if not exists accidents_travail (
  id                  uuid primary key default gen_random_uuid(),
  employe_id          uuid references employes(id) on delete set null,
  date_accident       date not null default current_date,
  heure_accident      time,
  lieu                text,
  description         text not null,
  gravite             text not null default 'legere' check (gravite in ('legere','grave','mortel')),
  jours_arret         integer default 0,
  declaration_cpam    boolean not null default false,
  declaration_cpam_date date,
  declaration_cpam_url text,
  temoin              text,
  suites              text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_accidents_date on accidents_travail(date_accident desc);
create index if not exists idx_accidents_emp  on accidents_travail(employe_id);

alter table accidents_travail disable row level security;

-- ─── 2. affichages_verifications ────────────────────────────
create table if not exists affichages_verifications (
  id                uuid primary key default gen_random_uuid(),
  titre             text not null,
  description       text,
  reference_legale  text,                                  -- ex: "Code du travail Art. R4227-37"
  obligatoire       boolean not null default true,
  present           boolean not null default false,
  date_verification date,
  photo_url         text,
  ordre             integer not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_affichages_present on affichages_verifications(present, ordre);

alter table affichages_verifications disable row level security;

-- ─── 3. Seed des 14 affichages obligatoires en restauration ──
-- (idempotent : on n'insère que si la liste est vide)
do $$
declare
  v_count int;
begin
  select count(*) into v_count from affichages_verifications;
  if v_count = 0 then
    insert into affichages_verifications (titre, description, reference_legale, ordre, obligatoire) values
      ('Consignes de sécurité incendie',           'Conduite à tenir en cas d''incendie, point de rassemblement', 'Art. R4227-37 Code du travail', 1, true),
      ('Plan d''évacuation',                       'Plan affiché à chaque niveau, indiquant issues et extincteurs', 'Art. R4227-37', 2, true),
      ('Numéros d''urgence',                        'Pompiers 18 / SAMU 15 / Police 17 / EU 112', 'Art. R4227-37', 3, true),
      ('Interdiction de fumer',                    'Pictogramme + amende encourue 68€', 'Décret 2006-1386', 4, true),
      ('Affichage des prix TTC',                   'Carte/menu visible de l''extérieur, prix toutes taxes comprises', 'Arrêté du 27/03/87', 5, true),
      ('Carte des allergènes',                     'Liste des 14 allergènes par plat, sur demande client', 'Règl. UE 1169/2011', 6, true),
      ('Origine des viandes',                      'Pays d''origine bovine, porcine, ovine, volaille', 'Décret 2002-1465 + 2017-374', 7, true),
      ('Affichage horaires d''ouverture',          'Visible de l''extérieur', 'Code de commerce', 8, true),
      ('Licence IV (si débit boissons)',           'Affichée à proximité du bar', 'Code des débits de boissons', 9, true),
      ('Information consommateurs CGV',            'Conditions générales de vente disponibles à la demande', 'Code consommation L. 211-1', 10, true),
      ('Information RGPD WiFi',                    'Affichage si WiFi clients : finalités, durée conservation', 'RGPD Art. 13', 11, true),
      ('Pourboire : libre',                        'Mention "service compris" si applicable', 'Décret 2015-148', 12, true),
      ('Convention collective',                    'Référence affichée + accessible aux salariés', 'Art. R2262-1 Code travail', 13, true),
      ('Inspection du travail',                    'Coordonnées du service local', 'Art. D8113-1', 14, true)
    ;
  end if;
end $$;

-- Disable RLS aussi sur obligations_legales (au cas où)
alter table obligations_legales disable row level security;

-- ─── Diagnostic ─────────────────────────────────────────────
select
  (select count(*) from accidents_travail)         as nb_accidents,
  (select count(*) from affichages_verifications)  as nb_affichages,
  (select count(*) from obligations_legales)       as nb_obligations;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('accidents_travail','affichages_verifications','obligations_legales')
 order by c.relname;
