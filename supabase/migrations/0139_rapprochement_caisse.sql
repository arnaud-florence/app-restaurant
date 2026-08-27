-- ════════════════════════════════════════════════════════════════════
-- 0139 — Rapprochement quotidien caisse ↔ outil
-- ════════════════════════════════════════════════════════════════════
-- Le contrôle qui attrape ce que les autres laissent passer.
--
-- Chaque nuit, on compare ce que la caisse a POUSSÉ (miroir
-- `encaissements_externes`) à ce que l'outil en a FAIT (commandes et lignes).
-- Un écart signifie qu'un ticket s'est perdu en route, qu'une ligne n'a pas
-- trouvé son produit, ou qu'une TVA ne tombe pas juste.
--
-- Pourquoi ce n'est pas redondant avec le miroir : le miroir dit ce qu'on a
-- REÇU, les commandes disent ce qu'on a COMPRIS. Entre les deux il y a du
-- code, et du code se trompe en silence. Sans ce contrôle, une ingestion qui
-- perd 3 % des lignes depuis six semaines ne se voit nulle part — le CA reste
-- juste, seules les marges dérivent, et on accuse les fournisseurs.
--
-- Le jour où la caisse fournira son Z, les colonnes `_caisse` accueilleront
-- ses chiffres à elle : la structure ne bougera pas, on aura simplement une
-- troisième source à confronter.
--
-- Idempotent, RLS désactivée (single-tenant, cf. CLAUDE.md).
-- ════════════════════════════════════════════════════════════════════

create table if not exists rapprochements_caisse (
  id                uuid primary key default gen_random_uuid(),
  date_jour         date not null,
  source_caisse     text not null,

  -- Ce que la caisse a poussé
  tickets_recus     int     not null default 0,
  montant_recu      numeric not null default 0,

  -- Ce que l'outil en a fait
  commandes_liees   int     not null default 0,
  montant_commandes numeric not null default 0,
  lignes_posees     int     not null default 0,

  -- Écarts (calculés à l'écriture, pas à la lecture : on veut la photo du
  -- jour, pas un recalcul qui bougerait si les données changent après coup)
  ecart_montant     numeric not null default 0,
  ecart_tickets     int     not null default 0,

  -- Ventilations TVA des deux côtés, pour comparaison taux par taux
  tva_recue         jsonb not null default '{}'::jsonb,
  tva_commandes     jsonb not null default '{}'::jsonb,

  -- ok | ecart | incomplet
  statut            text not null default 'ok',
  detail            jsonb,
  calcule_at        timestamptz not null default now()
);

-- Un rapprochement par jour et par caisse : rejouable sans doublonner.
do $$ begin
  alter table rapprochements_caisse
    add constraint rapprochements_caisse_uniq unique (date_jour, source_caisse);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table rapprochements_caisse add constraint rapprochements_caisse_statut_chk
    check (statut in ('ok', 'ecart', 'incomplet'));
exception when duplicate_object then null; end $$;

create index if not exists idx_rappr_jour on rapprochements_caisse(date_jour desc);
-- Index partiel : on ne consulte en pratique que ce qui cloche.
create index if not exists idx_rappr_a_voir
  on rapprochements_caisse(date_jour desc) where statut <> 'ok';

alter table rapprochements_caisse disable row level security;

comment on table rapprochements_caisse is
  'Photo quotidienne de l''écart entre ce que la caisse a poussé et ce que l''outil en a fait. Écrite figée : un recalcul plus tard ne doit pas effacer l''anomalie du jour.';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from rapprochements_caisse;
  raise notice '── 0139 ── rapprochements_caisse : % ligne(s), RLS %', n,
    (select case when relrowsecurity then 'ACTIVÉE ⚠' else 'désactivée ✓' end
       from pg_class where relname = 'rapprochements_caisse');
end $$;
