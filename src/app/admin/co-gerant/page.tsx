// /admin/co-gerant — « Arnaud, ton co-gérant ».
// Phase 1.2/1.3 (domaine carte) : Arnaud te propose des plats (food cost calculé),
// tu valides d'un tap → la recette est créée. Manager only.

import { requireAccess } from '@/lib/auth'
import { isReadOnly } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { getContexteResto, listPropositions, listChantiers } from '@/lib/co-gerant/propositions'
import { auditerChantiersSiNecessaire } from '@/lib/co-gerant/chantiers'
import { analyserPlatsAOptimiser } from '@/lib/co-gerant/optimiser-carte'
import { lireBriefDuJour } from '@/lib/co-gerant/brief'
import { auditerCompletude } from '@/lib/co-gerant/completude'
import { createClient } from '@/lib/supabase/server'
import CoGerantClient from './CoGerantClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Arnaud — ton co-gérant' }

export default async function CoGerantPage() {
  // Le garde était `requireManager()` en dur : aucune permission ne pouvait
  // ouvrir cet écran. Or c'est celui qui PROPOSE des décisions — un plat avec
  // son food cost calculé, un chantier audité — et c'est donc le meilleur
  // écran pour apprendre à décider. On passe aux permissions, comme partout
  // ailleurs, et on laisse la LECTURE s'ouvrir à qui doit apprendre.
  //
  // ⚠️ Les server actions de cet écran restent `requireManager()`, et c'est
  // délibéré : elles CRÉENT des recettes et poussent des prix. On regarde
  // comment une décision se construit avant d'en prendre une.
  let profil
  try { profil = await requireAccess('/admin/co-gerant') } catch { redirect('/login') }
  const lectureSeule = isReadOnly(profil.poste, '/admin/co-gerant', profil.custom_permissions)
    || profil.role !== 'manager'

  // Arnaud fait son tour du resto tout seul, 1×/jour, avant que tu n'arrives.
  await auditerChantiersSiNecessaire()

  const [contexte, propositions, chantiers, platsAOptimiser, brief, completude] = await Promise.all([
    getContexteResto(),
    listPropositions({ domaine: 'carte', statut: ['proposee', 'en_discussion'], limit: 60 }),
    listChantiers(40),
    analyserPlatsAOptimiser({ max: 12 }),
    lireBriefDuJour(),
    auditerCompletude(),
  ])
  const sb = await createClient()
  const { count } = await sb.from('recettes').select('id', { count: 'exact', head: true })
  const today = new Date().toISOString().slice(0, 10)

  // Ce qu'Arnaud a repéré : les détections des 15 agents (non résolues), triées par gravité.
  const { data: findingsData } = await sb.from('agent_findings')
    .select('id, urgence, titre, message, action_label, action_url')
    .eq('resolu', false)
    .order('created_at', { ascending: false })
    .limit(30)
  const RANG: Record<string, number> = { rouge: 0, orange: 1, jaune: 2, info: 3, vert: 4 }
  const findings = [...(findingsData ?? [])]
    .sort((a, b) => (RANG[a.urgence] ?? 9) - (RANG[b.urgence] ?? 9))
    .slice(0, 6)

  return (
    <CoGerantClient
      contexte={contexte}
      propositions={propositions}
      chantiers={chantiers}
      platsAOptimiser={platsAOptimiser}
      nbRecettes={count ?? 0}
      brief={brief && brief.date === today ? brief : null}
      completude={completude}
      readOnly={lectureSeule}
      findings={findings}
    />
  )
}
