-- ============================================================
-- 0009 — Module 7 : Gestion des stocks
-- ============================================================
-- Contenu :
--   1. Ajout de 3 colonnes utiles à `mouvements_stock`
--   2. Trigger DB qui déduit AUTOMATIQUEMENT le stock à chaque article
--      passé au statut 'servi' (selon la fiche recette)
--   3. Reset RLS de sécurité sur les tables impactées
--   4. Seed 10 mouvements factices pour démontrer l'historique
--
-- IMPORTANT : Le trigger ne tire que pour les futures transitions
-- vers 'servi'. Les 153 ventes seedées en 0006 (qui sont déjà
-- 'servi') n'ont pas déclenché de sortie de stock — ce qui est OK,
-- on ne veut pas créer de déséquilibre rétroactif sur des données
-- de démo.
--
-- Quand le Module 9 (écrans de service) commencera à créer de
-- vraies commandes, le trigger les capturera automatiquement.
--
-- Idempotent.
-- ============================================================

-- ─── 1. Ajout colonnes mouvements_stock ─────────────────────
alter table mouvements_stock
  add column if not exists date_peremption  date,
  add column if not exists prix_unitaire_ht decimal(10,4) not null default 0,
  add column if not exists fournisseur      text;

create index if not exists idx_mouvements_dlc on mouvements_stock(date_peremption)
  where type = 'entree' and date_peremption is not null;

-- ─── 2. RLS reset (Supabase ré-active sur tables touchées) ──
alter table mouvements_stock disable row level security;
alter table ingredients      disable row level security;
alter table commande_articles disable row level security;

-- ─── 3. Trigger : sortie automatique à chaque article servi ─
-- Pour chaque (recette_id, article_quantite) → consomme :
--   recette_ingredients.quantite × article_quantite / recette.nb_portions
-- de chaque ingrédient. Crée un mouvement type='sortie' et décrémente
-- ingredients.stock_actuel.
create or replace function deduire_stock_pour_article(
  p_article_id   uuid,
  p_recette_id   uuid,
  p_quantite     integer,
  p_commande_id  uuid
) returns void language plpgsql as $$
declare
  ri               record;
  qt_consommee     numeric;
  v_nb_portions    integer;
begin
  if p_recette_id is null or p_quantite is null or p_quantite <= 0 then
    return;
  end if;

  select coalesce(nb_portions, 1) into v_nb_portions
    from recettes where id = p_recette_id;
  if v_nb_portions is null or v_nb_portions <= 0 then
    v_nb_portions := 1;
  end if;

  for ri in (
    select ingredient_id, quantite, unite
      from recette_ingredients
     where recette_id = p_recette_id
  ) loop
    qt_consommee := ri.quantite * p_quantite::numeric / v_nb_portions::numeric;

    update ingredients
       set stock_actuel = stock_actuel - qt_consommee
     where id = ri.ingredient_id;

    insert into mouvements_stock
      (ingredient_id, type, quantite, motif, commande_id)
    values
      (ri.ingredient_id, 'sortie', qt_consommee,
       'Sortie auto recette (article ' || p_article_id || ')',
       p_commande_id);
  end loop;
end; $$;

create or replace function trg_deduire_stock_article()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' and NEW.statut = 'servi' then
    perform deduire_stock_pour_article(NEW.id, NEW.recette_id, NEW.quantite, NEW.commande_id);
  elsif TG_OP = 'UPDATE'
        and (OLD.statut is distinct from NEW.statut)
        and NEW.statut = 'servi'
        and (OLD.statut is null or OLD.statut <> 'servi') then
    perform deduire_stock_pour_article(NEW.id, NEW.recette_id, NEW.quantite, NEW.commande_id);
  end if;
  return NEW;
end; $$;

drop trigger if exists tg_deduire_stock_article on commande_articles;
create trigger tg_deduire_stock_article
  after insert or update of statut on commande_articles
  for each row execute function trg_deduire_stock_article();

