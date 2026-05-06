-- ============================================================
-- 0006 — Module 5 : Menu Engineering (seed historique de ventes)
-- ============================================================
-- Aucun changement de schéma — `commandes` & `commande_articles`
-- existent depuis 0001. On seed un historique factice de 30 jours
-- pour que la page /admin/recettes/engineering ne soit pas vide
-- avant que le Module 9 ne commence à créer de vraies commandes.
--
-- Mix calibré pour produire les 4 quadrants Kasavana :
--   • Star          → Magret (popularité + marge fortes)
--   • Plowhorse     → Margherita (très populaire, marge faible)
--   • Puzzle        → Saumon (peu vendu, marge forte)
--   • Dog           → Pesto Pignons + Œufs (peu vendus, marge faible)
--
-- Idempotent : se déclenche uniquement si commande_articles est vide.
-- Toutes les commandes seedées ont un numero préfixé `SEED-` pour
-- pouvoir être nettoyées si besoin.
-- ============================================================

-- ─── 1. Sécurité RLS ────────────────────────────────────────
alter table commandes         disable row level security;
alter table commande_articles disable row level security;

-- ─── 2. Seed gated ──────────────────────────────────────────
do $$
declare
  rec record;
  i int;
  cmd_id uuid;
  pop_count int;
  source_choice text;
  jour_offset numeric;
begin
  if exists (select 1 from commande_articles limit 1) then
    raise notice 'Seeds déjà présents — skip';
    return;
  end if;

  for rec in (select id, nom, prix_vente_ht, tag_destination from recettes order by nom)
  loop
    pop_count := case
      when rec.nom = 'Pizza Margherita'                          then 80
      when rec.nom = 'Pizza Pesto Pignons'                       then 12
      when rec.nom like 'Magret%'                                then 35
      when rec.nom like 'Saumon%'                                then 8
      when rec.nom like '%cocotte%' or rec.nom like '%Œufs%'     then 18
      else 5
    end;

    for i in 1..pop_count loop
      source_choice := case (random() * 3)::int
        when 0 then 'TABLE'
        when 1 then 'ONLINE'
        else        'COMPTOIR'
      end;
      -- Étalement uniforme sur les 30 derniers jours, avec une heure
      -- aléatoire pour rendre le timeline réaliste.
      jour_offset := random() * 30;

      insert into commandes (numero, source, statut, montant_total_ht, created_at)
      values (
        'SEED-' || substring(rec.id::text, 1, 8) || '-' || lpad(i::text, 4, '0'),
        source_choice,
        'encaisse',
        rec.prix_vente_ht,
        now() - (jour_offset || ' days')::interval
      )
      returning id into cmd_id;

      insert into commande_articles (commande_id, recette_id, quantite, prix_unitaire_ht, tag_destination, statut)
      values (cmd_id, rec.id, 1, rec.prix_vente_ht, rec.tag_destination, 'servi');
    end loop;
  end loop;
end $$;

-- ─── 3. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from commandes         where statut = 'encaisse')            as commandes_encaissees,
  (select count(*) from commande_articles)                                       as articles_total,
  (select count(*) from commandes         where numero like 'SEED-%')            as commandes_seed,
  (select min(created_at)::date from commandes where numero like 'SEED-%')       as plus_ancienne_seed,
  (select max(created_at)::date from commandes where numero like 'SEED-%')       as plus_recente_seed;

-- Détail par recette
select
  r.nom                                                                          as recette,
  count(ca.id)                                                                   as ventes,
  round((count(ca.id)::numeric / nullif((select count(*) from commande_articles), 0)) * 100, 1) as mix_pct
  from recettes r
  left join commande_articles ca on ca.recette_id = r.id
 group by r.nom
 order by ventes desc nulls last;
