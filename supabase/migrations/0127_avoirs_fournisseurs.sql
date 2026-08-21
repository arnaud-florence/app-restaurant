-- ════════════════════════════════════════════════════════════════════
-- 0127 — Avoirs fournisseurs
-- ════════════════════════════════════════════════════════════════════
-- Un avoir est le document par lequel le fournisseur rend de l'argent
-- (marchandise refusée, erreur de prix, geste commercial). Il se scanne et
-- se référence exactement comme une facture — même table, même scanner —
-- distingué par `type_document`.
--
-- ─── Convention de signe : montants NÉGATIFS ─────────────────────────
-- Trois endroits additionnent les montants de cette table sans autre
-- filtre : le pilotage (dettes fournisseurs à payer), le snapshot de
-- l'assistant IA et le P&L des finances. En stockant l'avoir en négatif,
-- toutes ces sommes restent justes SANS modifier un seul consommateur —
-- l'avoir vient en déduction, ce qui est exactement sa nature comptable.
-- L'interface saisit et affiche des valeurs positives ; c'est l'action
-- serveur qui applique le signe.
--
-- `facture_liee_id` référence la facture d'origine quand on la connaît
-- (facultatif : un avoir de geste commercial n'en a pas forcément).
-- ════════════════════════════════════════════════════════════════════

alter table factures_fournisseurs
  add column if not exists type_document text not null default 'facture';

do $$ begin
  alter table factures_fournisseurs
    add constraint factures_type_document_check
    check (type_document in ('facture', 'avoir'));
exception when duplicate_object then null;
end $$;

alter table factures_fournisseurs
  add column if not exists facture_liee_id uuid references factures_fournisseurs(id) on delete set null;

create index if not exists idx_factures_type on factures_fournisseurs(type_document)
  where type_document = 'avoir';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb_f int; nb_a int;
begin
  select count(*) filter (where type_document = 'facture'),
         count(*) filter (where type_document = 'avoir')
    into nb_f, nb_a from factures_fournisseurs;
  raise notice '── factures : % · avoirs : % ──', nb_f, nb_a;
end $$;