-- ─── 4. Seed 10 mouvements factices (gated 'if not exists') ─
do $$
declare
  ing_mozza    uuid;
  ing_tomate   uuid;
  ing_farine   uuid;
  ing_magret   uuid;
  ing_saumon   uuid;
  ing_oeufs    uuid;
  ing_huile    uuid;
  ing_creme    uuid;
  ing_basilic  uuid;
  ing_pignons  uuid;
begin
  if exists (select 1 from mouvements_stock limit 1) then
    raise notice 'mouvements_stock déjà alimenté — skip seed';
    return;
  end if;

  select id into ing_mozza   from ingredients where nom = 'Mozzarella di Bufala' limit 1;
  select id into ing_tomate  from ingredients where nom = 'Tomate San Marzano' limit 1;
  select id into ing_farine  from ingredients where nom = 'Farine T55 Bio' limit 1;
  select id into ing_magret  from ingredients where nom = 'Magret de canard' limit 1;
  select id into ing_saumon  from ingredients where nom = 'Saumon frais' limit 1;
  select id into ing_oeufs   from ingredients where nom = 'Œufs plein air L' limit 1;
  select id into ing_huile   from ingredients where nom = 'Huile olive vierge' limit 1;
  select id into ing_creme   from ingredients where nom = 'Crème fraîche 30%' limit 1;
  select id into ing_basilic from ingredients where nom = 'Basilic frais' limit 1;
  select id into ing_pignons from ingredients where nom = 'Pignons de pin' limit 1;

  -- 5 entrées de livraison (avec DLC réalistes)
  insert into mouvements_stock (ingredient_id, type, quantite, prix_unitaire_ht, fournisseur, motif, date_peremption, created_at) values
    (ing_magret,   'entree',  5.000, 18.5000, 'Boucherie Bio',     'Livraison hebdo',         (current_date + 5),   now() - interval '6 days'),
    (ing_saumon,   'entree',  3.000, 22.0000, 'Marée fraîche',     'Livraison bi-hebdo',      (current_date + 2),   now() - interval '1 days'),  -- DLC dans 2j → ALERTE
    (ing_oeufs,    'entree',120.000,  0.3500, 'Ferme du Plateau',  'Livraison œufs',          (current_date + 21),  now() - interval '4 days'),
    (ing_farine,   'entree', 25.000,  1.8000, 'Boulangerie Coop',  'Réappro mensuel',         (current_date + 180), now() - interval '12 days'),
    (ing_huile,    'entree',  6.000, 11.2000, 'Domaine Provence',  'Livraison trimestrielle', (current_date + 365), now() - interval '20 days');

  -- 3 pertes / casses
  insert into mouvements_stock (ingredient_id, type, quantite, prix_unitaire_ht, motif, created_at) values
    (ing_basilic, 'perte', 2.000,  1.2000, 'DLC dépassée — bottes flétries',         now() - interval '3 days'),
    (ing_mozza,   'perte', 0.300,  8.5000, 'Cassée en livraison — emballage abîmé',   now() - interval '8 days'),
    (ing_tomate,  'perte', 0.500,  3.2000, 'Tomates trop mûres — pour sauce ?',       now() - interval '2 days');

  -- 2 sorties manuelles (cuisinier déduit 1 portion via tablette par exemple)
  insert into mouvements_stock (ingredient_id, type, quantite, prix_unitaire_ht, motif, created_at) values
    (ing_huile,    'sortie', 0.500, 11.2000, 'Friteuse — vidange manuelle',           now() - interval '1 days'),
    (ing_pignons,  'sortie', 0.050, 38.0000, 'Casse en service — bouton -1 portion',  now() - interval '5 days');
end $$;

-- ─── 5. Diagnostic ──────────────────────────────────────────
select
  type,
  count(*)                                  as nb,
  sum(quantite * prix_unitaire_ht)::numeric(10,2) as valeur_eur
  from mouvements_stock
 group by type
 order by type;

select
  (select count(*) from mouvements_stock where type = 'entree' and date_peremption is not null and date_peremption <= current_date + 3) as alertes_dlc;
