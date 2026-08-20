-- ════════════════════════════════════════════════════════════════════
-- 0123 — Aligner les prix et compléter la carte depuis la caisse
-- ════════════════════════════════════════════════════════════════════
-- Comparaison ligne à ligne du catalogue SumUp (20 août) avec la carte de
-- l'outil. La caisse fait foi : c'est elle qui encaisse.
--
-- ─── Trois prix divergents ───────────────────────────────────────────
--   Jus d'orange 33 cl   outil 1,80 €  →  caisse 2,00 €
--   Jus de pomme 33 cl   outil 1,80 €  →  caisse 2,00 €
--   Salade saumon        outil 5,50 €  →  caisse 4,90 €
--
-- Les deux premiers font sous-facturer le site. Le troisième est pire :
-- un client qui commande une salade saumon en ligne paie 5,50 € quand le
-- comptoir la vend 4,90 €. On lui prend 60 centimes de trop.
--
-- ⚠️ Les affiches annoncent encore 1,80 € pour les jus et 5,50 € pour la
-- salade saumon. Ce sont ELLES qu'il faut réimprimer.
--
-- ─── Neuf produits vendus en caisse, absents de l'outil ──────────────
-- Le miroir (0122) les créerait à leur première vente, mais avec le libellé
-- brut de la caisse et sans catégorie. Les déclarer proprement maintenant
-- évite d'avoir à les reprendre après coup — et évite surtout un doublon si
-- quelqu'un les saisit à la main entre-temps.
--
-- Le taux de TVA repris est celui de la CAISSE, y compris quand il
-- interroge : « Red bull ice » y est à 5,5 % alors que « Rud bull » est à
-- 10 %. On ne corrige pas ici — la TVA se tranche avec le comptable, pas
-- dans une migration.
-- ════════════════════════════════════════════════════════════════════

update recettes r set prix_vente_ht = round(v.ttc / (1 + r.tva / 100.0), 4)
  from (values
    ('Jus d''orange 33 cl', 2.00),
    ('Jus de pomme 33 cl',  2.00),
    ('Salade saumon',       4.90)
  ) as v(nom, ttc)
 where r.nom = v.nom and r.tag_destination = 'FOURNIL';

insert into recettes (nom, nom_caisse, categorie, tag_destination, prix_vente_ht, tva,
                      contient_alcool, vendable_online, actif, etablissement_id)
select v.nom, v.caisse, v.cat, 'FOURNIL',
       round(v.ttc / (1 + v.tva / 100.0), 4), v.tva,
       false, true, true,
       (select id from etablissements where slug = 'fournil')
from (values
  -- Les libellés de caisse sont repris À L'IDENTIQUE, fautes comprises
  -- (« Facaccia »), sans quoi le rapprochement des tickets échouerait.
  ('Focaccia tomate-anchois',        'Facaccia tomate /anchois',     'Snacking', 1.50, 10),
  ('Focaccia crème fraîche-mozza',   'Focaccia crème fraiche/mozza', 'Snacking', 1.50, 10),
  ('Focaccia reine blanche',         'Focaccia reine blanche',       'Snacking', 1.50, 10),
  ('Focaccia tomates-mozza',         'Focaccia tomates /mozza',      'Snacking', 1.50, 10),
  ('Sandwich focaccia',              'Sandwich focaccia',            'Sandwich', 4.90, 10),
  ('Pain restaurant',                'Pain restaurant',              'Pain',     1.90, 5.5),
  ('Oasis 33 cl',                    'Oasis',                        'Boisson fraîche', 1.80, 10),
  ('Red Bull Ice 25 cl',             'Red bull ice',                 'Boisson fraîche', 2.80, 5.5)
) as v(nom, caisse, cat, ttc, tva)
where not exists (
  select 1 from recettes r
   where r.tag_destination = 'FOURNIL'
     and (r.nom = v.nom or r.nom_caisse = v.caisse)
);

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb int;
begin
  select count(*) into nb from recettes where tag_destination = 'FOURNIL' and actif;
  raise notice '── Carte Fournil : % produit(s) actif(s) ──', nb;
  raise notice '── Prix réalignés ──';
  for r in
    select nom, round(prix_vente_ht * (1 + tva / 100.0), 2) ttc
      from recettes
     where nom in ('Jus d''orange 33 cl', 'Jus de pomme 33 cl', 'Salade saumon')
     order by nom
  loop
    raise notice '  %-24s %s €', r.nom, r.ttc;
  end loop;
end $$;
