-- ════════════════════════════════════════════════════════════════════
-- 0119 — Source 'CAISSE' : les ventes encaissées hors de l'app
-- ════════════════════════════════════════════════════════════════════
-- La caisse agréée (SumUp) est la source de vérité fiscale : c'est elle qui
-- encaisse la majorité des ventes du comptoir, sans passer par l'app.
--
-- Ses tickets arrivaient bien dans `encaissements_externes` (0108), mais cette
-- table n'est lue QUE par sa page de suivi. Tout le calcul du CA — centre
-- opérationnel, pilotage, finances, fidélité, agents — lit `commandes` avec
-- statut = 'encaisse'. Le CA réel du Fournil n'apparaissait donc nulle part.
--
-- Deux montages possibles :
--   a) faire lire les deux tables à une douzaine de requêtes → autant
--      d'occasions de double-compter un ticket déjà rapproché à une commande ;
--   b) matérialiser chaque ticket NON rapproché en commande 'encaisse'.
--
-- On prend (b) : un seul chemin d'écriture, aucune requête de lecture à
-- toucher, pas de double comptage possible. `encaissements_externes` reste le
-- miroir fiscal et le journal d'audit.
--
-- Ces commandes n'ont PAS de lignes d'articles : la caisse nous donne un
-- montant et une ventilation TVA, pas le détail par recette. Le CA est donc
-- juste ; le food cost et le stock, eux, ne connaissent que ce qui est passé
-- par l'app. C'est assumé.
-- ════════════════════════════════════════════════════════════════════

alter table commandes drop constraint if exists commandes_source_check;
alter table commandes add constraint commandes_source_check
  check (source in ('ONLINE','TABLE','COMPTOIR','BORNE','CAISSE'));

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint where conname = 'commandes_source_check';
  raise notice '── commandes_source_check ──';
  raise notice '  %', def;
  raise notice '  CAISSE autorisé : %', (def like '%CAISSE%');
end $$;
