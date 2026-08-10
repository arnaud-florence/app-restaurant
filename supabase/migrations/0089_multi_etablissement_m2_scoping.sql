-- ════════════════════════════════════════════════════════════════════
-- M2 — Multi-établissement : scoping du cœur transactionnel
-- ════════════════════════════════════════════════════════════════════
-- Ajoute `etablissement_id` (NULLABLE) + backfill vers l'établissement
-- principal sur toutes les tables transactionnelles non encore scopées.
--
-- RÉTRO-COMPATIBLE : la colonne reste NULLABLE → le code existant qui
-- n'écrit pas etablissement_id continue de fonctionner. Le câblage applicatif
-- (poser etablissement_id à l'insert) est l'objet de M3.
--
-- DÉFENSIF : ne touche que les tables qui existent ET ne sont pas déjà
-- scopées. Idempotent (ré-exécutable). Backfill = établissement principal.
--
-- ⚠️ PRÉ-REQUIS : cadre juridique « 1 entité » confirmé avec l'expert-comptable.
-- À exécuter manuellement dans Supabase → SQL Editor (après 0088).
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  principal_id uuid;
  done int := 0;
  skipped int := 0;
  -- Tables transactionnelles à scoper (les déjà-scopées comme commandes/recettes/
  -- clients sont automatiquement ignorées). Le référentiel partagé (ingredients,
  -- fournisseurs, employes, recettes catalogue…) est volontairement ABSENT.
  tables text[] := array[
    -- Caisse / service
    'sessions_caisse','paiements_caisse','mouvements_caisse','tables_restaurant',
    'appels_serveur','pourboires_distribution',
    -- Stock / achats
    'mouvements_stock','lots_produits','bons_commande','factures_fournisseurs',
    -- RH / planning
    'planning','pointage','conges','taches_completees','valeurs_saisies_taches',
    -- Finances
    'charges_fixes','charges_fixes_recurrentes','charges_variables','notes_de_frais',
    'point_mort_mensuel','ventes_journalieres','objectifs','actions_strategiques',
    'config_economique',
    -- HACCP / hygiène
    'releves_temperatures','checklists_hygiene','plan_nettoyage','non_conformites',
    'interventions_antiparasitaire','plans_haccp',
    -- Énergie / maintenance / légal
    'releves_energie','equipements','materiels','interventions_maintenance',
    'accidents_travail','obligations_legales',
    -- Déchets
    'suivi_dechets','collectes_dechets',
    -- Salle / affichage
    'menu_du_jour','affichage_infos','affichage_promos','affichages_verifications',
    -- Hôtellerie / événementiel
    'chambres','reservations_chambres','reservations_tables','groupes','groupes_menus',
    'groupes_paiements','evenements',
    -- CRM / fidélité / réputation
    'reclamations','retours_plats','campagnes','mouvements_cartes_cadeaux','mouvements_points',
    -- Pilotage / agents / journal
    'agent_findings','agents_runs','journal_entrees','journal_activite','comptes_rendus'
  ];
begin
  select id into principal_id from etablissements where is_principal = true limit 1;
  if principal_id is null then
    raise exception 'Aucun établissement principal trouvé — exécuter 0074/0088 d''abord.';
  end if;

  foreach t in array tables loop
    -- Table absente ? on saute (défensif).
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      skipped := skipped + 1;
      raise notice 'SKIP (table absente) : %', t;
      continue;
    end if;

    -- Déjà scopée ? on saute.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'etablissement_id'
    ) then
      skipped := skipped + 1;
      raise notice 'SKIP (déjà scopée) : %', t;
      continue;
    end if;

    -- 1) colonne nullable, 2) backfill principal, 3) index
    execute format('alter table %I add column etablissement_id uuid references etablissements(id)', t);
    execute format('update %I set etablissement_id = %L where etablissement_id is null', t, principal_id);
    execute format('create index if not exists idx_%s_etab on %I(etablissement_id)', t, t);
    done := done + 1;
    raise notice 'SCOPÉ : %', t;
  end loop;

  raise notice '════ M2 terminé : % table(s) scopée(s), % ignorée(s) ════', done, skipped;
end $$;

-- ─── Diagnostic : combien de tables portent désormais etablissement_id ──
do $$
declare nb int;
begin
  select count(distinct table_name) into nb
  from information_schema.columns
  where table_schema = 'public' and column_name = 'etablissement_id';
  raise notice 'Total tables avec etablissement_id : %', nb;
end $$;
