// Crée un employé en un seul coup :
//   1. Fiche dans `employes`
//   2. Compte Auth Supabase (besoin SUPABASE_SERVICE_ROLE_KEY)
//   3. Profil dans `profils` lié avec rôle 'employe' + poste
//
// Usage interactif :
//   node scripts/create-employe.mjs
//
// Usage en argv :
//   node scripts/create-employe.mjs --prenom=Thomas --nom=Dupond --email=thomas@... --poste=cuisinier --password=Casa2026!

import { readFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local')
  process.exit(1)
}

// Détecte si la "service_role" est en fait l'anon key (erreur courante)
try {
  const payload = JSON.parse(Buffer.from(SERVICE_KEY.split('.')[1], 'base64').toString())
  if (payload.role !== 'service_role') {
    console.error(`❌ SUPABASE_SERVICE_ROLE_KEY contient un JWT avec role="${payload.role}" au lieu de "service_role".`)
    console.error('   → Va sur https://supabase.com/dashboard/project/ftnasfezxysyaooeyvwq/settings/api')
    console.error('   → Copie la clé "service_role" (PAS la "anon") et colle-la dans .env.local')
    process.exit(1)
  }
} catch (e) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY mal formé :', e.message)
  process.exit(1)
}

const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ─── Parsing argv ─────────────────────────────────────────────────
const args = {}
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.+)$/)
  if (m) args[m[1]] = m[2]
}

const VALID_POSTES = ['gerant', 'serveur', 'cuisinier', 'pizzaiolo', 'barman', 'receptionniste', 'second', 'plonge', 'autre']

async function prompt(label, def, validate) {
  const rl = readline.createInterface({ input, output })
  while (true) {
    const v = (await rl.question(`${label}${def ? ` [${def}]` : ''} : `)).trim() || def || ''
    if (!v) { console.log('  → champ requis'); continue }
    if (validate) {
      const err = validate(v)
      if (err) { console.log(`  → ${err}`); continue }
    }
    rl.close()
    return v
  }
}

// ─── Récupération des champs ─────────────────────────────────────
const prenom = args.prenom ?? await prompt('Prénom')
const nom    = args.nom    ?? await prompt('Nom')
const email  = args.email  ?? await prompt('Email', null, v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'email invalide')
const poste  = args.poste  ?? await prompt(`Poste (${VALID_POSTES.join('/')})`, null, v => VALID_POSTES.includes(v) ? null : 'poste invalide')
const password = args.password ?? await prompt('Mot de passe initial (≥6 car.)', 'Casa2026!', v => v.length >= 6 ? null : 'min 6 caractères')

console.log('\n→ Création de :')
console.log(`  • ${prenom} ${nom}`)
console.log(`  • ${email}`)
console.log(`  • poste : ${poste}`)
console.log(`  • mdp initial : ${password}`)

// Vérifie qu'un email identique n'existe pas déjà
const { data: existing } = await sb.from('employes').select('id, prenom, nom').eq('email', email).maybeSingle()
if (existing) {
  console.error(`\n❌ Un employé existe déjà avec ${email} (${existing.prenom} ${existing.nom}, id=${existing.id.slice(0, 8)}).`)
  process.exit(1)
}

// ─── 1. Insère la fiche employes ─────────────────────────────────
console.log('\n→ Étape 1 : insertion dans `employes`…')
const { data: emp, error: e1 } = await sb
  .from('employes')
  .insert({ prenom, nom, email, poste, actif: true })
  .select('id')
  .single()
if (e1) { console.error('  ❌', e1.message); process.exit(1) }
console.log(`  ✓ fiche employes créée : ${emp.id}`)

// ─── 2. Crée le compte Auth Supabase ─────────────────────────────
console.log('\n→ Étape 2 : création compte Auth Supabase…')
const { data: authData, error: e2 } = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // bypass email confirmation
  user_metadata: { prenom, nom, poste },
})
if (e2) {
  console.error('  ❌', e2.message)
  console.error('  ⚠ Rollback : suppression de la fiche employes…')
  await sb.from('employes').delete().eq('id', emp.id)
  process.exit(1)
}
const userId = authData.user.id
console.log(`  ✓ Auth user créé : ${userId}`)

// ─── 3. Crée le profil lié ───────────────────────────────────────
console.log('\n→ Étape 3 : création profil lié…')
// Le profil peut déjà avoir été créé par un trigger / getProfile() lors d'une signup
// Sinon on l'insère manuellement
const { data: existingProfil } = await sb.from('profils').select('id').eq('id', userId).maybeSingle()
if (existingProfil) {
  const { error: e3 } = await sb.from('profils')
    .update({ employe_id: emp.id, role: 'employe', poste, email })
    .eq('id', userId)
  if (e3) { console.error('  ❌', e3.message); process.exit(1) }
  console.log(`  ✓ profil mis à jour avec employe_id`)
} else {
  const { error: e3 } = await sb.from('profils').insert({
    id: userId,
    email,
    role: 'employe',
    poste,
    employe_id: emp.id,
  })
  if (e3) { console.error('  ❌', e3.message); process.exit(1) }
  console.log(`  ✓ profil créé`)
}

// ─── Récap ───────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log(`✅ ${prenom} ${nom} créé(e) avec succès`)
console.log('\nIdentifiants à transmettre :')
console.log(`  URL      : https://app-restaurant-livid.vercel.app/login`)
console.log(`  Email    : ${email}`)
console.log(`  Password : ${password}`)
console.log(`\n💡 À la 1ère connexion il/elle sera redirigé(e) vers /formation/onboarding`)
