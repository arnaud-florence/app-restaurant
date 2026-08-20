-- ════════════════════════════════════════════════════════════════════
-- 0117 — L'adresse postale complète
-- ════════════════════════════════════════════════════════════════════
-- La base ne portait que « Sainte Anastasie sur Issole, 83136 Var, Provence »,
-- sans la voie. Le site l'affiche telle quelle sur la page contact, et un
-- client qui cherche le fournil au GPS tombe sur le centre du village.
--
-- L'adresse est portée par le point de vente principal (le site lit celui-là)
-- et par le Fournil, qui est physiquement au même endroit.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

update etablissements
   set adresse = 'Parking des Ferrages, 83136 Sainte Anastasie sur Issole'
 where is_principal = true
    or slug = 'fournil';

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record;
begin
  raise notice '── Adresses ──';
  for r in select slug, adresse from etablissements order by ordre loop
    raise notice '  %-22s %', r.slug, coalesce(r.adresse, '—');
  end loop;
end $$;
