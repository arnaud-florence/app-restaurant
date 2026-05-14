// ─── Agent 15 — Formateur ─────────────────────────────────────
// Cron : chaque matin à 09h00.
//
// Mission : assurer que toute l'équipe est formée avant l'ouverture.
//
// Tâches :
//   (1) Calcule progression de chaque employé actif (% guides terminés / total disponible)
//   (2) Détecte inactivité > 7 jours en formation → finding jaune + push encouragement
//   (3) Détecte nouvelles certifs (progressions reussi non encore dans certifications) → INSERT certifs
//   (4) Attribue badge "couteau_suisse" si ≥ 3 certifs
//   (5) Attribue badge "premiere_certif" si 1 certif obtenue
//   (6) Calcule J-X avant ouverture (formation_parametres.date_ouverture). Si J-30 et progression équipe < 60% → finding rouge gérant
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/formateur

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'
import { sendPushToEmployeRateLimited } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SEUIL_INACTIVITE_JOURS = 7
const SEUIL_J30_PROGRESSION = 60       // % minimum à J-30 avant ouverture
const SEUIL_COUTEAU_SUISSE = 3         // nb certifs pour le badge

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('formateur', async (ctx) => {
    // (A) Charge employés actifs
    const { data: employes } = await ctx.supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('actif', true)

    type Emp = { id: string; prenom: string; nom: string; poste: string | null }
    const liste = (employes ?? []) as Emp[]
    if (liste.length === 0) {
      return {
        summary: 'Aucun employé actif',
        data: { nbInactifs: 0, nbNouvellesCertifs: 0, nbNouvellesBadges: 0, jX: null as number | null, recap: [] as Array<{ employe: string; progression_pct: number; certifs: number; inactif_jours: number | null }> },
      }
    }

    // (B) Charge toutes les progressions
    const { data: progs } = await ctx.supabase
      .from('progressions_formation')
      .select('employe_id, guide_id, statut, dernier_score_pct, derniere_tentative_le, termine_le, guide:guides_formation(titre, poste, niveau)')

    type Prog = {
      employe_id: string; guide_id: string; statut: string;
      dernier_score_pct: number | null; derniere_tentative_le: string | null; termine_le: string | null;
      guide: { titre: string; poste: string; niveau: number | null } | Array<{ titre: string; poste: string; niveau: number | null }> | null
    }
    const progressions = (progs ?? []) as Prog[]

    // (C) Charge guides actifs (pour calcul progression %)
    const { data: guides } = await ctx.supabase
      .from('guides_formation')
      .select('id, poste, niveau').eq('actif', true)
    const guidesTotal = guides?.length ?? 0

    // (D) Charge certifs existantes
    const { data: certifs } = await ctx.supabase
      .from('certifications')
      .select('employe_id, poste, obtenue_le')

    const certifsByEmp = new Map<string, Set<string>>()
    for (const c of (certifs ?? []) as Array<{ employe_id: string; poste: string }>) {
      const s = certifsByEmp.get(c.employe_id) ?? new Set()
      s.add(c.poste)
      certifsByEmp.set(c.employe_id, s)
    }

    // (E) Charge badges existants
    const { data: badges } = await ctx.supabase
      .from('badges_employes')
      .select('employe_id, badge_code')
    const badgesByEmp = new Map<string, Set<string>>()
    for (const b of (badges ?? []) as Array<{ employe_id: string; badge_code: string }>) {
      const s = badgesByEmp.get(b.employe_id) ?? new Set()
      s.add(b.badge_code)
      badgesByEmp.set(b.employe_id, s)
    }

    // (F) Pour chaque employé : analyse + actions
    let nbInactifs = 0
    let nbNouvellesCertifs = 0
    let nbNouvellesBadges = 0
    const recap: Array<{ employe: string; progression_pct: number; certifs: number; inactif_jours: number | null }> = []

    for (const emp of liste) {
      const progsEmp = progressions.filter(p => p.employe_id === emp.id)
      const progressionPct = guidesTotal > 0
        ? Math.round((progsEmp.filter(p => p.statut === 'reussi').length / guidesTotal) * 100)
        : 0

      // Inactivité : dernière activité (max derniere_tentative_le) > seuil
      const dernieresActivites = progsEmp
        .map(p => p.derniere_tentative_le)
        .filter(Boolean) as string[]
      const derniereActivite = dernieresActivites.sort().slice(-1)[0]
      const joursInactif = derniereActivite
        ? Math.floor((Date.now() - new Date(derniereActivite).getTime()) / 86400_000)
        : null

      if ((joursInactif === null || joursInactif > SEUIL_INACTIVITE_JOURS) && progressionPct < 100) {
        nbInactifs++
        // Push encouragement rate-limité (3/h max)
        await sendPushToEmployeRateLimited(emp.id, {
          title: '📚 Continue ta formation !',
          body:  progressionPct === 0
            ? `Bienvenue ${emp.prenom} ! Commence ta formation aujourd'hui, 15 min suffisent.`
            : `${emp.prenom}, tu es à ${progressionPct}%. Encore un peu et tu seras prêt(e) !`,
          url:   '/formation',
        }).catch(() => { /* silencieux */ })
      }

      // (F.1) Promotion progressions 'reussi' → certifications (auto-insert)
      const reussisEmp = progsEmp.filter(p => p.statut === 'reussi')
      const certifsEmp = certifsByEmp.get(emp.id) ?? new Set<string>()
      for (const r of reussisEmp) {
        const g = Array.isArray(r.guide) ? r.guide[0] : r.guide
        if (!g) continue
        const posteCertif = g.poste
        // Une seule certif par poste : on ne re-crée pas
        if (certifsEmp.has(posteCertif)) continue
        // Si l'employé a réussi le niveau 3 (ou seul niveau dispo), on certifie
        const tousLesGuidesDuPoste = guides?.filter(gp => gp.poste === posteCertif) ?? []
        const reussisDuPoste = progsEmp.filter(p => {
          const gg = Array.isArray(p.guide) ? p.guide[0] : p.guide
          return gg?.poste === posteCertif && p.statut === 'reussi'
        })
        // Critère : a réussi TOUS les guides actifs de son poste
        if (tousLesGuidesDuPoste.length > 0 && reussisDuPoste.length >= tousLesGuidesDuPoste.length) {
          const scoreMoyen = reussisDuPoste.reduce((s, p) => s + Number(p.dernier_score_pct ?? 0), 0) / reussisDuPoste.length
          const { error: certErr } = await ctx.supabase.from('certifications').insert({
            employe_id: emp.id,
            poste: posteCertif,
            score_pct: Math.round(scoreMoyen * 100) / 100,
            guide_certif_id: r.guide_id,
          })
          if (!certErr) {
            nbNouvellesCertifs++
            certifsEmp.add(posteCertif)
            // Notif employé + finding manager
            await sendPushToEmployeRateLimited(emp.id, {
              title: '🏆 Certification obtenue !',
              body:  `Bravo ${emp.prenom}, tu es maintenant certifié(e) ${posteCertif} !`,
              url:   '/formation',
            }, { force: true }).catch(() => { /* silencieux */ })
            await emitFinding(ctx, {
              urgence: 'vert',
              type: 'nouvelle_certif',
              titre: `Nouvelle certif : ${emp.prenom} ${emp.nom} → ${posteCertif}`,
              message: `Score moyen ${scoreMoyen.toFixed(1)}%. ${certifsEmp.size} certif(s) au total.`,
              action_label: 'Voir',
              action_url:   '/admin/formation',
              data: { employe_id: emp.id, poste: posteCertif, score: scoreMoyen },
            })
          }
        }
      }

      // (F.2) Badges
      const badgesEmp = badgesByEmp.get(emp.id) ?? new Set<string>()
      // premiere_certif
      if (certifsEmp.size >= 1 && !badgesEmp.has('premiere_certif')) {
        await ctx.supabase.from('badges_employes').insert({
          employe_id: emp.id,
          badge_code: 'premiere_certif',
          badge_titre: 'Première certification',
          badge_emoji: '🎯',
          description: 'Tu as obtenu ta première certification ! Bravo.',
        }).then(() => { nbNouvellesBadges++ })
      }
      // couteau_suisse (≥ 3 certifs)
      if (certifsEmp.size >= SEUIL_COUTEAU_SUISSE && !badgesEmp.has('couteau_suisse')) {
        await ctx.supabase.from('badges_employes').insert({
          employe_id: emp.id,
          badge_code: 'couteau_suisse',
          badge_titre: 'Couteau suisse',
          badge_emoji: '🔪',
          description: `Tu es certifié(e) sur ${certifsEmp.size} postes — tu peux remplacer presque tout le monde !`,
        }).then(() => { nbNouvellesBadges++ })
      }

      recap.push({
        employe: `${emp.prenom} ${emp.nom}`,
        progression_pct: progressionPct,
        certifs: certifsEmp.size,
        inactif_jours: joursInactif,
      })
    }

    // (G) Vérif J-X avant ouverture
    const { data: paramOuv } = await ctx.supabase
      .from('formation_parametres')
      .select('valeur')
      .eq('cle', 'date_ouverture')
      .maybeSingle()
    const dateOuverture = paramOuv?.valeur ? new Date(paramOuv.valeur as string) : null
    let jX = null as number | null
    if (dateOuverture) {
      jX = Math.ceil((dateOuverture.getTime() - Date.now()) / 86400_000)
      const progressionMoyenne = recap.length > 0
        ? Math.round(recap.reduce((s, r) => s + r.progression_pct, 0) / recap.length)
        : 0
      if (jX <= 30 && jX > 0 && progressionMoyenne < SEUIL_J30_PROGRESSION) {
        await emitFinding(ctx, {
          urgence: 'rouge',
          type: 'progression_equipe_basse',
          titre: `⚠️ J-${jX} avant ouverture : équipe à ${progressionMoyenne}% seulement`,
          message: `Seuil cible J-30 : ${SEUIL_J30_PROGRESSION}%. ${recap.filter(r => r.progression_pct < SEUIL_J30_PROGRESSION).length} employé(s) en retard.`,
          action_label: 'Voir progression',
          action_url:   '/admin/formation',
          data: { jX, progressionMoyenne, en_retard: recap.filter(r => r.progression_pct < SEUIL_J30_PROGRESSION).length },
        })
      }
    }

    const summary = [
      `${liste.length} employé(s)`,
      `${recap.filter(r => r.progression_pct === 100).length} à 100%`,
      nbInactifs > 0 ? `${nbInactifs} inactif(s) >${SEUIL_INACTIVITE_JOURS}j` : null,
      nbNouvellesCertifs > 0 ? `${nbNouvellesCertifs} nouvelle(s) certif(s)` : null,
      nbNouvellesBadges > 0 ? `${nbNouvellesBadges} nouveau(x) badge(s)` : null,
      jX !== null ? `J-${jX} avant ouverture` : null,
    ].filter(Boolean).join(' · ')

    return { summary, data: { nbInactifs, nbNouvellesCertifs, nbNouvellesBadges, jX, recap } }
  })

  return NextResponse.json(result)
}

export const POST = GET
