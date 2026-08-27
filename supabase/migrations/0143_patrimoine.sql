-- ════════════════════════════════════════════════════════════════════
-- 0143 — Lecture patrimoniale : ce que l'affaire VAUT
-- ════════════════════════════════════════════════════════════════════
-- L'outil ne sait lire que le chiffre d'affaires et les marges — c'est-à-dire
-- le niveau « gagner de l'argent ». Or ce qui se construit ici est un ACTIF,
-- et un actif se mesure autrement : à son EBE récurrent, parce que c'est lui
-- qui se multiplie en valeur de fonds.
--
-- Un euro de résultat MENSUEL récurrent vaut trente à quarante fois un euro
-- sorti une fois. C'est cet effet de levier que cette page rend visible.
--
-- Les paramètres de valorisation sont RÉGLABLES et non figés dans le code :
-- les multiples de la restauration varient selon l'emplacement, le bail et
-- l'époque, et c'est au comptable de les arbitrer, pas à un développeur.
--
-- Idempotent, RLS désactivée (single-tenant, cf. CLAUDE.md).
-- ════════════════════════════════════════════════════════════════════

create table if not exists config_patrimoine (
  id                  uuid primary key default gen_random_uuid(),
  /** Ce qu'a coûté le fonds — la base de la plus-value latente. */
  prix_achat_fonds    numeric,
  date_acquisition    date,

  -- Deux méthodes, parce qu'aucune ne fait autorité seule. Un fonds de
  -- restauration se valorise couramment en multiple d'EBE OU en pourcentage
  -- du chiffre d'affaires annuel ; l'écart entre les deux est une
  -- information en soi.
  multiple_ebe_bas    numeric not null default 2.5,
  multiple_ebe_haut   numeric not null default 4,
  pct_ca_bas          numeric not null default 0.5,
  pct_ca_haut         numeric not null default 0.9,

  -- Le financement : ce qui reste dû se déduit de la valeur pour obtenir la
  -- part réellement détenue.
  credit_capital      numeric,
  credit_mensualite   numeric,
  credit_debut        date,
  credit_duree_mois   int,

  notes               text,
  updated_at          timestamptz not null default now()
);

alter table config_patrimoine disable row level security;

-- Une seule ligne de configuration : un second jeu de paramètres ferait
-- diverger deux pages sans qu'on sache laquelle croire.
create unique index if not exists idx_config_patrimoine_unique
  on config_patrimoine((true));

insert into config_patrimoine (prix_achat_fonds, credit_capital, credit_mensualite, credit_duree_mois, notes)
select 150000, 150000, 1900, 84, 'Valeurs de départ — à confirmer avec le comptable'
where not exists (select 1 from config_patrimoine);

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record;
begin
  select * into r from config_patrimoine limit 1;
  raise notice '── 0143 ── prix d''achat % € · crédit % € sur % mois',
    r.prix_achat_fonds, r.credit_capital, r.credit_duree_mois;
end $$;
