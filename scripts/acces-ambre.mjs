// Fiche employée + accès d'Ambre (manageuse), en prise en main.
//
// Deux temps, parce que je ne crée pas de compte à la place de quelqu'un :
//
//  1. CE SCRIPT crée la fiche employée. Rejouable.
//  2. AMBRE s'inscrit elle-même sur /login avec son email. Le premier profil
//     créé après celui du gérant arrive en rôle `employe` — c'est voulu.
//  3. ON REJOUE CE SCRIPT avec --email=… : il rattache le profil à la fiche
//     et pose les permissions de prise en main.
//
// ── Pourquoi pas « manager » tout de suite ──────────────────────────
//
// Ce n'est pas une question de confiance. Le poste `manager` porte
// `allowed: ['*']` et COURT-CIRCUITE tout le système de permissions :
// `isReadOnly()` rend false avant même de lire `custom_permissions`. Un
// réglage « lecture seule » posé sur un manager est purement ignoré.
//
// Or trois écrans se trompent EN SILENCE — l'erreur y ressemble à une
// réussite, et c'est ça qu'on veut couvrir le temps de la prise en main :
//
//   /admin/allergenes   valider = signer une déclaration légale nominative.
//                       Signer « Viennoiserie » telle qu'elle est proposée
//                       déclare qu'un croissant ne contient PAS de lait.
//   /admin/fournisseurs scanner une facture écrit les prix d'achat. A déjà
//                       produit un croissant à 40 € de coût, et des marges
//                       fausses pendant des jours sans une seule erreur.
//   /admin/recettes     un prix poussé vers Zelty est un UPSERT : un objet
//                       incomplet écrase le prix imprimé sur les tickets.
//
// ── Ce qui reste GRAND OUVERT, et c'est le point ────────────────────
//
// Toute la LECTURE, y compris l'argent : ventes, marges, food cost,
// trésorerie, patrimoine. Ambre entre au capital et sera payée sur le
// résultat — lui cacher ces écrans serait le mauvais signal, et
// l'empêcherait de comprendre ce sur quoi on la juge. Elle voit les
// chiffres avant de pouvoir les modifier, pas l'inverse.
//
//   node scripts/acces-ambre.mjs [--email=…] [--ecrire]

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const EMAIL = (process.argv.find(a => a.startsWith('--email=')) ?? '').slice(8).trim().toLowerCase()
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

// `polyvalent` sert de socle : il ouvre les écrans de service. Tout le reste
// est ajouté explicitement ici, pour que la liste se lise comme une décision
// et non comme un héritage.
const ECRITURE = [
  // La caisse s'apprend sur la caisse ; ici, ce sont les gestes du comptoir.
  '/comptoir', '/inventaire', '/invendus', '/ruptures', '/cuisine', '/bar',
  '/equipes', '/mon-espace', '/formation',
  // Le journal de bord : écrire ses observations dès le premier jour est
  // précisément ce qu'on attend d'une manageuse qui découvre.
  '/admin/journal',
]

const LECTURE = [
  // ⚠️ /admin/cat est le CENTRE DE CONTRÔLE : la carte des 49 modules avec
  // leur état en direct, une recherche, un plan imprimable — déjà filtrée par
  // rôle. C'est littéralement l'écran conçu pour comprendre ce que l'outil
  // contient, et il était le SEUL fermé à quelqu'un qui doit l'apprendre.
  // Sans lui, elle n'a pas la carte du territoire.
  //
  // ⚠️ NE JAMAIS mettre '/admin' seul ici : `pathMatchPrefix` matche par
  // PRÉFIXE, donc '/admin' ouvrirait TOUT /admin/* d'un coup — sécurité,
  // journal d'audit et assistant de configuration compris. Vécu le
  // 28/08/2026 : les 23 écrans volontairement fermés sont passés à 0 en
  // une ligne, sans le moindre message. On liste écran par écran.
  '/admin/cat',
  // Le métier de gérante, et ces quatre-là contiennent déjà des données :
  // 9 lignes de charges fixes, 9 challenges, 6 chambres, l'équipe en direct.
  // On ne dirige pas sans connaître sa structure de coûts.
  '/admin/economie', '/admin/challenges', '/admin/chambres', '/admin/supervision',
  // Le co-gérant : l'écran qui PROPOSE des décisions — un plat avec son food
  // cost calculé, un chantier audité. C'est le meilleur écran pour apprendre
  // à arbitrer, et il est en lecture : on regarde comment une décision se
  // construit avant d'en prendre une. Ses actions restent manager-only.
  '/admin/co-gerant',
  // L'argent, en entier. C'est le cœur de la décision.
  '/admin/ventes', '/admin/ventes-pdv', '/admin/finances', '/admin/patrimoine',
  '/admin/pilotage', '/admin/previsionnel', '/admin/commande-fournil',
  '/admin/integrations', '/admin/caisse-agreee',
  // Le métier, en lecture : comprendre avant de modifier.
  '/admin/recettes', '/admin/ingredients', '/admin/stock', '/admin/boissons',
  '/admin/fournisseurs', '/admin/allergenes', '/admin/hygiene', '/admin/legal',
  '/admin/rh', '/admin/clients', '/admin/correspondances', '/admin/etablissements',
  '/admin/assistant', '/admin/formation', '/admin/maintenance', '/admin/dechets',
]

