-- ============================================================
-- Migration 0078 — Table posts_marketing pour le calendrier éditorial
-- ============================================================
-- Stocke les posts générés par IA pour Instagram / Facebook / Google My Business.
-- Le manager valide / édite / programme la publication.
-- Pour MVP : pas de publication API directe (limitations Meta/Instagram),
-- le manager copie-colle dans la plateforme cible.
-- ============================================================

create table if not exists posts_marketing (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid references etablissements(id),

  -- Contenu
  type              text not null check (type in ('post','story','reel','annonce_gmb')),
  canal             text not null check (canal in ('instagram','facebook','google_my_business','linkedin','tiktok','autre')),
  titre             text,
  contenu           text not null,                       -- légende / texte du post
  hashtags          text[],
  image_url         text,
  call_to_action    text,                                 -- ex: 'Réservez maintenant', 'Commander en ligne'
  cta_url           text,

  -- Référence métier (optionnel — lie à un plat / événement / promo)
  recette_id        uuid references recettes(id),
  evenement_id      uuid references evenements(id),
  promotion_id      uuid references promotions(id),

  -- Workflow
  statut            text default 'brouillon' check (statut in ('brouillon','prevu','publie','rejete','archive')),
  date_programmee   timestamptz,                          -- quand publier
  date_publication  timestamptz,                          -- quand effectivement publié (manuel par manager)

  -- IA
  genere_par_ia     boolean default false,
  prompt_ia         text,                                 -- prompt utilisé pour traçabilité

  -- Stats simples (renseignées manuellement par manager)
  nb_likes          integer default 0,
  nb_commentaires   integer default 0,
  nb_partages       integer default 0,
  url_publication   text,                                 -- URL du post une fois publié

  cree_par_id       uuid references employes(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_posts_marketing_statut on posts_marketing(statut, date_programmee);
create index if not exists idx_posts_marketing_canal  on posts_marketing(canal, statut);
create index if not exists idx_posts_marketing_dates  on posts_marketing(date_programmee desc) where date_programmee is not null;

alter table posts_marketing disable row level security;

-- Diagnostic
select 'Migration 0078 OK' as status, count(*) as nb_posts from posts_marketing;
