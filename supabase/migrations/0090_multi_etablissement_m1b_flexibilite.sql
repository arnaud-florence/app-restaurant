-- ════════════════════════════════════════════════════════════════════
-- M1b — Flexibilité de configuration multi-activité
-- ════════════════════════════════════════════════════════════════════
-- PRÉPARÉ, NON ACTIVÉ. Ajoute les flags de config qui rendent l'architecture
-- flexible : on pourra activer « 1 entité consolidée » OU « activités séparées »
-- en réglant une config, SANS reconstruire.
--
-- Flags clés :
--   • inclus_ca_principal : false = l'activité est EXCLUE du CA principal
--     (cas des encaissements pour compte de tiers : tabac, FDJ, relais colis).
--   • mode_fiscal : DÉCISION PRISE → 'rattache' (UNE entité, CA consolidé).
--     ('rattache' = 1 entité consolidée | 'autonome' = entité séparée).
--   • categorie / couleur / ordre : pilotage de l'affichage dashboard.
--
-- Additif, idempotent, non-cassant. À exécuter à l'activation (après 0088).
-- ════════════════════════════════════════════════════════════════════

alter table etablissements add column if not exists categorie text;
alter table etablissements add column if not exists inclus_ca_principal boolean not null default true;
alter table etablissements add column if not exists couleur text default 'zinc';
alter table etablissements add column if not exists ordre int not null default 0;
alter table etablissements add column if not exists mode_fiscal text;  -- null | 'rattache' | 'autonome'

do $$
begin
  alter table etablissements
    add constraint etablissements_mode_fiscal_chk check (mode_fiscal in ('rattache','autonome'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table etablissements
    add constraint etablissements_categorie_chk
    check (categorie in ('restauration','boulangerie','tabac_presse','service_tiers','autre'));
exception when duplicate_object then null;
end $$;

-- Défauts sensés pour les établissements existants
update etablissements set categorie = 'restauration', couleur = 'emerald', ordre = 0
  where type = 'restaurant' and categorie is null;
update etablissements set categorie = 'boulangerie', couleur = 'amber', ordre = 1
  where type = 'fournil' and categorie is null;

-- DÉCISION : UNE entité juridique → toutes les activités sont « rattachées »
-- (CA consolidé, P&L unique, filtrable par activité). Modifiable plus tard par activité.
update etablissements set mode_fiscal = 'rattache' where mode_fiscal is null;

alter table etablissements disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record;
begin
  raise notice '── Établissements (config flexible) ──';
  for r in select nom, type, categorie, inclus_ca_principal, mode_fiscal, couleur, ordre
           from etablissements order by ordre loop
    raise notice '  % | type=% cat=% CA_principal=% mode_fiscal=% couleur=% ordre=%',
      r.nom, r.type, r.categorie, r.inclus_ca_principal, coalesce(r.mode_fiscal,'(non défini)'), r.couleur, r.ordre;
  end loop;
end $$;
