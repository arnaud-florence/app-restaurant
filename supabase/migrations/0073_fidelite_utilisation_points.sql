-- Module fidélité — utilisation des points comme moyen de paiement
-- Étend la check méthode et insère le paramètre de conversion points→€

-- ─── 1. Étend les méthodes de paiement autorisées ────────────
alter table paiements_caisse
  drop constraint if exists paiements_caisse_methode_check;
alter table paiements_caisse
  add constraint paiements_caisse_methode_check
  check (methode in ('especes','carte','ticket_resto','virement','autre','fidelite'));

-- ─── 2. Paramètre de conversion ──────────────────────────────
-- 100 pts = 1 € de remise par défaut. Modifiable par l'admin via UI.
insert into parametres (cle, valeur) values
  ('fidelite.points_par_euro_remise', '100')
on conflict (cle) do nothing;
