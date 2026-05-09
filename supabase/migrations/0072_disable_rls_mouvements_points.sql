-- Patch : Supabase auto-réactive RLS sur les nouvelles tables.
-- On désactive pour rester cohérent avec le reste du schéma applicatif.

alter table mouvements_points disable row level security;
