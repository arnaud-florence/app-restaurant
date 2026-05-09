-- Ajout d'un champ vidéo 360° sur les chambres pour la visite virtuelle.
-- L'admin colle un lien YouTube / Vimeo / Matterport — le site outil 2 l'affiche en iframe.

alter table chambres add column if not exists video_360_url text;
