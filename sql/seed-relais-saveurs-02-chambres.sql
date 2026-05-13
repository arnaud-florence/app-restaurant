-- ═══════════════════════════════════════════════════════════════════════
-- SEED LE RELAIS DES SAVEURS — CHAMBRES (3) — V2 schéma réel
-- Pas d'etablissement_id dans cette table
-- prix_nuit_ht = ROUND(prix_ttc / 1.10, 2)  (TVA 10% hôtellerie)
-- ═══════════════════════════════════════════════════════════════════════

-- ⚠️ Optionnel : décommente pour effacer les anciennes chambres
-- DELETE FROM chambres;

INSERT INTO chambres (nom, numero, capacite, description, equipements, photos, prix_nuit_ht, actif)
VALUES

(
  'Chambre Provençale',
  '01',
  2,
  'Chambre double standard avec lit 140cm. Décoration provençale authentique, salle de bain privative. Vue sur la place du village. Petit déjeuner inclus.',
  ARRAY['wifi', 'petit_dejeuner', 'salle_de_bain_privee'],
  ARRAY['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80'],
  ROUND(75 / 1.10, 2),
  true
),
(
  'Chambre du Var',
  '02',
  2,
  'Chambre double confort avec lit 160cm queen size. Espace bureau, salle de bain spacieuse avec douche italienne. Vue sur la nature varoise. Petit déjeuner inclus.',
  ARRAY['wifi', 'petit_dejeuner', 'salle_de_bain_privee', 'climatisation', 'parking'],
  ARRAY['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80'],
  ROUND(90 / 1.10, 2),
  true
),
(
  'Chambre Familiale Issole',
  '03',
  4,
  'Chambre familiale 4 personnes : 1 lit double + 2 lits simples. Espace lounge, salle de bain privative. Idéale pour les familles ou groupes d''amis. Petit déjeuner inclus.',
  ARRAY['wifi', 'petit_dejeuner', 'salle_de_bain_privee', 'climatisation', 'parking', 'tv'],
  ARRAY['https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=1200&q=80'],
  ROUND(110 / 1.10, 2),
  true
)
;

-- Note : option demi-pension (+35 €/personne avec dîner inclus) à gérer
-- via paramètre supplémentaire ou ajouté manuellement à la réservation.
