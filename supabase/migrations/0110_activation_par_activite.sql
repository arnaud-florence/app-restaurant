-- ════════════════════════════════════════════════════════════════════
-- 0110 — Activation par activité (« Fournil d'abord »)
-- ════════════════════════════════════════════════════════════════════
-- Stratégie d'ouverture (validée août 2026) : le Fournil ouvre seul
-- (juillet-septembre 2026). Le restaurant, le bar, la pizzeria, les
-- chambres et l'événementiel n'ouvrent que fin octobre 2026 au plus tôt.
--
-- Cette table est l'INTERRUPTEUR GÉNÉRAL, unique source de vérité pour :
--   - le site public CASATASIA (via GET /api/public/activation)
--   - l'outil de pilotage (navigation, permissions, agents, dashboard)
--
-- Fin octobre : basculer `actif` à true sur les lignes d'activité
-- 'restaurant' depuis /admin/etablissements → onglet « Activités ».
-- Aucun code à modifier, aucun redéploiement.
--
-- ⚠️ Cette migration est INERTE : elle crée la table et ses lignes, mais ne
-- change RIEN à ce que voit le public. Elle peut être exécutée en production
-- immédiatement, sans risque, même avant que le code correspondant soit
-- déployé. C'est la migration 0111 (ou le bouton « Tout fermer » de
-- /admin/etablissements) qui bascule réellement l'établissement en mode
-- « Fournil seul », le jour de la mise en ligne.
--
-- Additif / idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1) Table des modules activables ─────────────────────────────────
create table if not exists activites_modules (
  cle                   text primary key,
  activite              text not null default 'restaurant',
  libelle               text not null,
  emoji                 text not null default '•',
  description           text,
  -- Interrupteur principal : false = invisible partout (site + outil).
  actif                 boolean not null default false,
  -- Afficher un teaser « ouverture prochainement » sur le site quand actif=false.
  teaser                boolean not null default false,
  teaser_texte          text,
  date_ouverture_prevue date,
  ordre                 int not null default 0,
  updated_at            timestamptz not null default now()
);

do $$
begin
  alter table activites_modules
    add constraint activites_modules_activite_chk
    check (activite in ('restaurant', 'fournil', 'commun'));
exception when duplicate_object then null;
end $$;

-- ─── 2) Les modules ──────────────────────────────────────────────────
-- `on conflict do nothing` : ré-exécuter la migration ne réactive JAMAIS
-- un module que le gérant aurait éteint entre-temps.

insert into activites_modules
  (cle, activite, libelle, emoji, description, actif, teaser, teaser_texte, date_ouverture_prevue, ordre)
