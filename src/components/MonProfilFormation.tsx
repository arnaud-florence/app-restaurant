// Server Component affiché en haut de /formation pour un employé connecté.
// Montre sa progression globale, ses certifs, ses badges et son rang dans
// le classement équipe (gamification motivante).

import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type Props = {
  employeId: string
}

export default async function MonProfilFormation({ employeId }: Props) {
  const supabase = await createClient()

  const [empRes, progRes, certifsEmpRes, badgesRes, guidesActifsRes, allProgsRes] = await Promise.all([
    supabase.from('employes').select('prenom, nom, poste').eq('id', employeId).single(),
    supabase.from('progressions_formation').select('guide_id, statut').eq('employe_id', employeId),
    supabase.from('certifications').select('poste, obtenue_le').eq('employe_id', employeId),
    supabase.from('badges_employes').select('badge_code, badge_titre, badge_emoji, obtenu_le').eq('employe_id', employeId).order('obtenu_le', { ascending: false }),
    supabase.from('guides_formation').select('id').eq('actif', true),
    // Pour le classement : tous les employés actifs et leurs progressions
    supabase.from('progressions_formation').select('employe_id, statut, guide:guides_formation!inner(actif)').eq('guide.actif', true).eq('statut', 'reussi'),
  ])

  const emp = empRes.data as { prenom: string; nom: string; poste: string | null } | null
  if (!emp) return null

  const nbGuidesTotal = guidesActifsRes.data?.length ?? 0
  const nbReussisMoi = (progRes.data ?? []).filter(p => p.statut === 'reussi').length
  const progressionPct = nbGuidesTotal > 0 ? Math.round((nbReussisMoi / nbGuidesTotal) * 100) : 0
  const certifs = (certifsEmpRes.data ?? []) as Array<{ poste: string; obtenue_le: string }>
  const badges = (badgesRes.data ?? []) as Array<{ badge_code: string; badge_titre: string; badge_emoji: string; obtenu_le: string }>

  // Classement : compte les guides réussis par employé
  const reussisParEmploye = new Map<string, number>()
  for (const p of (allProgsRes.data ?? []) as Array<{ employe_id: string }>) {
    reussisParEmploye.set(p.employe_id, (reussisParEmploye.get(p.employe_id) ?? 0) + 1)
  }
  const classement = [...reussisParEmploye.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id], idx) => ({ id, rang: idx + 1 }))
  const monRang = classement.find(c => c.id === employeId)?.rang ?? null

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm p-4 mb-4">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Mon profil de formation</p>
          <h2 className="text-lg font-bold text-zinc-900">
            🎓 {emp.prenom} {emp.nom}
            {emp.poste && <span className="ml-2 text-sm font-normal text-zinc-500">· {emp.poste}</span>}
          </h2>
        </div>
        {monRang && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Classement équipe</p>
            <p className="text-xl font-bold text-emerald-600">
              {monRang === 1 ? '🥇 1er' : monRang === 2 ? '🥈 2e' : monRang === 3 ? '🥉 3e' : `${monRang}e`}
            </p>
          </div>
        )}
      </header>

      {/* Progression % */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs font-bold text-zinc-700">Progression globale</span>
          <span className="text-2xl font-black text-emerald-600 tabular-nums">{progressionPct}%</span>
        </div>
        <div className="h-3 w-full bg-zinc-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              progressionPct >= 80 ? 'bg-emerald-500'
              : progressionPct >= 50 ? 'bg-blue-500'
              : progressionPct >= 25 ? 'bg-amber-500'
              : 'bg-zinc-400',
            )}
            style={{ width: `${progressionPct}%` }}
          />
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">{nbReussisMoi} / {nbGuidesTotal} guides validés</p>
      </div>

      {/* Certifications + Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">🏆 Mes certifications ({certifs.length})</p>
          {certifs.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">Aucune certification encore. Valide ton premier quiz pour la première !</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {certifs.map(c => (
                <li key={c.poste} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
                  ✓ {c.poste}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">🏅 Mes badges ({badges.length})</p>
          {badges.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">Tes premiers badges arrivent bientôt !</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {badges.map(b => (
                <li
                  key={b.badge_code}
                  title={b.badge_titre}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 border border-violet-300 font-bold"
                >
                  {b.badge_emoji} {b.badge_titre}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Message d'encouragement contextuel */}
      <p className="mt-3 text-sm text-center text-zinc-600 italic">
        {progressionPct === 0 && "Démarre ta première formation, 15 min suffisent !"}
        {progressionPct > 0 && progressionPct < 25 && "Beau début, continue sur ta lancée."}
        {progressionPct >= 25 && progressionPct < 50 && "Tu es bien lancé(e), encore quelques modules !"}
        {progressionPct >= 50 && progressionPct < 80 && "Plus que la moitié du chemin, tu y es presque !"}
        {progressionPct >= 80 && progressionPct < 100 && "Tu es très proche du but, encore un effort !"}
        {progressionPct === 100 && "🎉 Bravo, tu as terminé toutes tes formations !"}
      </p>
    </section>
  )
}
