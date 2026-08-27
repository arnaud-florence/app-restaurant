-- ════════════════════════════════════════════════════════════════════
-- 0137 — Journal des échanges + correspondance des catalogues
-- ════════════════════════════════════════════════════════════════════
-- Les deux fondations du pont caisse ↔ outil. Elles ne dépendent d'AUCUNE
-- caisse en particulier : elles servent dès aujourd'hui avec SumUp et
-- serviront telles quelles avec Zelty.
--
--
-- 1. integration_evenements — la trace de tout ce qui circule
--
-- Sans journal, une synchronisation qui échoue à 6 h du matin est invisible
-- jusqu'à ce que quelqu'un s'étonne d'un chiffre trois semaines plus tard.
-- Chaque échange laisse sa charge utile brute : c'est ce qui permet de
-- REJOUER un jour manqué plutôt que de le perdre définitivement.
--
--
-- 2. correspondances_catalogue — la clé stable entre les deux mondes
--
-- Aujourd'hui les tickets se rattachent aux produits PAR LEUR LIBELLÉ. Ça
-- tient tant que personne ne renomme rien. Le jour où « Croissant » devient
-- « Croissant beurre » côté caisse, l'outil crée un second produit et coupe
-- la série statistique en deux — sans erreur, sans alerte, sans moyen de
-- s'en apercevoir autrement qu'en trouvant le graphe bizarre.
--
-- L'identifiant de la caisse, lui, ne change pas quand le libellé change.
-- C'est donc lui qui fait foi, et le libellé n'est plus qu'une aide au
-- diagnostic humain.
--
-- Idempotent, RLS désactivée (single-tenant, cf. CLAUDE.md).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Journal des échanges ─────────────────────────────────────────
create table if not exists integration_evenements (
  id            uuid primary key default gen_random_uuid(),
  sens          text not null,          -- entrant | sortant
  systeme       text not null,          -- sumup | zelty | site | ...
  type          text not null,          -- tickets | catalogue | commande | disponibilite | z
  reference     text,                   -- ticket, n° de commande, identifiant externe
  payload       jsonb,                  -- charge utile brute, pour rejouer
  resultat      jsonb,                  -- ce que l'échange a produit (compteurs, ids)
  statut        text not null default 'succes',   -- succes | echec | en_attente
  erreur        text,
  tentatives    int  not null default 1,
  duree_ms      int,
  traite_at     timestamptz,
  created_at    timestamptz not null default now()
);

do $$ begin
  alter table integration_evenements add constraint integration_evenements_sens_chk
    check (sens in ('entrant', 'sortant'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table integration_evenements add constraint integration_evenements_statut_chk
    check (statut in ('succes', 'echec', 'en_attente'));
exception when duplicate_object then null; end $$;

create index if not exists idx_integ_ev_recent  on integration_evenements(created_at desc);
create index if not exists idx_integ_ev_systeme on integration_evenements(systeme, created_at desc);
-- Index PARTIEL : on ne cherche que ce qui a échoué ou attend. Les succès
-- représenteront la quasi-totalité des lignes et n'ont pas à peser dessus.
create index if not exists idx_integ_ev_a_traiter
  on integration_evenements(statut, created_at)
  where statut <> 'succes';

alter table integration_evenements disable row level security;

comment on table integration_evenements is
  'Trace de chaque échange avec une caisse ou le site. `payload` conserve le brut pour pouvoir rejouer.';

-- ─── 2. Correspondance des catalogues ────────────────────────────────
create table if not exists correspondances_catalogue (
  id                   uuid primary key default gen_random_uuid(),
  systeme              text not null,           -- sumup | zelty | ...
  identifiant_externe  text not null,           -- l'id STABLE côté caisse
  recette_id           uuid not null references recettes(id) on delete cascade,
  libelle_externe      text,                    -- dernier libellé vu, aide au diagnostic
  vu_le                timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

-- Un identifiant externe ne désigne qu'un produit chez nous.
do $$ begin
  alter table correspondances_catalogue add constraint correspondances_catalogue_uniq
    unique (systeme, identifiant_externe);
exception when duplicate_object then null; end $$;

create index if not exists idx_corresp_recette on correspondances_catalogue(recette_id);
create index if not exists idx_corresp_systeme on correspondances_catalogue(systeme);

alter table correspondances_catalogue disable row level security;

comment on column correspondances_catalogue.identifiant_externe is
  'Identifiant stable du produit dans la caisse. C''est lui qui fait foi, pas le libellé : un renommage côté caisse ne doit pas créer un doublon chez nous.';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record;
begin
  raise notice '── 0137 ──';
  for r in
    select relname, (select count(*) from pg_class c2 where false) as x,
           case when relrowsecurity then 'ACTIVÉE ⚠' else 'désactivée ✓' end rls
      from pg_class
     where relname in ('integration_evenements', 'correspondances_catalogue')
  loop
    raise notice '  %-28s RLS %', r.relname, r.rls;
  end loop;
  raise notice '  integration_evenements    : % ligne(s)', (select count(*) from integration_evenements);
  raise notice '  correspondances_catalogue : % ligne(s)', (select count(*) from correspondances_catalogue);
end $$;
