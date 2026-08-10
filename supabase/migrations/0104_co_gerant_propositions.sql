-- ============================================================
-- 0104 — Co-gérant « Arnaud » · Phase 1.1 : le socle de la boucle
-- ============================================================
-- La table `propositions` = le cœur du co-gérant :
--   audit → idée → options → discussion → validation → action → résultat (mémoire)
-- Réutilisée par TOUTES les phases (carte, stock, finances, RH, évolutions app…).
-- Additif, isolé : ne touche à aucune table existante.
-- ============================================================

create table if not exists public.propositions (
  id              uuid primary key default gen_random_uuid(),

  -- ── Classification ──
  domaine         text not null,        -- 'carte' | 'stock' | 'finances' | 'rh' | 'app_evolution' | ...
  type            text not null         -- nature de la proposition
                    check (type in ('completer','ameliorer','mettre_en_place','evolution_app','alerte')),

  -- ── Contenu (ce qu'Arnaud propose) ──
  titre           text not null,        -- "Ajouter le plat Margherita"
  resume          text,                 -- une ligne
  details         text,                 -- le raisonnement : ce que ça fait + pourquoi
  options         jsonb not null default '[]'::jsonb,  -- variantes proposées ("il déroule des options")

  -- ── L'action exécutable (le « tool » à appeler quand validée) ──
  action_type     text,                 -- 'create_recette' | 'update_prix' | 'create_ingredient' | ...
  action_payload  jsonb,                -- paramètres pré-remplis de l'action

  -- ── Le cycle de vie (la boucle) ──
  statut          text not null default 'proposee'
                    check (statut in ('proposee','en_discussion','acceptee','rejetee','faite','annulee')),
  urgence         text not null default 'info'
                    check (urgence in ('rouge','orange','jaune','info','vert')),

  -- ── Provenance & navigation ──
  source          text not null default 'co_gerant',  -- agent/source à l'origine
  cible_url       text,                 -- où aller pour voir/agir

  -- ── Le peaufinage (la conversation sur cette proposition) ──
  echanges        jsonb not null default '[]'::jsonb, -- [{role:'arnaud'|'gerant', texte, at}]

  -- ── Le résultat (la mémoire : ce qui a marché) ──
  resultat        text,

  -- ── Validation / traçabilité ──
  validee_par     text,
  validee_at      timestamptz,
  faite_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_propositions_statut   on public.propositions (statut);
create index if not exists idx_propositions_domaine   on public.propositions (domaine);
create index if not exists idx_propositions_created   on public.propositions (created_at desc);

-- Single-tenant : RLS désactivée (cohérent avec tout le projet).
alter table public.propositions disable row level security;

-- Realtime : la « corbeille à valider » (Phase 2) se rafraîchira en direct.
do $$
begin
  alter publication supabase_realtime add table public.propositions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ── Contexte établissement (l'ADN du resto) — stocké en clé/valeur dans `parametres` ──
-- Arnaud les remplira en te posant 3 questions (Phase 1.3). On pose juste les cases.
insert into public.parametres (cle, valeur, description) values
  ('cg_concept',        null, 'Co-gérant : concept du resto (ex: pizzeria-trattoria conviviale)'),
  ('cg_style_cuisine',  null, 'Co-gérant : style de cuisine (ex: italienne, du marché)'),
  ('cg_gamme_prix',     null, 'Co-gérant : gamme de prix visée (ex: plat 12-18€)'),
  ('cg_objectif',       null, 'Co-gérant : objectif principal du gérant (ex: +20% de CA)'),
  ('cg_specialites',    null, 'Co-gérant : spécialités / plats signature à mettre en avant')
on conflict (cle) do nothing;

-- ── Diagnostic ──
select
  (select count(*) from public.propositions) as nb_propositions,
  (select count(*) from public.parametres where cle like 'cg_%') as nb_cles_contexte,
  (select relrowsecurity from pg_class where relname = 'propositions') as rls_active;
