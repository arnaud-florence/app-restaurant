// Configure un employé DÉJÀ inscrit en poste « polyvalent » (accès à tous les
// postes de service + back-office opérationnel). Ne crée AUCUN compte : il faut
// que la personne se soit déjà inscrite (self-register) ou ait été invitée.
//
// Ce que fait le script (uniquement des mises à jour de données) :
//   • lie le profil à sa fiche employé (par email)
//   • profils.poste = 'polyvalent', onboarding marqué fait
//   • employes.poste = 'polyvalent', autonomie_voir_prix = true (utile en formation)
//
// Usage : node scripts/configurer-polyvalent.mjs email@employe.fr

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const email = (process.argv[2] || '').trim().toLowerCase()
const argPrenom = process.argv[3] || null
const argNom = process.argv[4] || null
if (!email) { console.error('Usage : node scripts/configurer-polyvalent.mjs email@employe.fr [Prénom] [Nom]'); process.exit(1) }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } })

// 1. Trouve le compte Auth par email (parcourt les users)
let user = null
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error('❌ listUsers :', error.message); process.exit(1) }
  user = (data?.users ?? []).find(u => (u.email ?? '').toLowerCase() === email) ?? null
  if (!data || data.users.length < 200) break
}
if (!user) {
  console.error(`\n⏳ Aucun compte trouvé pour ${email}.`)
  console.error('   → La personne doit d\'abord créer son compte (écran d\'accueil → « Créer un compte »)')
  console.error('     ou être invitée depuis /admin/rh. Relance ce script ensuite.\n')
  process.exit(1)
}
console.log(`✓ Compte trouvé : ${user.id}`)

// 1b. Confirme l'email si nécessaire (débloque la connexion si la confirmation
//     email est activée sur le projet — le mot de passe reste celui choisi par
//     l'employé lui-même).
if (!user.email_confirmed_at) {
  const { error: ecf } = await sb.auth.admin.updateUserById(user.id, { email_confirm: true })
  if (ecf) console.warn('  ⚠ confirmation email impossible :', ecf.message)
  else console.log('✓ Email confirmé (connexion débloquée)')
}

// 2. Lie / crée la fiche employé (par email)
let { data: emp } = await sb.from('employes').select('id, prenom, nom').eq('email', email).maybeSingle()
const meta = user.user_metadata ?? {}
const prenom = argPrenom ?? meta.prenom ?? email.split('@')[0]
const nom = argNom ?? meta.nom ?? ''
if (!emp) {
  const { data: created, error: ec } = await sb.from('employes')
    .insert({ prenom, nom, email, poste: 'polyvalent', actif: true, autonomie_voir_prix: true })
    .select('id, prenom, nom').single()
  if (ec) { console.error('❌ création fiche employé :', ec.message); process.exit(1) }
  emp = created
  console.log(`✓ Fiche employé créée : ${emp.prenom} ${emp.nom}`)
} else {
  const patch = { poste: 'polyvalent', autonomie_voir_prix: true }
  if (argPrenom) patch.prenom = argPrenom
  if (argNom) patch.nom = argNom
  await sb.from('employes').update(patch).eq('id', emp.id)
  console.log(`✓ Fiche employé existante mise à jour : ${argPrenom ?? emp.prenom} ${argNom ?? emp.nom}`)
}

// 3. Crée OU met à jour le profil (le profil n'existe parfois qu'après la 1ʳᵉ
//    connexion via getProfile ; ici on le pré-crée pour qu'elle/il arrive direct
//    en polyvalent, onboarding déjà marqué fait).
const now = new Date().toISOString()
const { data: existingProfil } = await sb.from('profils').select('id').eq('id', user.id).maybeSingle()
if (existingProfil) {
  const { error: ep } = await sb.from('profils')
    .update({ poste: 'polyvalent', employe_id: emp.id, onboarding_completed_at: now })
    .eq('id', user.id)
  if (ep) { console.error('❌ mise à jour profil :', ep.message); process.exit(1) }
  console.log('✓ Profil existant mis à jour')
} else {
  const { error: ep } = await sb.from('profils')
    .insert({ id: user.id, email, role: 'employe', poste: 'polyvalent', employe_id: emp.id, onboarding_completed_at: now })
  if (ep) { console.error('❌ création profil :', ep.message); process.exit(1) }
  console.log('✓ Profil créé (pré-rempli, onboarding marqué fait)')
}

console.log(`\n✅ ${email} est maintenant POLYVALENT (accès tous postes de service + back-office opérationnel).`)
console.log('   → Il/elle se connecte, arrive sur /mon-espace, et accède à tous ses modules.')
