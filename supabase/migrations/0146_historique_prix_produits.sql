-- ════════════════════════════════════════════════════════════════════
-- L'historique économique des produits — 28 août 2026
-- ════════════════════════════════════════════════════════════════════
-- `historique_prix_ingredients` existe depuis le module 3 et compte 184
-- lignes. Les PRODUITS, eux, n'avaient aucune trace — alors que dans le
-- modèle achat-revente du Fournil, c'est sur `recettes` que vivent les
-- trois chiffres qui font la marge : cout_achat_ht, prix_vente_ht, tva.
--
-- Conséquence, mesurée le jour même : le café est passé de 1,20 à 1,40 €,
-- quatre formules ont pris 20 centimes, trois prix ont été corrigés et un
-- taux de TVA rectifié — et rien ne l'a enregistré. Dans un mois, personne
-- ne saurait ni quand, ni depuis quel prix.
--
-- Sans cette table, aucune lecture causale n'est possible : on ne peut pas
-- expliquer un mouvement de marge si on ignore ce que valait le produit la
-- semaine d'avant.
--
-- ─── Pourquoi un TRIGGER et non du code applicatif ───────────────────
-- Le 28 août, les prix ont été modifiés depuis cinq scripts différents, la
-- propagation des lignes de facture, et le miroir du catalogue caisse. Une
-- écriture posée dans une server action en aurait manqué l'essentiel, et
-- l'aurait manqué EN SILENCE — le pire cas pour un journal. Le trigger, lui,
-- ne peut pas être contourné.
-- ════════════════════════════════════════════════════════════════════

create table if not exists historique_prix_produits (
  id              uuid primary key default gen_random_uuid(),
  recette_id      uuid not null references recettes(id) on delete cascade,
  prix_vente_ht      numeric(10,4),
  cout_achat_ht      numeric(10,4),
  prix_sur_place_ttc numeric(10,2),
  tva                numeric(4,1),
  -- Ce qu'on sait de l'origine. Le trigger ne peut pas la connaître : elle
  -- s'infère après coup, en rapprochant la date d'une facture ou d'une
  -- synchro. Mieux vaut « inconnu » qu'une source inventée.
  source          text not null default 'inconnu',
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_hpp_recette on historique_prix_produits(recette_id, created_at desc);
create index if not exists idx_hpp_date    on historique_prix_produits(created_at desc);
alter table historique_prix_produits disable row level security;

create or replace function public.tracer_prix_produit()
returns trigger language plpgsql as $function$
begin
  -- Seuls les champs ÉCONOMIQUES déclenchent une trace. Une photo qui change
  -- ou un libellé corrigé n'ont rien à faire dans un historique de prix : le
  -- bruit rendrait la lecture causale inutilisable.
  if TG_OP = 'UPDATE' and
     new.prix_vente_ht      is not distinct from old.prix_vente_ht and
     new.cout_achat_ht      is not distinct from old.cout_achat_ht and
     new.prix_sur_place_ttc is not distinct from old.prix_sur_place_ttc and
     new.tva                is not distinct from old.tva
  then
    return new;
  end if;

  insert into historique_prix_produits
    (recette_id, prix_vente_ht, cout_achat_ht, prix_sur_place_ttc, tva, source)
  values
    (new.id, new.prix_vente_ht, new.cout_achat_ht, new.prix_sur_place_ttc, new.tva,
     case when TG_OP = 'INSERT' then 'creation' else 'inconnu' end);
  return new;
end$function$;

drop trigger if exists trg_tracer_prix_produit on recettes;
create trigger trg_tracer_prix_produit
  after insert or update on recettes
  for each row execute function public.tracer_prix_produit();

-- ─── Point de départ ─────────────────────────────────────────────────
-- Sans ligne initiale, le premier changement n'aurait rien à quoi se
-- comparer : on saurait le nouveau prix, jamais l'ancien.
insert into historique_prix_produits
  (recette_id, prix_vente_ht, cout_achat_ht, prix_sur_place_ttc, tva, source, note)
select id, prix_vente_ht, cout_achat_ht, prix_sur_place_ttc, tva, 'reprise',
       'État au 28/08/2026, avant mise en place du suivi'
from recettes
where actif
  and not exists (select 1 from historique_prix_produits h where h.recette_id = recettes.id);

do $$
declare nb int; nbp int;
begin
  select count(*) into nb  from historique_prix_produits;
  select count(distinct recette_id) into nbp from historique_prix_produits;
  raise notice '→ % ligne(s) d''historique sur % produit(s)', nb, nbp;
end $$;
