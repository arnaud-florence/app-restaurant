'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { getMainRoute } from '@/lib/permissions'
import { calculerScoreQuiz, peutRetenter, statutApresQuiz, type Question, type Progression } from '@/lib/formation'
import { etatPaliers } from '@/lib/paliers-gerance'

/**
 * Vérifie qu'un employé a le droit d'agir au nom d'un employe_id donné.
 * Manager : autorisé pour n'importe qui (suivi formation équipe).
 * Employé connecté : seulement pour SON propre employe_id (anti-tampering).
 * Kiosk (non connecté) : autorisé (poste partagé sans login, ex: tablette d'équipe).
 */
async function autoriserActionPourEmploye(employe_id: string) {
  const profil = await getProfile()
  if (!profil) return                       // kiosk
  if (profil.role === 'manager') return     // manager voit tout
  if (profil.employe_id !== employe_id) {
    throw new Error('Vous ne pouvez agir qu\'au nom de votre propre profil.')
  }
}

// ─── Récupère ou crée la progression de l'employé pour ce guide ──
async function getOuCreerProgression(guide_id: string, employe_id: string): Promise<Progression> {
  const supabase = await createClient()
  const { data: existing } = await supabase.from('progressions_formation')
    .select('*').eq('guide_id', guide_id).eq('employe_id', employe_id).maybeSingle()
  if (existing) return existing as unknown as Progression

  const { data, error } = await supabase.from('progressions_formation').insert({
    guide_id, employe_id, statut: 'en_cours',
  }).select('*').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  return data as unknown as Progression
}

// ─── Marquer étape vue ────────────────────────────────────────────
const marquerVueSchema = z.object({
  guide_id:   z.string().uuid(),
  employe_id: z.string().uuid(),
  etape_id:   z.string().uuid(),
})

