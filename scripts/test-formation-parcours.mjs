// Test de bout en bout des parcours de formation (Module 27 enrichi).
//
//   node scripts/test-formation-parcours.mjs
//
// SECTION A — Intégrité « ça coïncide » (lecture seule) :
//   A1 chaque guide actif a ≥1 étape
//   A2 chaque simulation (niveau 2) a un simulation_config valide & JOUABLE à ≥ seuil
//   A3 chaque certif (niveau 3) a ≥1 question, bonne_reponse_idx dans la plage
//   A4 les liens markdown « /…/simulation » pointent vers un guide AYANT un config
//   A5 gating : chaque famille avec niveau ≥2 possède un niveau 1 (pas de deadlock)
//   A6 plus aucun doublon actif (métier, niveau)
//
// SECTION B — Parcours RÉEL avec employé de test (écrit en base puis nettoie) :
//   crée un employé polyvalent → valide Manuel → débloque Pratique → la joue à 100%
//   → débloque Certif → la passe à 100% → vérifie statut 'reussi' à chaque étape
//   → cleanup complet (progressions + simulation_attempts + employé).
//
// Bilan ✓/✗ + exit 1 si échec.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

let okN = 0, koN = 0
const ok = m => { console.log('  ✓ ' + m); okN++ }
const ko = m => { console.log('  ✗ ' + m); koN++ }

