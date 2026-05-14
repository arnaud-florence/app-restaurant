// Script seed : génère le contenu de formation niveau 1/2/3 pour 8 postes
// via Claude haiku-4-5.
//
//   node scripts/seed-formation-niveaux.mjs
//
// Pour chaque poste, crée :
//   - 1 guide NIVEAU 2 (simulation : checklist_simule OU scenario_qcm)
//   - 1 guide NIVEAU 3 (quiz final certification, 10 questions QCM)
//
// Idempotent : skip les guides déjà créés (UNIQUE par titre).
//
// Coût estimé : ~$0.30 total (16 appels Claude haiku × ~$0.02 chacun).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ─── Charge .env.local ────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  const v = m[2].replace(/^['"]|['"]$/g, '').trim()
  if (!v) continue
  process.env[m[1]] = v
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── 8 postes selon la vision du gérant ────────────────────────────
const POSTES = [
  {
    code: 'cuisinier', label: 'Cuisinier', emoji: '👨‍🍳',
    description: 'Prépare les plats commandés à partir des commandes affichées sur l\'écran /cuisine.',
    competences: [
      'Utiliser l\'écran /cuisine au quotidien',
      'Comprendre les 5 statuts de commande',
      'Faire un relevé de température',
      'Valider une checklist d\'ouverture/fermeture',
      'Signaler une rupture de stock',
      'Saisir les invendus en fin de service',
      'Respecter les règles HACCP essentielles',
    ],
  },
  {
    code: 'pizzaiolo', label: 'Pizzaïolo', emoji: '🍕',
    description: 'Gère la fabrication des pizzas dans la colonne pizza de l\'écran /cuisine.',
    competences: [
      'Connaître la carte des 13 pizzas et leurs ingrédients',
      'Utiliser la colonne pizza sur /cuisine',
      'Gérer le stock d\'ingrédients pizza',
      'Respecter les règles HACCP spécifiques pizza',
      'Saisir les invendus pizza',
    ],
  },
  {
    code: 'serveur', label: 'Serveur', emoji: '🍽',
    description: 'Accueille les clients, prend les commandes via /serveur, encaisse les additions.',
    competences: [
      'Utiliser le plan de salle sur /serveur',
      'Prendre une commande étape par étape',
      'Envoyer une commande en cuisine et au bar',
      'Suivre le statut des plats en temps réel',
      'Encaisser une addition simple, mixte, divisée',
      'Gérer les allergies client',
      'Consulter les réservations du jour',
    ],
  },
  {
    code: 'barman', label: 'Barman', emoji: '🍷',
    description: 'Prépare les boissons commandées depuis l\'écran /bar.',
    competences: [
      'Connaître la carte des boissons et cocktails',
      'Utiliser l\'écran /bar',
      'Gérer le stock boissons',
      'Respecter les règles HACCP bar',
      'Connaître les règles de la licence IV',
    ],
  },
  {
    code: 'snacking', label: 'Encaissement snacking', emoji: '🥪',
    description: 'Prend les commandes snacking au comptoir et gère les commandes en ligne.',
    competences: [
      'Connaître la carte snacking (burgers, tacos, paninis)',
      'Prendre une commande tacos personnalisée',
      'Utiliser la caisse tactile sur /emporter',
      'Gérer les commandes en ligne (badge ONLINE)',
      'Gérer les commandes à emporter',
    ],
  },
  {
    code: 'livreur', label: 'Livreur', emoji: '🛵',
    description: 'Effectue les livraisons depuis l\'écran /livreur.',
    competences: [
      'Consulter les commandes à livrer',
      'Marquer une commande comme livrée',
      'Saisir le kilométrage',
      'Suivre les procédures en cas de problème de livraison',
    ],
  },
  {
    code: 'receptionniste', label: 'Réceptionniste', emoji: '🛏',
    description: 'Gère les réservations chambres et les arrivées/départs sur /reception.',
    competences: [
      'Gérer les réservations chambres',
      'Faire un check-in et check-out',
      'Gérer les demandes d\'événements',
      'Générer une facture client',
    ],
  },
  {
    code: 'second', label: 'Second de cuisine', emoji: '🥘',
    description: 'Assiste le cuisinier, supervise la mise en place.',
    competences: [
      'Mise en place avant service',
      'Gestion des stocks frais',
      'Encadrement de l\'équipe cuisine',
      'Contrôle qualité des plats',
    ],
  },
]

