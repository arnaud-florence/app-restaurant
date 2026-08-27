-- ════════════════════════════════════════════════════════════════════
-- 0136 — Revenus de COMMISSION + TVA presse à 2,1 %
-- ════════════════════════════════════════════════════════════════════
-- Le Fournil ajoute quatre activités qui ne sont PAS des ventes de
-- marchandise mais des commissions : tabac (remise consentie par le
-- débitant de rattachement), presse (dépôt-vente), FDJ, relais colis.
--
-- Pourquoi ça ne peut pas rester modélisé comme une vente :
--
--   · le montant encaissé n'est pas du chiffre d'affaires. Un paquet de
--     cigarettes à 12 € encaissé, c'est 12 € qui transitent par le tiroir
--     et quelques dizaines de centimes qui vous restent ;
--   · le prix est IMPOSÉ (tabac, FDJ, presse) : aucune marge à optimiser,
--     donc ces lignes n'ont rien à faire dans un food cost ;
--   · mélangées au reste, elles écrasent tous les indicateurs — de la
--     boulangerie à 70 % de marge noyée dans du tabac à quelques pour cent.
--
-- Deux façons de rémunérer une commission, les deux existent chez les
-- partenaires : un POURCENTAGE du prix (tabac, presse) ou un FORFAIT par
-- opération (relais colis). Les deux sont donc supportés ; le forfait prime
-- quand les deux sont renseignés.
--
-- Idempotent, rejouable.
-- ════════════════════════════════════════════════════════════════════

-- ─── Nature du revenu ────────────────────────────────────────────────
alter table recettes add column if not exists type_revenu text not null default 'vente';

do $$ begin
  alter table recettes add constraint recettes_type_revenu_chk
    check (type_revenu in ('vente', 'commission'));
exception when duplicate_object then null;
end $$;

comment on column recettes.type_revenu is
  'vente = le prix encaissé est du CA. commission = seule la commission est du CA (tabac, presse, FDJ, relais colis).';

-- ─── Rémunération de la commission ───────────────────────────────────
alter table recettes add column if not exists commission_pct       decimal(6,3);
alter table recettes add column if not exists commission_forfait_ht decimal(10,4);

comment on column recettes.commission_pct is
  'Pourcentage du prix de vente TTC qui vous revient. Ex. remise du débitant de tabac.';
comment on column recettes.commission_forfait_ht is
  'Montant fixe HT par opération. Ex. un colis remis. Prime sur commission_pct si les deux sont renseignés.';

-- Un produit en commission doit dire comment il est rémunéré, sinon son
-- revenu serait silencieusement nul et le CA de l'activité invisible.
do $$ begin
  alter table recettes add constraint recettes_commission_renseignee_chk
    check (
      type_revenu <> 'commission'
      or commission_pct is not null
      or commission_forfait_ht is not null
    );
exception when duplicate_object then null;
end $$;

-- ─── TVA presse : 2,1 % ──────────────────────────────────────────────
-- `recettes.tva` est un decimal libre, aucune contrainte à lever côté base.
-- Le blocage était côté TypeScript (`TauxTva = 5.5 | 10 | 20`), levé dans
-- src/lib/tva.ts. On note simplement le taux dans le commentaire de colonne.
comment on column recettes.tva is
  'Taux de TVA du produit : 2.1 (presse), 5.5 (boulangerie, emporter), 10 (snacking, sur place), 20 (alcool).';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record;
begin
  raise notice '── 0136 ──';
  for r in
    select type_revenu, count(*) n, count(*) filter (where actif) actifs
      from recettes group by type_revenu order by 1
  loop
    raise notice '  type_revenu=%-12s % produit(s), % actif(s)', r.type_revenu, r.n, r.actifs;
  end loop;
  for r in select tva, count(*) n from recettes group by tva order by 1 loop
    raise notice '  tva=%-6s % produit(s)', r.tva, r.n;
  end loop;
  raise notice '  RLS recettes : %',
    (select case when relrowsecurity then 'ACTIVÉE ⚠' else 'désactivée ✓' end
       from pg_class where relname = 'recettes');
end $$;