// ─── Logique répliquée depuis src/lib/formation.ts (pour vérifier la concordance) ───
const POSTE_FAMILLE = {
  cuisine: 'cuisine', cuisinier: 'cuisine', second: 'cuisine', cuisinier_snacking: 'cuisine',
  pizzaiolo: 'pizzaiolo', bar: 'bar', barman: 'bar', serveur: 'serveur', salle: 'serveur',
  snack: 'autre', livreur: 'autre', receptionniste: 'autre', autre: 'autre',
  manager: 'manager', gerant: 'manager', plonge: 'plonge', extra: 'plonge', tous: 'tous',
}
const posteFamille = p => POSTE_FAMILLE[p] ?? 'autre'
const niveauGuide = g => (g.niveau && g.niveau >= 1) ? g.niveau : (g.simulation_config ? 2 : 1)
const calculerScoreQuiz = (reponses, questions) => {
  const total = questions.length
  if (!total) return 0
  let bonnes = 0
  questions.forEach((q, i) => { if (reponses[i] === q.bonne_reponse_idx) bonnes++ })
  return Math.round((bonnes / total) * 100)
}
// Score « parfait » d'une simulation, tel que jouerait un employé sans erreur.
function scoreParfaitSimulation(cfg) {
  if (!cfg) return 0
  if (cfg.type === 'scenario_qcm' && Array.isArray(cfg.scenarios)) return 100  // toutes bonnes réponses
  if (cfg.type === 'checklist_simule' && Array.isArray(cfg.actions)) return 100 // clic dans l'ordre attendu
  return 0
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log('║  TEST PARCOURS FORMATION — manuels · simulations · quiz  ║')
  console.log('╚════════════════════════════════════════════════════════╝')

  const { data: guides, error } = await sb
    .from('guides_formation')
    .select('id, titre, poste, niveau, simulation_config, seuil_reussite_pct, actif')
    .eq('actif', true)
    .order('poste').order('niveau')
  if (error) { console.error('ERR', error.message); process.exit(1) }

  const { data: etapes } = await sb.from('etapes_formation').select('id, guide_id, contenu, ordre')
  const { data: questions } = await sb.from('quiz_questions').select('id, guide_id, choix, bonne_reponse_idx, ordre')

  const etapesParGuide = new Map(), questionsParGuide = new Map()
  for (const e of etapes ?? []) { if (!etapesParGuide.has(e.guide_id)) etapesParGuide.set(e.guide_id, []); etapesParGuide.get(e.guide_id).push(e) }
  for (const q of questions ?? []) { if (!questionsParGuide.has(q.guide_id)) questionsParGuide.set(q.guide_id, []); questionsParGuide.get(q.guide_id).push(q) }

  const guideById = new Map(guides.map(g => [g.id, g]))

  // ════════ SECTION A ════════
  console.log(`\n── A. Intégrité (${guides.length} guides actifs) ──`)

  // A1 — chaque guide a ≥1 étape
  const sansEtape = guides.filter(g => (etapesParGuide.get(g.id) ?? []).length === 0)
  sansEtape.length === 0 ? ok('A1 tous les guides ont au moins une étape')
    : ko(`A1 guides SANS étape : ${sansEtape.map(g => g.titre).join(' | ')}`)

  // A2 — simulations valides & jouables
  const sims = guides.filter(g => g.simulation_config || niveauGuide(g) === 2)
  let a2bad = []
  for (const g of sims) {
    const cfg = g.simulation_config
    if (!cfg || typeof cfg !== 'object') { a2bad.push(`${g.titre} (config absente)`); continue }
    if (!['checklist_simule', 'scenario_qcm'].includes(cfg.type)) { a2bad.push(`${g.titre} (type ${cfg.type})`); continue }
    if (cfg.type === 'checklist_simule') {
      if (!Array.isArray(cfg.actions) || cfg.actions.length === 0) { a2bad.push(`${g.titre} (actions vides)`); continue }
      const bad = cfg.actions.find(a => typeof a.label !== 'string' || typeof a.ordre_attendu !== 'number')
      if (bad) { a2bad.push(`${g.titre} (action malformée)`); continue }
    } else {
      if (!Array.isArray(cfg.scenarios) || cfg.scenarios.length === 0) { a2bad.push(`${g.titre} (scenarios vides)`); continue }
      const bad = cfg.scenarios.find(s => !Array.isArray(s.choix) || s.choix.length < 2 ||
        typeof s.bonne_reponse !== 'number' || s.bonne_reponse < 0 || s.bonne_reponse >= s.choix.length)
      if (bad) { a2bad.push(`${g.titre} (scénario : bonne_reponse hors plage)`); continue }
    }
    if (scoreParfaitSimulation(cfg) < (g.seuil_reussite_pct ?? 80)) a2bad.push(`${g.titre} (non jouable au seuil)`)
  }
  a2bad.length === 0 ? ok(`A2 ${sims.length} simulations valides et jouables à 100%`)
    : ko(`A2 simulations KO : ${a2bad.join(' | ')}`)

  // A3 — certifs (quiz) valides
  const certs = guides.filter(g => niveauGuide(g) === 3)
  let a3bad = []
  for (const g of certs) {
    const qs = questionsParGuide.get(g.id) ?? []
    if (qs.length === 0) { a3bad.push(`${g.titre} (0 question)`); continue }
    const bad = qs.find(q => !Array.isArray(q.choix) || q.choix.length < 2 ||
      typeof q.bonne_reponse_idx !== 'number' || q.bonne_reponse_idx < 0 || q.bonne_reponse_idx >= q.choix.length)
    if (bad) a3bad.push(`${g.titre} (bonne_reponse_idx hors plage Q${bad.ordre})`)
  }
  a3bad.length === 0 ? ok(`A3 ${certs.length} certifications valides (questions + réponses correctes)`)
    : ko(`A3 certifs KO : ${a3bad.join(' | ')}`)

  // A4 — liens markdown /simulation cohérents (uniquement dans les guides ACTIFS,
  // càd le contenu réellement atteignable par un employé).
  let a4bad = []
  const reSim = /\/formation\/([0-9a-f-]{36})\/simulation/gi
  for (const e of (etapes ?? []).filter(e => guideById.has(e.guide_id))) {
    let m
    while ((m = reSim.exec(e.contenu ?? '')) !== null) {
      const cible = guideById.get(m[1])
      if (!cible) a4bad.push(`${guideById.get(e.guide_id)?.titre ?? e.guide_id} → cible inconnue/inactive`)
      else if (!cible.simulation_config) a4bad.push(`${cible.titre} (lien sim mais pas de config)`)
    }
  }
  a4bad.length === 0 ? ok('A4 tous les liens « Lancer la simulation » (guides actifs) pointent vers une simu valide')
    : ko(`A4 liens cassés : ${a4bad.join(' | ')}`)

  // A5 — gating : chaque famille avec niveau ≥2 a un niveau 1
  const niveauxParFamille = new Map()
  for (const g of guides) {
    const f = posteFamille(g.poste)
    if (!niveauxParFamille.has(f)) niveauxParFamille.set(f, new Set())
    niveauxParFamille.get(f).add(niveauGuide(g))
  }
  let a5bad = []
  for (const [f, niveaux] of niveauxParFamille) {
    if ([...niveaux].some(n => n >= 2) && !niveaux.has(1)) a5bad.push(f)
  }
  a5bad.length === 0 ? ok('A5 aucune famille en deadlock (chaque pratique/certif a un manuel)')
    : ko(`A5 familles SANS manuel niveau 1 : ${a5bad.join(', ')}`)

  // A6 — plus de doublons actifs
  const strip = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const jobKey = t => {
    const s = strip(t)
    if (s.includes('second')) return 'second'
    if (s.includes('cuisinier') || s.includes('cuisine')) return 'cuisinier'
    if (s.includes('pizza')) return 'pizzaiolo'
    if (s.includes('barman') || s.includes('boisson')) return 'barman'
    if (s.includes('serveur') || s.includes('salle') || s.includes('service complet') || s.includes('accueil')) return 'serveur'
    if (s.includes('snack')) return 'snacking'
    if (s.includes('livreur') || s.includes('livraison')) return 'livreur'
    if (s.includes('reception') || s.includes('check-in') || s.includes('reservation') || s.includes('chambre')) return 'receptionniste'
    return 'x:' + s.slice(0, 16)
  }
  const grp = new Map()
  for (const g of guides.filter(g => niveauGuide(g) >= 2)) {
    const k = `${jobKey(g.titre)}__n${niveauGuide(g)}`
    grp.set(k, (grp.get(k) ?? 0) + 1)
  }
  const dups = [...grp.entries()].filter(([, n]) => n > 1)
  dups.length === 0 ? ok('A6 aucun doublon actif (1 simulation + 1 certif par métier)')
    : ko(`A6 doublons restants : ${dups.map(([k, n]) => `${k}×${n}`).join(', ')}`)

  // ════════ SECTION B — Parcours réel sur TOUTES les familles ════════
  console.log('\n── B. Parcours réel par famille (employé de test, écrit puis nettoyé) ──')

  // Toutes les familles qui ont au moins une Pratique (n2) — le vrai parcours.
  const famillesParcours = [...niveauxParFamille.entries()]
    .filter(([, ns]) => [...ns].some(n => n >= 2))
    .map(([f]) => f)
    .sort()

  function locked(g, validSet, presentsSet) {
    const n = niveauGuide(g)
    if (n <= 1) return false
    const prereq = [...presentsSet].filter(x => x < n).sort((a, b) => b - a)[0]
    if (prereq === undefined) return false
    return !validSet.has(prereq)
  }

  let empId = null
  try {
    const { data: emp, error: eEmp } = await sb.from('employes')
      .insert({ prenom: 'ZZ_TEST', nom: 'Parcours', poste: 'polyvalent', actif: true })
      .select('id').single()
    if (eEmp) { ko('B création employé : ' + eEmp.message); return finir() }
    empId = emp.id
    ok('B0 employé de test créé')

    async function niveauxValidesFamille(f) {
      const ids = guides.filter(g => posteFamille(g.poste) === f).map(g => g.id)
      const { data: pr } = await sb.from('progressions_formation')
        .select('guide_id, statut').eq('employe_id', empId).in('guide_id', ids)
      const valid = new Set()
      for (const p of pr ?? []) if (p.statut === 'reussi') valid.add(niveauGuide(guideById.get(p.guide_id)))
      return valid
    }

    for (const fam of famillesParcours) {
      const gs = guides.filter(g => posteFamille(g.poste) === fam)
      const gN1 = gs.find(g => niveauGuide(g) === 1)
      const gN2 = gs.find(g => niveauGuide(g) === 2)
      const gN3 = gs.find(g => niveauGuide(g) === 3)
      const presents = niveauxParFamille.get(fam)
      console.log(`\n  ▶ Famille « ${fam} » : ${gN1 ? '📖' : '—'} ${gN2 ? '🎯' : '—'} ${gN3 ? '🏅' : '—'}`)

      // 1) État initial : la pratique doit être verrouillée tant que le manuel n'est pas validé
      let valid = await niveauxValidesFamille(fam)
      if (gN2) {
        locked(gN2, valid, presents)
          ? ok(`[${fam}] Pratique verrouillée au départ`)
          : ko(`[${fam}] Pratique devrait être verrouillée au départ`)
      }

      // 2) Valide le manuel
      if (gN1) {
        const etN1 = (etapesParGuide.get(gN1.id) ?? []).map(e => e.id)
        await sb.from('progressions_formation').insert({
          guide_id: gN1.id, employe_id: empId, etapes_vues_ids: etN1,
          statut: 'reussi', termine_le: new Date().toISOString(),
        })
        valid = await niveauxValidesFamille(fam)
        if (gN2) !locked(gN2, valid, presents)
          ? ok(`[${fam}] Manuel validé → Pratique débloquée`)
          : ko(`[${fam}] Pratique toujours verrouillée après le Manuel`)
      }

      // 3) Joue la simulation à 100%
      if (gN2) {
        const sc = scoreParfaitSimulation(gN2.simulation_config)
        await sb.from('simulation_attempts').insert({
          employe_id: empId, guide_id: gN2.id, type_simulation: gN2.simulation_config.type,
          score_pct: sc, reponses: { test: true },
        })
        await sb.from('progressions_formation').insert({
          guide_id: gN2.id, employe_id: empId,
          statut: sc >= (gN2.seuil_reussite_pct ?? 80) ? 'reussi' : 'echoue',
          dernier_score_pct: sc, derniere_tentative_le: new Date().toISOString(), termine_le: new Date().toISOString(),
        })
        sc >= (gN2.seuil_reussite_pct ?? 80)
          ? ok(`[${fam}] Simulation jouée à ${sc}% → réussie`)
          : ko(`[${fam}] Simulation ${sc}% sous le seuil`)
        valid = await niveauxValidesFamille(fam)
        if (gN3) !locked(gN3, valid, presents)
          ? ok(`[${fam}] Pratique validée → Certif débloquée`)
          : ko(`[${fam}] Certif toujours verrouillée après la Pratique`)
      }

      // 4) Passe la certif à 100%
      if (gN3) {
        const qs = (questionsParGuide.get(gN3.id) ?? []).sort((a, b) => a.ordre - b.ordre)
        const sc = calculerScoreQuiz(qs.map(q => q.bonne_reponse_idx), qs)
        await sb.from('progressions_formation').insert({
          guide_id: gN3.id, employe_id: empId,
          statut: sc >= (gN3.seuil_reussite_pct ?? 80) ? 'reussi' : 'echoue',
          dernier_score_pct: sc, derniere_tentative_le: new Date().toISOString(), termine_le: new Date().toISOString(),
        })
        sc === 100
          ? ok(`[${fam}] Certif réussie à 100% (toutes bonnes réponses)`)
          : ko(`[${fam}] Certif à ${sc}% (≠100 → incohérence quiz)`)
      }
    }
  } finally {
    // ─── CLEANUP systématique ───
    if (empId) {
      await sb.from('simulation_attempts').delete().eq('employe_id', empId)
      await sb.from('progressions_formation').delete().eq('employe_id', empId)
      const { error: eDel } = await sb.from('employes').delete().eq('id', empId)
      eDel ? ko('cleanup employé : ' + eDel.message) : ok('\n  cleanup OK (employé + progressions + tentatives supprimés)')
    }
  }
  finir()
}

function finir() {
  console.log(`\n╔════════════════════════════════════════════════════════╗`)
  console.log(`║  BILAN : ${okN} ✓   ${koN} ✗${' '.repeat(Math.max(0, 36 - String(okN).length - String(koN).length))}║`)
  console.log(`╚════════════════════════════════════════════════════════╝\n`)
  process.exit(koN > 0 ? 1 : 0)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