const PERMS = { allowed: [...ECRITURE, ...LECTURE], readonly: LECTURE }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)

// ── 1. La fiche employée ────────────────────────────────────────────
const dejaEmp = await sb('employes?select=id,prenom,nom,poste,email&prenom=ilike.Ambre')
let empId = dejaEmp[0]?.id ?? null
if (empId) {
  console.log(`  fiche employée : déjà présente (${dejaEmp[0].prenom} ${dejaEmp[0].nom ?? ''}, ${dejaEmp[0].poste})`)
} else if (ECRIRE) {
  const c = await sb('employes', {
    method: 'POST',
    body: JSON.stringify({
      prenom: 'Ambre', nom: '', poste: 'manager', type_contrat: 'CDI',
      actif: true, heures_contrat: 35, email: EMAIL || null,
      // Ni salaire ni date d'embauche : ce sont des données contractuelles,
      // elles se saisissent dans /admin/rh par qui les connaît.
      notes_internes: "Manageuse. Prise en main de l'outil et de la caisse — "
        + "permissions volontairement en lecture sur les écrans qui écrivent "
        + "(allergènes, factures, catalogue). À passer manager quand elle le demande.",
    }),
  })
  empId = c[0].id
  console.log('  ✓ fiche employée créée')
} else {
  console.log('  fiche employée : À CRÉER')
}

// ── 2. Le compte, s'il existe ───────────────────────────────────────
const profils = await sb('profils?select=id,email,role,poste,employe_id')
const p = EMAIL ? profils.find(x => String(x.email).toLowerCase() === EMAIL) : null

console.log(`\n  comptes existants : ${profils.map(x => `${x.email} (${x.role})`).join(', ')}`)

if (!EMAIL) {
  console.log(`\n  ⚠️ Pas d'email fourni. Étapes :`)
  console.log(`     1. Ambre s'inscrit elle-même sur /login (elle choisit son mot de passe).`)
  console.log(`     2. Relancer :  node scripts/acces-ambre.mjs --email=son@email --ecrire`)
} else if (!p) {
  console.log(`\n  ⚠️ Aucun compte pour ${EMAIL}. Elle doit d'abord s'inscrire sur /login.`)
} else {
  console.log(`\n  compte trouvé : ${p.email} — rôle ${p.role}, poste ${p.poste ?? '—'}`)
  console.log(`  → poste « polyvalent » + ${PERMS.allowed.length} écrans ouverts, dont ${PERMS.readonly.length} en lecture seule`)
  if (ECRIRE) {
    await sb('profils?id=eq.' + p.id, {
      method: 'PATCH',
      body: JSON.stringify({ poste: 'polyvalent', employe_id: empId, custom_permissions: PERMS }),
    })
    console.log('  ✓ permissions posées')
  }
}

console.log(`\n── ce qui est OUVERT en écriture (${ECRITURE.length}) ──`)
console.log('  ' + ECRITURE.join('  '))
console.log(`\n── ce qui est ouvert en LECTURE SEULE (${LECTURE.length}) ──`)
console.log('  ' + LECTURE.join('  '))
console.log(`\n── ce qui reste FERMÉ ──`)
console.log('  /admin/securite (comptes, rôles, journal d\'audit) — c\'est le geste du gérant.')
console.log(`\n  Pour passer Ambre manager le jour venu :`)
console.log(`    /admin/securite → onglet Profils → rôle « manager », et effacer custom_permissions.`)

if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)\n')
