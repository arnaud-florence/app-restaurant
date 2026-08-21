-- ════════════════════════════════════════════════════════════════════
-- 0124 — Visuels des produits sans photo + retrait de « Salade » du site
-- ════════════════════════════════════════════════════════════════════
-- Dix produits du Fournil s'affichaient sans image sur casatasia.fr. Ils sont
-- arrivés par le catalogue de la caisse et ne figurent sur AUCUNE affiche
-- CasaTasia : il n'y avait donc rien à y découper.
--
-- ─── Neuf visuels d'attente ──────────────────────────────────────────
-- Générés par `scripts/generer-visuels-manquants.mjs` : plaque typographique
-- reprenant l'identité des affiches (fond vert prélevé sur l'affiche « Nos
-- boissons », filets et texte or), au format des vraies photos (900×675).
--
-- On n'a PAS repris les visuels de marque des boissons sur le web :
-- photographies sous droits et marques déposées, sur un site marchand. Le
-- risque juridique serait pour le restaurant.
--
-- Ce sont des visuels d'attente : dès que le fournil photographie ces
-- produits, il suffit de remplacer les fichiers dans public/produits/ —
-- les URL enregistrées ici ne changent pas.
--
-- ⚠️ Ordre des opérations : DÉPLOYER l'app AVANT de jouer cette migration.
-- `image_url` est une URL absolue vers app-restaurant ; tant que les fichiers
-- ne sont pas en ligne, le site afficherait des images cassées.
--
-- ─── « Salade » retirée de la vente en ligne ─────────────────────────
-- Libellé fourre-tout de la caisse (4,40 €), à côté de « Salade italienne »,
-- « Salade poulet-feta » et « Salade saumon ». Au comptoir le vendeur sait ce
-- qu'il encaisse ; en ligne, le client ne sait pas ce qu'il commande.
-- Elle reste ACTIVE pour la caisse — seule la vente en ligne est coupée.
-- ════════════════════════════════════════════════════════════════════

update recettes r
   set image_url = 'https://app-restaurant-livid.vercel.app/produits/' || v.slug || '.jpg'
  from (values
    ('Focaccia crème fraîche-mozza', 'focaccia-creme-fraiche-mozza'),
    ('Focaccia reine blanche',       'focaccia-reine-blanche'),
    ('Focaccia tomate-anchois',      'focaccia-tomate-anchois'),
    ('Focaccia tomates-mozza',       'focaccia-tomates-mozza'),
    ('Ciao 33 cl',                   'ciao'),
    ('Coca-Cola Cherry 33 cl',       'coca-cola-cherry'),
    ('Fanta 33 cl',                  'fanta'),
    ('Oasis 33 cl',                  'oasis'),
    ('Red Bull 25 cl',               'red-bull')
  ) as v(nom, slug)
 where r.nom = v.nom
   and r.tag_destination = 'FOURNIL'
   and r.image_url is null;   -- idempotent : ne réécrit jamais une vraie photo

update recettes
   set vendable_online = false
 where nom = 'Salade'
   and tag_destination = 'FOURNIL';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb_sans int; nb_online int;
begin
  select count(*) into nb_sans
    from recettes where tag_destination = 'FOURNIL' and actif and image_url is null;
  select count(*) into nb_online
    from recettes where tag_destination = 'FOURNIL' and actif and vendable_online;

  raise notice '── Fournil : % produit(s) actif(s) encore sans visuel ──', nb_sans;
  raise notice '── Fournil : % produit(s) vendables en ligne ──', nb_online;

  if nb_sans > 0 then
    for r in
      select nom from recettes
       where tag_destination = 'FOURNIL' and actif and image_url is null order by nom
    loop
      raise notice '   sans visuel : %', r.nom;
    end loop;
  end if;

  for r in
    select nom, vendable_online from recettes
     where nom = 'Salade' and tag_destination = 'FOURNIL'
  loop
    raise notice '── % : vendable_online = % ──', r.nom, r.vendable_online;
  end loop;
end $$;
