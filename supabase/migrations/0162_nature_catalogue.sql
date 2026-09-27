-- 0162 — Un tarif de CATALOGUE, à côté du devis, de la facture et du portail
--
-- Le catalogue Arti'Pat 2026 imprime un prix pour chacune de ses ~600
-- références. Ce prix est PUBLIC : sur les lignes rapprochées d'août 2026,
-- le prix réellement payé est systématiquement 20 à 30 % en dessous (la
-- baguette Victoire, 24,72 € au catalogue, 17,36 € au portail — soit 30 %).
--
-- ⚠️ IL NE FAUT SURTOUT PAS LE CONFONDRE AVEC LE NÔTRE, d'où une quatrième
-- valeur de `nature` plutôt qu'un rangement dans « devis » : un devis est
-- une proposition ADRESSÉE à CASATASIA, un tarif de catalogue est le prix
-- affiché à tout le monde. Les mélanger ferait croire à une offre qu'on
-- nous aurait faite.
--
-- ⚠️ Et c'est le seul cas où `tarif_negocie = false` est JUSTIFIÉ : ici on
-- SAIT que le prix n'est pas remisé, parce que c'est imprimé dans un
-- catalogue public. Partout ailleurs l'inconnu reste NULL (0158).
--
-- Son intérêt : mis en face du prix du portail, il montre ce que notre
-- remise vaut réellement, référence par référence.

alter table catalogue_fournisseur
  drop constraint if exists catalogue_fournisseur_nature_check;
alter table catalogue_fournisseur
  add constraint catalogue_fournisseur_nature_check
  check (nature in ('devis', 'facture', 'portail', 'catalogue'));

comment on column catalogue_fournisseur.nature is
  'devis = proposé À NOUS · facture = payé · portail = tarif de notre compte '
  '· catalogue = prix PUBLIC imprimé, non remisé. Toujours affiché : '
  'arbitrer sur un tarif d''appel en croyant lire un prix payé se paie.';

alter table catalogue_fournisseur disable row level security;