values
  -- ── FOURNIL — ouvert ───────────────────────────────────────────────
  ('fournil',                   'fournil', 'Le Fournil',            '🥖',
   'Boulangerie, viennoiseries, pâtisseries, sandwiches, pizzas, cafés.',
   true,  false, null, null, 10),

  ('fournil_commande_en_ligne', 'fournil', 'Commande en ligne',     '🛒',
   'Prise de commande Fournil depuis le site public.',
   true,  false, null, null, 11),

  ('fournil_livraison',         'fournil', 'Livraison à domicile',  '🛵',
   'Tournée quotidienne à Sainte-Anastasie-sur-Issole, départ 10h.',
   true,  false, null, null, 12),

  ('relais_colis',              'fournil', 'Relais colis',          '📦',
   'Point de dépôt et de retrait de colis.',
   true,  false, null, null, 13),

  -- ── FOURNIL — prêts mais non communiqués (un clic pour les allumer) ─
  ('fdj',                       'fournil', 'Jeux',                  '🎰',
   'Française des Jeux. Encaissement pour compte de tiers (hors CA principal).',
   false, false, null, null, 14),

  ('tabac',                     'fournil', 'Tabac / presse',        '🚬',
   'Encaissement pour compte de tiers (hors CA principal).',
   false, false, null, null, 15),

  -- ── RESTAURANT — fermé jusqu'à fin octobre 2026 ────────────────────
  ('restaurant_salle',          'restaurant', 'Restaurant / salle', '🍽',
   'Service en salle, plan de salle, prise de commande, encaissement.',
   false, true,  'Restaurant — ouverture prochainement', '2026-10-31', 20),

  ('bar',                       'restaurant', 'Bar',                '🍷',
   'Bar, terrasses, cocktails, vins.',
   false, true,  'Bar & terrasses — ouverture prochainement', '2026-10-31', 21),

  ('pizzeria',                  'restaurant', 'Pizzeria',           '🍕',
   'Pizzas au feu de bois. (Les parts de pizza du Fournil ne sont PAS concernées.)',
   false, true,  'Pizzeria — ouverture prochainement', '2026-10-31', 22),

  ('snack_emporter',            'restaurant', 'Snack / Emporter',   '🥪',
   'Burgers, tacos, paninis, salades. Sur place, à emporter ou livrés.',
   false, false, null, '2026-10-31', 23),

  ('reservation_table',         'restaurant', 'Réservation de table', '📅',
   'Réservation en ligne de tables et de terrasses.',
   false, false, null, '2026-10-31', 24),

  ('chambres',                  'restaurant', 'Chambres d''hôtes',  '🛏',
   '3 chambres d''hôtes, calendrier, check-in/check-out, factures.',
   false, true,  'Chambres d''hôtes — ouverture prochainement', '2026-10-31', 25),

  ('evenementiel',              'restaurant', 'Événementiel',       '🎉',
   'Privatisation, mariages, séminaires, groupes et tours-opérateurs.',
   false, true,  'Événementiel & privatisation — ouverture prochainement', '2026-10-31', 26),

  ('fidelite',                  'commun',     'Programme fidélité', '⭐',
   'Points, niveaux, parrainage. Activable indépendamment des deux activités.',
   false, false, null, null, 30)

on conflict (cle) do nothing;

-- ─── 3) Paramètres de la livraison Fournil ───────────────────────────
-- Réglables depuis l'admin sans toucher au code.
--   heure_limite : au-delà, la commande bascule sur la tournée du lendemain.
--   communes     : liste CSV. Le site propose un choix fermé (pas de saisie
--                  libre de ville) → aucune commande hors zone possible.
insert into parametres (cle, valeur) values
  ('fournil_livraison_communes',     'Sainte-Anastasie-sur-Issole'),
  ('fournil_livraison_heure_limite', '08:30'),
  ('fournil_livraison_heure_tournee','10:00'),
  ('fournil_livraison_minimum_ttc',  '0'),
  ('fournil_livraison_frais_ttc',    '0')
on conflict (cle) do nothing;

-- ─── 4) RLS off (single-tenant — cf. CLAUDE.md §7) ───────────────────
alter table activites_modules disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare
  r record;
  nb_on int; nb_off int; rls text;
begin
  raise notice '── Modules par activité ──';
  for r in
    select activite, cle, libelle, actif, teaser
    from activites_modules order by ordre
  loop
    raise notice '  [%] % — % %', r.activite, r.libelle,
      case when r.actif then 'ALLUMÉ' else 'éteint' end,
      case when r.teaser then '(teaser site)' else '' end;
  end loop;

  select count(*) into nb_on  from activites_modules where actif;
  select count(*) into nb_off from activites_modules where not actif;
  raise notice '→ % module(s) allumé(s), % éteint(s)', nb_on, nb_off;

  raise notice '── Points de vente actifs ──';
  for r in select nom, actif from etablissements order by ordre loop
    raise notice '  % : %', r.nom, case when r.actif then 'actif' else 'inactif' end;
  end loop;

  select case when relrowsecurity then 'ON ⚠️' else 'OFF ✓' end into rls
    from pg_class where relname = 'activites_modules';
  raise notice '→ RLS activites_modules = %', rls;
end $$;