export async function marquerEtapeVue(input: unknown) {
  const p = marquerVueSchema.parse(input)
  await autoriserActionPourEmploye(p.employe_id)
  const supabase = await createClient()
  const prog = await getOuCreerProgression(p.guide_id, p.employe_id)

  if (prog.etapes_vues_ids.includes(p.etape_id)) {
    return { ok: true as const, deja_vu: true }
  }
  const nouvelles = [...prog.etapes_vues_ids, p.etape_id]

  // Compter le total d'étapes pour décider du statut
  const { count: totalEtapes } = await supabase.from('etapes_formation')
    .select('id', { count: 'exact', head: true }).eq('guide_id', p.guide_id)
  const { count: totalQuestions } = await supabase.from('quiz_questions')
    .select('id', { count: 'exact', head: true }).eq('guide_id', p.guide_id)
  // Un guide de PRATIQUE (simulation_config) n'est PAS validé en lisant ses étapes :
  // la réussite vient uniquement de la simulation jouée à ≥ seuil (enregistrerSimulation).
  const { data: guideRow } = await supabase.from('guides_formation')
    .select('simulation_config').eq('id', p.guide_id).maybeSingle()
  const aSimulation = !!guideRow?.simulation_config

  const toutesVues = (totalEtapes ?? 0) > 0 && nouvelles.length >= (totalEtapes ?? 0)
  const nouveauStatut = toutesVues
    ? ((totalQuestions ?? 0) > 0 || aSimulation ? 'quiz_a_passer' : 'reussi')
    : 'en_cours'

  const { error } = await supabase.from('progressions_formation').update({
    etapes_vues_ids: nouvelles,
    statut: nouveauStatut,
    termine_le: nouveauStatut === 'reussi' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', prog.id)
  if (error) throw new Error(error.message)
  revalidatePath('/formation')
  revalidatePath(`/formation/${p.guide_id}`)
  return { ok: true as const, deja_vu: false, statut: nouveauStatut }
}

// ─── Soumettre quiz ───────────────────────────────────────────────
const soumettreQuizSchema = z.object({
  guide_id:   z.string().uuid(),
  employe_id: z.string().uuid(),
  // Réponses associées aux question_ids vues (quiz adaptatif).
  // Format : [{ question_id: uuid, reponse_idx: 0..n }]
  reponses_par_question: z.array(z.object({
    question_id: z.string().uuid(),
    reponse_idx: z.number().int().min(0),
  })),
})

export async function soumettreQuiz(input: unknown): Promise<{
  score_pct: number; bonnes: number; total: number; statut: 'reussi' | 'echoue'; seuil: number
}> {
  const p = soumettreQuizSchema.parse(input)
  await autoriserActionPourEmploye(p.employe_id)
  const supabase = await createClient()
  const prog = await getOuCreerProgression(p.guide_id, p.employe_id)

  // Anti-spam : 1 tentative / 24 h
  const peut = peutRetenter(prog)
  if (!peut.ok) throw new Error(`Vous pourrez retenter dans ${peut.prochaine_tentative_dans_h ?? 24} h.`)

  // Récupère SEULEMENT les questions vues + seuil
  const questionIds = p.reponses_par_question.map(r => r.question_id)
  const [questionsRes, guideRes] = await Promise.all([
    supabase.from('quiz_questions').select('*').in('id', questionIds),
    supabase.from('guides_formation').select('seuil_reussite_pct').eq('id', p.guide_id).single(),
  ])
  const questions = (questionsRes.data ?? []) as unknown as Question[]
  const seuil = (guideRes.data?.seuil_reussite_pct as number) ?? 80
  if (questions.length === 0) throw new Error('Aucune question pour ce guide')

  // Compte bonnes réponses en matchant question_id
  const qById = new Map(questions.map(q => [q.id, q]))
  let bonnes = 0
  for (const r of p.reponses_par_question) {
    const q = qById.get(r.question_id)
    if (q && r.reponse_idx === q.bonne_reponse_idx) bonnes++
  }
  const total = p.reponses_par_question.length
  const score_pct = total > 0 ? Math.round((bonnes / total) * 100) : 0
  const statut = statutApresQuiz(score_pct, seuil)

  const { error } = await supabase.from('progressions_formation').update({
    dernier_score_pct: score_pct,
    derniere_tentative_le: new Date().toISOString(),
    statut,
    termine_le: statut === 'reussi' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', prog.id)
  if (error) throw new Error(error.message)

  // ── Palier de gérance atteint ? ─────────────────────────────────
  // Le moment où le fait devient vrai est CELUI-CI : un quiz vient d'être
  // réussi. On l'enregistre ici plutôt qu'à l'affichage, parce qu'une date
  // de certification ne se recalcule pas — l'état d'avancement, lui, se
  // recalcule très bien et n'est donc stocké nulle part.
  //
  // ⚠️ Best-effort : un échec d'écriture ne doit JAMAIS faire échouer un quiz
  // réussi. La personne a répondu juste ; lui rendre une erreur parce qu'une
  // ligne annexe n'a pas pu s'écrire serait absurde.
  if (statut === 'reussi') {
    try { await enregistrerPaliersAtteints(prog.employe_id as string) } catch { /* ignore */ }
  }

  revalidatePath('/formation')
  revalidatePath(`/formation/${p.guide_id}`)
  revalidatePath('/mon-espace')
  return { score_pct, bonnes, total, statut, seuil }
}

/**
 * Enregistre les certifications des paliers désormais complets.
 *
 * Idempotent par construction : la contrainte `unique (employe_id, poste)`
 * refuse un doublon, et on n'insère que ce qui manque. Repasser un quiz ne
 * réécrit donc jamais une date de certification déjà acquise — c'est le
 * premier passage qui compte.
 */
async function enregistrerPaliersAtteints(employeId: string) {
  const supabase = await createClient()
  const [progRes, guidesRes, certifsRes] = await Promise.all([
    supabase.from('progressions_formation')
      .select('guide_id, statut, dernier_score_pct').eq('employe_id', employeId),
    supabase.from('guides_formation').select('id, titre'),
    supabase.from('certifications').select('poste').eq('employe_id', employeId),
  ])
  const titres = new Map((guidesRes.data ?? []).map(g => [g.id as string, String(g.titre)]))
  const reussis = (progRes.data ?? []).filter(p => p.statut === 'reussi')
  const titresReussis = reussis.map(p => titres.get(p.guide_id as string) ?? '').filter(Boolean)
  const deja = new Set((certifsRes.data ?? []).map(c => String(c.poste)))

  const aCreer = etatPaliers(titresReussis)
    .filter(e => e.atteint && !deja.has(e.palier.cle))
    .map(e => {
      // Score du palier = moyenne des quiz qui le composent. Un palier
      // obtenu de justesse et un palier obtenu haut la main ne racontent
      // pas la même chose au moment de décider d'une promotion.
      const scores = reussis
        .filter(p => e.palier.guides.includes(titres.get(p.guide_id as string) ?? ''))
        .map(p => Number(p.dernier_score_pct ?? 0))
      const moyenne = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : 0
      return { employe_id: employeId, poste: e.palier.cle, score_pct: moyenne }
    })

  if (aCreer.length > 0) await supabase.from('certifications').insert(aCreer)
}

// ─── Terminer l'onboarding ────────────────────────────────────────
// Marque profils.onboarding_completed_at = now(). Conditions :
//  - Profil connecté (sinon erreur)
//  - Manager : passe-droit (ne devrait pas arriver, on tolère)
//  - Employé : doit avoir AU MOINS UNE progression statut='reussi' (sinon refus)
export async function terminerOnboarding(): Promise<{ ok: true; mainRoute: string }> {
  const profil = await getProfile()
  if (!profil) throw new Error('Non connecté.')

  if (profil.role !== 'manager' && profil.employe_id) {
    const supabase = await createClient()
    const { count } = await supabase.from('progressions_formation')
      .select('id', { count: 'exact', head: true })
      .eq('employe_id', profil.employe_id)
      .eq('statut', 'reussi')
    if ((count ?? 0) === 0) {
      throw new Error('Tu dois d\'abord réussir ton quiz.')
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profils')
    .update({ onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', profil.id)
  if (error) throw new Error(error.message)

  revalidatePath('/formation')
  revalidatePath('/formation/onboarding')
  return { ok: true as const, mainRoute: getMainRoute(profil.poste) }
}

// ─── Action serveur de redirection post-onboarding ────────────────
// Wrapper utilisé par le bouton form action pour rediriger côté server.
export async function terminerEtRediriger() {
  const r = await terminerOnboarding()
  redirect(r.mainRoute)
}
