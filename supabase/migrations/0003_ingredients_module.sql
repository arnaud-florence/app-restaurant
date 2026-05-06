-- ============================================================
-- 0003 — Module 3 : Gestion des ingrédients
-- ============================================================
-- Ajoute :
--   1. Une table historique_prix_ingredients pour tracer chaque
--      changement de prix d'achat HT (création, modification manuelle,
--      réception livraison fournisseur plus tard).
--   2. Un trigger qui crée automatiquement une entrée d'historique
--      à chaque INSERT/UPDATE du prix_achat_ht.
--   3. Un seed de 10 ingrédients de test (gated 'if not exists',
--      donc safe à ré-exécuter).
--
-- Idempotent — peut être ré-exécuté.
-- ============================================================

-- ─── 1. Historique des prix ─────────────────────────────────
create table if not exists historique_prix_ingredients (
  id              uuid primary key default gen_random_uuid(),
  ingredient_id   uuid not null references ingredients(id) on delete cascade,
  prix_achat_ht   decimal(10,4) not null,
  source          text not null default 'manuel'
                  check (source in ('creation', 'manuel', 'livraison', 'bon_commande')),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_hist_prix_ingredient
  on historique_prix_ingredients(ingredient_id, created_at desc);

alter table historique_prix_ingredients disable row level security;

-- ─── 2. Trigger : logge les changements de prix ─────────────
create or replace function log_prix_ingredient()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    if NEW.prix_achat_ht > 0 then
      insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, note)
      values (NEW.id, NEW.prix_achat_ht, 'creation', 'Création de la fiche');
    end if;
  elsif (TG_OP = 'UPDATE') then
    if OLD.prix_achat_ht is distinct from NEW.prix_achat_ht then
      insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, note)
      values (NEW.id, NEW.prix_achat_ht, 'manuel', 'Modification manuelle');
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists tg_log_prix_ingredient on ingredients;
create trigger tg_log_prix_ingredient
  after insert or update of prix_achat_ht on ingredients
  for each row execute function log_prix_ingredient();

-- ─── 3. Seed : 10 ingrédients réalistes ─────────────────────
-- Gated : ne se déclenche que si la table est vide.
do $$
begin
  if not exists (select 1 from ingredients limit 1) then
    insert into ingredients
      (nom, categorie, unite, prix_achat_ht, fournisseur_principal, fournisseur_secondaire,
       stock_actuel, stock_minimum, stock_maximum, dlc_moyenne_jours, allergenes)
    values
      ('Mozzarella di Bufala',  'Crémerie',       'kg',    12.5000, 'Crémerie Local',     'Grossiste Italie',  5.0,   2.0,  10.0,  14, ARRAY['lait']),
      ('Tomate San Marzano',    'Légumes',        'kg',     3.2000, 'Maraîcher du coin',  null,                8.0,   3.0,  15.0,  10, ARRAY[]::text[]),
      ('Farine T55 Bio',        'Épicerie sèche', 'kg',     1.8000, 'Boulangerie Coop',   null,               25.0,  10.0,  50.0, 180, ARRAY['gluten']),
      ('Magret de canard',      'Viandes',        'kg',    18.5000, 'Boucherie Bio',      'Marché de gros',    4.0,   2.0,   8.0,   5, ARRAY[]::text[]),
      ('Saumon frais',          'Poissons',       'kg',    22.0000, 'Marée fraîche',      null,                3.0,   2.0,   6.0,   3, ARRAY['poissons']),
      ('Œufs plein air L',      'Crémerie',       'pièce',  0.3500, 'Ferme du Plateau',   null,              120.0,  60.0, 240.0,  21, ARRAY['oeufs']),
      ('Huile olive vierge',    'Épicerie sèche', 'L',     11.2000, 'Domaine Provence',   null,                6.0,   3.0,  12.0, 365, ARRAY[]::text[]),
      ('Crème fraîche 30%',     'Crémerie',       'L',      4.5000, 'Crémerie Local',     null,                1.5,   2.0,   8.0,  10, ARRAY['lait']),
      ('Basilic frais',         'Aromates',       'botte',  1.2000, 'Maraîcher du coin',  null,                0.0,   4.0,  16.0,   3, ARRAY[]::text[]),
      ('Pignons de pin',        'Épicerie sèche', 'kg',    38.0000, 'Épicerie fine',      null,                1.0,   0.5,   2.0, 180, ARRAY['fruits_a_coques']);
  end if;
end $$;

-- ─── 4. Diagnostic : vérification ───────────────────────────
select
  'ingredients'                  as table_name,
  count(*)                       as nb_lignes
  from ingredients
union all
select
  'historique_prix_ingredients'  as table_name,
  count(*)                       as nb_lignes
  from historique_prix_ingredients;