let logs = { ok: 0, skip: 0, fail: 0 }

// ─── Helpers Claude pour générer chaque type de contenu ─────────────
async function generer(systemPrompt, userPrompt) {
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const text = resp.content.find(c => c.type === 'text')?.text ?? ''
  // Extrait le JSON même si Claude ajoute du texte autour
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!m) throw new Error('Pas de JSON dans la réponse Claude : ' + text.slice(0, 200))
  return JSON.parse(m[0])
}

// ─── Génère un guide NIVEAU 2 (simulation) ──────────────────────────
async function genererSimulation(poste) {
  const system = `Tu génères du contenu pédagogique de simulation pour la formation de salariés en restaurant.
Tu réponds en JSON STRICT, sans préambule. Le français doit être simple, direct, professionnel.`

  const userPrompt = `Génère une simulation de NIVEAU 2 "Je pratique" pour le poste "${poste.label}" (${poste.description}).

Compétences à exercer :
${poste.competences.map(c => '- ' + c).join('\n')}

Choisis le type le plus adapté entre :
- "checklist_simule" : l'employé doit cocher des actions dans le bon ordre (idéal pour ouverture/fermeture, check-in)
- "scenario_qcm" : l'employé répond à des scénarios à choix multiples (idéal pour gestion d'imprévus, prises de décision)

Format JSON :
{
  "titre": "...",
  "description": "Brève description (1 phrase)",
  "duree_minutes": 10,
  "config": {
    "type": "checklist_simule" | "scenario_qcm",
    "titre": "...",
    "introduction": "1-2 phrases pour planter le contexte",
    "actions": [...]  // si checklist_simule
    "scenarios": [...] // si scenario_qcm
  }
}

Si "checklist_simule" : 6 à 10 actions, chacune : { "label": "...", "ordre_attendu": 1, "obligatoire": true|false, "feedback_ok": "...", "feedback_ko": "..." }
Si "scenario_qcm" : 5 à 7 scénarios, chacun : { "situation": "...", "choix": ["...", "...", "..."], "bonne_reponse": 0, "explication": "..." }`

  return await generer(system, userPrompt)
}

// ─── Génère un guide NIVEAU 3 (quiz final certification) ────────────
async function genererQuizCert(poste) {
  const system = `Tu génères des quiz QCM pour certifier des salariés en restaurant.
Tu réponds en JSON STRICT, sans préambule. Les questions doivent être pratiques, ancrées dans le quotidien du poste.`

  const userPrompt = `Génère un QUIZ FINAL de certification (10 questions QCM) pour le poste "${poste.label}".

Compétences à valider :
${poste.competences.map(c => '- ' + c).join('\n')}

Format JSON :
{
  "titre": "Quiz final certification ${poste.label}",
  "description": "10 questions, seuil 80% pour obtenir la certification",
  "questions": [
    {
      "question": "...",
      "choix": ["...", "...", "...", "..."],
      "bonne_reponse_idx": 0,
      "explication": "Pourquoi cette réponse est correcte"
    }
  ]
}

Mélange : 3-4 questions sur procédures, 3-4 sur règles HACCP/sécurité, 2-3 sur utilisation de l'app.`

  return await generer(system, userPrompt)
}

// ─── Insère un guide en DB ─────────────────────────────────────────
async function insererGuideNiveau2(poste, generated) {
  // Skip si déjà créé (idempotent)
  const { data: existant } = await sb.from('guides_formation')
    .select('id')
    .eq('poste', poste.code === 'snacking' ? 'autre' : (poste.code === 'second' ? 'cuisine' : (poste.code === 'receptionniste' ? 'autre' : poste.code)))
    .eq('niveau', 2)
    .ilike('titre', generated.titre)
    .maybeSingle()
  if (existant) { logs.skip++; console.log('  skip niveau 2 : ' + generated.titre); return }

  // poste valide pour le schéma (constraint enum)
  const posteValide = mapPosteSchema(poste.code)

  const { data: guide, error } = await sb.from('guides_formation').insert({
    titre: generated.titre,
    description: generated.description ?? null,
    poste: posteValide,
    niveau: 2,
    points: 30,
    seuil_reussite_pct: 80,
    duree_minutes: generated.duree_minutes ?? 10,
    ordre: 200 + Math.floor(Math.random() * 100),
    actif: true,
    simulation_config: generated.config,
  }).select('id').single()
  if (error) { logs.fail++; console.log('  ✗ niveau 2 : ' + error.message); return }

  // 1 étape d'intro qui pointe vers la simulation
  await sb.from('etapes_formation').insert({
    guide_id: guide.id,
    ordre: 1,
    titre: 'Lance la simulation',
    contenu: `## ${generated.titre}\n\n${generated.config?.introduction ?? generated.description}\n\n👉 [Lancer la simulation](/formation/${guide.id}/simulation)`,
  })
  logs.ok++
  console.log('  ✓ niveau 2 créé : ' + generated.titre)
}

