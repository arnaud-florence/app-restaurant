-- ============================================================
-- 0157 — Le Z de la caisse, troisième témoin du rapprochement
--
-- `rapprochements_caisse` (0139) confronte DEUX chiffres : ce que la caisse
-- nous a POUSSÉ (`encaissements_externes`) et ce qu'on en a COMPRIS
-- (`commandes`). C'est déjà beaucoup — une ingestion qui perd 3 % des lignes
-- se voit enfin. Mais les deux viennent du MÊME flux : si la caisse ne nous
-- envoie jamais un ticket, aucun des deux ne le sait, et le rapprochement
-- affiche « ok » sur une journée amputée.
--
-- `GET /closures` donne le chiffre que la caisse déclare POUR ELLE-MÊME :
-- le total de sa journée, celui du Z, celui que verra le comptable. C'est un
-- témoin INDÉPENDANT de notre ingestion, et c'est précisément ce qui manquait.
--
-- ⚠️ Les montants Zelty sont en CENTIMES (`turnover`, `taxes`). Ils sont
-- convertis à l'écriture : la colonne est en euros comme le reste de la
-- table, sinon deux unités cohabiteraient dans la même ligne et l'écart
-- serait faux d'un facteur cent sans que rien ne le signale.
--
-- ⚠️ `cloture_ca_ttc` peut rester NULL, et ça ne veut PAS dire zéro : une
-- caisse qui n'a pas été clôturée n'a pas de Z. Distinguer les deux est tout
-- l'intérêt — un zéro afficherait un écart énorme sur une journée simplement
-- pas encore fermée.
-- ============================================================

do $$ begin
  alter table rapprochements_caisse
    add column if not exists cloture_id_externe text,
    add column if not exists cloture_ca_ttc     numeric,
    add column if not exists cloture_taxes      numeric,
    add column if not exists ecart_cloture      numeric;
exception when duplicate_column then null; end $$;

comment on column rapprochements_caisse.cloture_ca_ttc is
  'Total déclaré par la caisse elle-même (Z). NULL = journée non clôturée, pas zéro.';
comment on column rapprochements_caisse.ecart_cloture is
  'cloture_ca_ttc - montant_recu. Non nul = des tickets ne nous sont jamais parvenus.';

alter table rapprochements_caisse disable row level security;

-- ─── Diagnostic ────────────────────────────────────────────
select 'rapprochements_caisse' as table_,
       count(*) as lignes,
       count(*) filter (where cloture_ca_ttc is not null) as avec_z,
       count(*) filter (where ecart_cloture is not null and ecart_cloture <> 0) as z_divergents
from rapprochements_caisse;

select c.relname, c.relrowsecurity as rls_active
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'rapprochements_caisse';
