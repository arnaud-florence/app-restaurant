-- ════════════════════════════════════════════════════════════════════
-- Prix sur place — 28 août 2026
-- ════════════════════════════════════════════════════════════════════
-- Le bar ouvre en septembre, et un Coca ne se vend pas au même prix au
-- comptoir dans sa canette et à une table dans un verre consigné. Zelty
-- porte nativement les deux (`price` / `price_togo`) ; notre base n'avait
-- qu'un seul prix, et l'import envoyait donc la même valeur des deux côtés.
-- Résultat : tous les softs auraient été facturés au tarif comptoir à une
-- table, soit 70 centimes perdus à chaque verre.
--
-- ⚠️ Stocké en TTC, contrairement à `prix_vente_ht`. C'est volontaire :
-- c'est le prix de l'ardoise, celui que le gérant décide et que le client
-- lit. Le convertir en HT à la saisie ferait dériver l'arrondi — un TTC de
-- 2,50 € à 10 % n'a pas d'écriture HT exacte à deux décimales.
--
-- NULL = pas de tarif distinct : le prix de vente s'applique partout.
-- C'est le cas de tout le Fournil, et du bar où le sur place EST le prix.
-- ════════════════════════════════════════════════════════════════════

alter table recettes add column if not exists prix_sur_place_ttc numeric(10,2);

comment on column recettes.prix_sur_place_ttc is
  'Prix TTC en salle / au bar. NULL = même prix qu''à emporter.';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb int; nb2 int;
begin
  select count(*) into nb  from recettes where actif;
  select count(*) into nb2 from recettes where actif and prix_sur_place_ttc is not null;
  raise notice '→ % produit(s) actif(s), dont % avec un tarif sur place distinct', nb, nb2;
end $$;