async function insererGuideNiveau3(poste, generated) {
  const { data: existant } = await sb.from('guides_formation')
    .select('id')
    .eq('poste', mapPosteSchema(poste.code))
    .eq('niveau', 3)
    .ilike('titre', generated.titre)
    .maybeSingle()
  if (existant) { logs.skip++; console.log('  skip niveau 3 : ' + generated.titre); return }

  const { data: guide, error } = await sb.from('guides_formation').insert({
    titre: generated.titre,
    description: generated.description ?? '10 questions, seuil 80% pour obtenir la certification',
    poste: mapPosteSchema(poste.code),
    niveau: 3,
    points: 100,
    seuil_reussite_pct: 80,
    duree_minutes: 15,
    ordre: 300 + Math.floor(Math.random() * 100),
    actif: true,
  }).select('id').single()
  if (error) { logs.fail++; console.log('  ✗ niveau 3 : ' + error.message); return }

  // 1 étape d'intro
  await sb.from('etapes_formation').insert({
    guide_id: guide.id,
    ordre: 1,
    titre: 'Avant le quiz final',
    contenu: `## Quiz de certification ${poste.label}\n\nTu vas répondre à 10 questions sur les compétences clés du poste.\nUn score de **80% minimum** est requis pour obtenir la certification.\n\nBonne chance ! 🎯`,
  })

  // Insert questions du quiz
  for (let i = 0; i < generated.questions.length; i++) {
    const q = generated.questions[i]
    await sb.from('quiz_questions').insert({
      guide_id: guide.id,
      ordre: i + 1,
      question: q.question,
      choix: q.choix,
      bonne_reponse_idx: q.bonne_reponse_idx,
      explication: q.explication ?? null,
    })
  }
  logs.ok++
  console.log('  ✓ niveau 3 créé : ' + generated.titre + ' (' + generated.questions.length + ' Q)')
}

// Le schéma actuel a une contrainte CHECK sur poste : (cuisine,pizzaiolo,bar,salle,serveur,manager,plonge,autre,tous).
// On mappe nos 8 postes "logiques" vers les valeurs autorisées par le check.
function mapPosteSchema(code) {
  switch (code) {
    case 'cuisinier':       return 'cuisine'
    case 'pizzaiolo':       return 'pizzaiolo'
    case 'serveur':         return 'serveur'
    case 'barman':          return 'bar'
    case 'snacking':        return 'autre'    // pas de valeur dédiée
    case 'livreur':         return 'autre'
    case 'receptionniste':  return 'autre'
    case 'second':          return 'cuisine'
    default:                return 'autre'
  }
}

// ─── Main ────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║  Seed formation niveaux 2 (simulations) + 3 (cert)       ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')

for (const poste of POSTES) {
  console.log(`\n→ ${poste.emoji} ${poste.label}`)
  try {
    const sim = await genererSimulation(poste)
    await insererGuideNiveau2(poste, sim)
  } catch (e) {
    logs.fail++
    console.log('  ✗ niveau 2 erreur génération : ' + e.message)
  }
  try {
    const quiz = await genererQuizCert(poste)
    await insererGuideNiveau3(poste, quiz)
  } catch (e) {
    logs.fail++
    console.log('  ✗ niveau 3 erreur génération : ' + e.message)
  }
}

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log(`║ ${logs.ok} guides créés · ${logs.skip} déjà existants (skip) · ${logs.fail} échecs    ║`)
console.log('╚══════════════════════════════════════════════════════════╝')
