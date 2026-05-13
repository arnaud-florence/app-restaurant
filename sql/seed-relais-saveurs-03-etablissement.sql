-- ═══════════════════════════════════════════════════════════════════════
-- SEED LE RELAIS DES SAVEURS — ETABLISSEMENT
-- UPDATE de la ligne existante (id 0e764c87-1586-4654-ae28-006e42ac2076)
-- horaires_json : JSONB avec structure par jour + plages horaires
-- ═══════════════════════════════════════════════════════════════════════

UPDATE etablissements SET
  nom         = 'Le Relais des Saveurs',
  adresse     = 'Sainte Anastasie sur Issole, 83136 Var, Provence',
  slug        = 'le-relais-des-saveurs',
  horaires_json = jsonb_build_object(
    'lundi',     jsonb_build_array(jsonb_build_object('open', '06:00', 'close', '00:00')),
    'mardi',     jsonb_build_array(jsonb_build_object('open', '06:00', 'close', '00:00')),
    'mercredi',  jsonb_build_array(jsonb_build_object('open', '06:00', 'close', '00:00')),
    'jeudi',     jsonb_build_array(jsonb_build_object('open', '06:00', 'close', '00:00')),
    'vendredi',  jsonb_build_array(jsonb_build_object('open', '06:00', 'close', '00:00')),
    'samedi',    jsonb_build_array(jsonb_build_object('open', '06:00', 'close', '00:00')),
    'dimanche',  jsonb_build_array(jsonb_build_object('open', '06:00', 'close', '00:00')),
    'cuisine_midi', jsonb_build_object('open', '11:30', 'close', '14:30'),
    'cuisine_soir', jsonb_build_object('open', '18:30', 'close', '00:00'),
    'description', '7j/7 — Bar 6h-00h · Cuisine midi 11h30-14h30 · Cuisine soir 18h30-00h · Snacking & pizzas en continu 11h30-00h'
  ),
  actif       = true
WHERE id = '0e764c87-1586-4654-ae28-006e42ac2076';

-- Si tu veux ajouter téléphone et email plus tard quand tu les as :
-- UPDATE etablissements SET
--   telephone = '04 XX XX XX XX',
--   email = 'contact@lerelaisdessaveurs.fr'
-- WHERE id = '0e764c87-1586-4654-ae28-006e42ac2076';
