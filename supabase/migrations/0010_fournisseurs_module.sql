-- ============================================================
-- 0010 — Module 8 : Gestion des fournisseurs
-- ============================================================
-- Contenu :
--   1. Colonnes contrôle réception sur `bon_commande_lignes`
--   2. FK `fournisseur_id` sur `historique_prix_ingredients`
--      (lien fort vers la fiche fournisseur quand le prix vient
--      d'une livraison / bon de commande)
--   3. Nouvelle table `factures_fournisseurs` avec statut +
--      date d'échéance pour les alertes de paiement
--   4. Reset RLS de sécurité
--   5. Seed 6 fournisseurs alignés sur les noms déjà utilisés
--      en 0003, plus 2 entrées de prix supplémentaires pour
--      démontrer le comparateur, plus 3 bons de commande et
--      3 factures
--
-- Idempotent.
-- ============================================================

-- ─── 1. Contrôle réception sur bon_commande_lignes ──────────
alter table bon_commande_lignes
  add column if not exists temperature_reception decimal(5,2),
  add column if not exists dlc_observee          date,
  add column if not exists etat_emballage        text
    check (etat_emballage is null or etat_emballage in ('parfait','correct','abime','rejete')),
  add column if not exists note_qualite_ligne    integer
    check (note_qualite_ligne is null or note_qualite_ligne between 1 and 5),
  add column if not exists commentaire           text;

-- ─── 2. FK fournisseur sur historique_prix ──────────────────
alter table historique_prix_ingredients
  add column if not exists fournisseur_id uuid references fournisseurs(id) on delete set null;

-- Élargir la contrainte source pour inclure une livraison
do $$ begin
  alter table historique_prix_ingredients drop constraint if exists historique_prix_ingredients_source_check;
  alter table historique_prix_ingredients
    add constraint historique_prix_ingredients_source_check
    check (source in ('creation','manuel','livraison','bon_commande'));
exception when others then null; end $$;

-- ─── 3. Factures fournisseurs ───────────────────────────────
create table if not exists factures_fournisseurs (
  id              uuid primary key default gen_random_uuid(),
  fournisseur_id  uuid not null references fournisseurs(id) on delete restrict,
  bon_commande_id uuid references bons_commande(id) on delete set null,
  numero          text not null,
  date_emission   date not null default current_date,
  date_echeance   date,
  montant_ht      decimal(10,2) not null default 0,
  montant_ttc     decimal(10,2) not null default 0,
  statut          text not null default 'a_payer'
                  check (statut in ('a_payer','paye','en_retard','litige','annule')),
  paye_le         timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_factures_fournisseur on factures_fournisseurs(fournisseur_id);
create index if not exists idx_factures_echeance    on factures_fournisseurs(date_echeance) where statut = 'a_payer';
create index if not exists idx_factures_statut      on factures_fournisseurs(statut, date_echeance);

alter table factures_fournisseurs disable row level security;

-- ─── 4. RLS reset (Supabase pattern récurrent) ──────────────
alter table fournisseurs           disable row level security;
alter table bons_commande          disable row level security;
alter table bon_commande_lignes    disable row level security;
alter table historique_prix_ingredients disable row level security;

-- ─── 5. Seed 6 fournisseurs ─────────────────────────────────
do $$
declare
  f_cremerie      uuid;
  f_maraicher     uuid;
  f_boulangerie   uuid;
  f_boucherie     uuid;
  f_maree         uuid;
  f_ferme         uuid;
  ing_mozza       uuid;
  ing_tomate      uuid;
  cmd_brouillon   uuid;
  cmd_envoye      uuid;
  cmd_recu        uuid;
begin
  if exists (select 1 from fournisseurs limit 1) then
    raise notice 'Fournisseurs déjà seedés — skip';
    return;
  end if;

  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Crémerie Local',     'Marie Dupont',    '05 61 23 45 67', 'commandes@cremerie-local.fr', '15 rue du Lavoir, 31200 Toulouse',  '30 jours fin de mois', 1,  50, ARRAY['mardi','jeudi','samedi'], 5, 4)
    returning id into f_cremerie;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Maraîcher du coin',  'Pierre Lefebvre', '06 12 34 56 78', 'pierre@maraicher.fr',         'Lieu-dit La Plaine, 31000 Toulouse', '15 jours net',          1,  30, ARRAY['lundi','mercredi','vendredi'], 5, 5)
    returning id into f_maraicher;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Boulangerie Coop',   'Sylvie Martin',   '05 61 89 01 23', 'sylvie@coopboul.fr',          'Z.I. Sud, 31100 Toulouse',           '30 jours net',          2, 100, ARRAY['lundi','jeudi'], 4, 4)
    returning id into f_boulangerie;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Boucherie Bio',      'Jean Dubois',     '05 62 14 25 36', 'jean@boucheriebio.fr',        '8 boulevard Carnot, 31000 Toulouse', '30 jours fin de mois', 1,  80, ARRAY['mardi','vendredi'], 5, 4)
    returning id into f_boucherie;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Marée fraîche',      'Claire Petit',    '06 78 90 12 34', 'claire@maree-fraiche.fr',     'Marché de gros, 31200 Toulouse',     '15 jours net',          1, 100, ARRAY['mercredi','samedi'], 5, 3)
    returning id into f_maree;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Ferme du Plateau',   'André Roux',      '06 23 45 67 89', 'andre@fermeduplateau.fr',     'Plateau de Lannemezan',              '30 jours net',          2,  50, ARRAY['lundi','jeudi'], 5, 5)
    returning id into f_ferme;

  -- ─── Quelques entrées historique_prix supplémentaires pour
  --    démontrer le comparateur entre fournisseurs sur même ingrédient
  select id into ing_mozza  from ingredients where nom = 'Mozzarella di Bufala' limit 1;
  select id into ing_tomate from ingredients where nom = 'Tomate San Marzano'   limit 1;
  if ing_mozza is not null then
    insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, fournisseur_id, note, created_at) values
      (ing_mozza,  13.2000, 'livraison', f_cremerie,  'Livraison hebdo', now() - interval '20 days'),
      (ing_mozza,  11.8000, 'manuel',    f_ferme,     'Devis comparatif Ferme du Plateau (option blanche)', now() - interval '10 days'),
      (ing_mozza,  12.5000, 'livraison', f_cremerie,  'Réappro mensuel', now() - interval '3 days');
  end if;
  if ing_tomate is not null then
    insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, fournisseur_id, note, created_at) values
      (ing_tomate,  3.8000, 'livraison', f_maraicher, 'Marché vert',     now() - interval '15 days'),
      (ing_tomate,  3.0000, 'manuel',    f_maraicher, 'Promo de saison', now() - interval '5 days');
  end if;

  -- ─── 3 bons de commande ────────────────────────────────────
  insert into bons_commande (fournisseur_id, statut, date_commande, date_livraison_prevue, montant_total_ht, notes) values
    (f_maraicher, 'brouillon', current_date,             current_date + 1, 0,    'Brouillon auto-généré depuis alertes stock')
    returning id into cmd_brouillon;
  insert into bons_commande (fournisseur_id, statut, date_commande, date_livraison_prevue, montant_total_ht, notes) values
    (f_boucherie, 'envoye',    current_date - 1,         current_date + 1, 92.50, 'Commande hebdomadaire viandes')
    returning id into cmd_envoye;
  insert into bons_commande (fournisseur_id, statut, date_commande, date_livraison_prevue, montant_total_ht, notes) values
    (f_cremerie,  'recu',      current_date - 6,         current_date - 5, 187.30, 'Réception OK, contrôle température conforme')
    returning id into cmd_recu;

  -- Lignes de bon — quelques exemples
  insert into bon_commande_lignes (bon_commande_id, ingredient_id, quantite_commandee, prix_unitaire_ht, quantite_recue, etat_emballage, note_qualite_ligne) values
    (cmd_recu,    ing_mozza,  10.0, 12.5000, 10.0,   'parfait', 5);

  -- ─── 3 factures ─────────────────────────────────────────────
  insert into factures_fournisseurs (fournisseur_id, bon_commande_id, numero, date_emission, date_echeance, montant_ht, montant_ttc, statut) values
    (f_cremerie,    cmd_recu,    'FA-2024-CRM-001', current_date - 5, current_date + 25, 187.30, 197.46, 'a_payer'),
    (f_boulangerie, null,        'FA-2024-BLG-007', current_date - 35, current_date - 5,  240.00, 252.00, 'en_retard'),
    (f_maraicher,   null,        'FA-2024-MRC-014', current_date - 60, current_date - 30, 142.50, 150.34, 'paye');

  -- Marquer la facture payée (paye_le)
  update factures_fournisseurs
     set paye_le = now() - interval '30 days'
   where statut = 'paye' and fournisseur_id = f_maraicher;

end $$;

-- ─── 6. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from fournisseurs)              as nb_fournisseurs,
  (select count(*) from bons_commande)             as nb_bons_commande,
  (select count(*) from factures_fournisseurs)     as nb_factures,
  (select count(*) from factures_fournisseurs where statut = 'en_retard')  as factures_en_retard,
  (select count(*) from factures_fournisseurs where statut = 'a_payer'
     and date_echeance <= current_date + 7) as factures_a_payer_7j;

select nom, note_qualite, note_ponctualite from fournisseurs order by nom;
