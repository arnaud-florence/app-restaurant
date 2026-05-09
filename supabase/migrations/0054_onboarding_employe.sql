-- Module 27/28 — Onboarding 1er login.
-- Ajoute un timestamp onboarding_completed_at pour bloquer l'accès aux modules ops
-- tant que l'employé n'a pas validé son manuel + quiz.

alter table profils
  add column if not exists onboarding_completed_at timestamptz;

-- Backfill : tout employé qui a déjà passé son quiz avec succès est considéré
-- comme onboardé (utile pour ne pas bloquer les comptes existants comme florence).
update profils p
set    onboarding_completed_at = sub.terminer_le
from (
  select pf.employe_id, max(pf.termine_le) as terminer_le
  from   progressions_formation pf
  where  pf.statut = 'reussi'
  group by pf.employe_id
) sub
where  p.employe_id = sub.employe_id
  and  p.onboarding_completed_at is null;

-- Manager : pas d'onboarding nécessaire (ils ont créé l'app).
update profils
set    onboarding_completed_at = coalesce(onboarding_completed_at, now())
where  role = 'manager'
  and  onboarding_completed_at is null;

do $$
declare nb int;
begin
  select count(*) into nb from profils where onboarding_completed_at is null;
  raise notice 'Profils non onboardés : %', nb;
end $$;
