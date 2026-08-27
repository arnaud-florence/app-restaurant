-- ════════════════════════════════════════════════════════════════════
-- 0140 — Trace de la commande dans la caisse externe
-- ════════════════════════════════════════════════════════════════════
-- Quand une commande du site est injectée dans la caisse, il faut savoir
-- QU'ELLE Y EST et sous quel identifiant. Sans ça :
--
--   · impossible de savoir si l'envoi a réussi, donc impossible de reprendre
--     ce qui a échoué sans risquer un doublon ;
--   · impossible de rapprocher le ticket que la caisse nous renverra ensuite
--     de la commande qui l'a créé — la même vente compterait deux fois.
--
-- Volontairement GÉNÉRIQUE (`caisse_externe_*`) et non `zelty_*` : le
-- connecteur est agnostique depuis le début, et cette colonne survivra à un
-- changement de caisse comme le reste.
--
-- Idempotent, rejouable.
-- ════════════════════════════════════════════════════════════════════

alter table commandes add column if not exists caisse_externe_systeme text;
alter table commandes add column if not exists caisse_externe_id      text;
alter table commandes add column if not exists caisse_externe_at      timestamptz;

comment on column commandes.caisse_externe_id is
  'Identifiant de cette commande dans la caisse externe, une fois injectée. NULL = pas (encore) envoyée.';

-- Un identifiant de caisse ne désigne qu'une commande chez nous : c'est ce
-- qui empêche une double injection de créer deux ventes.
create unique index if not exists idx_commandes_caisse_externe
  on commandes(caisse_externe_systeme, caisse_externe_id)
  where caisse_externe_id is not null;

-- Retrouver vite ce qui reste à envoyer.
create index if not exists idx_commandes_a_injecter
  on commandes(created_at desc)
  where caisse_externe_id is null and source = 'ONLINE';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare envoyees int; total int;
begin
  select count(*) filter (where caisse_externe_id is not null), count(*)
    into envoyees, total from commandes where source = 'ONLINE';
  raise notice '── 0140 ── % commande(s) ONLINE injectée(s) sur %', envoyees, total;
end $$;
