#!/usr/bin/env node
// Fichier client Zelty ↔ le nôtre.
//
// Sans compte ni clé. L'essentiel des assertions porte sur ce que le pont
// REFUSE de faire — en particulier sur les consentements, où une erreur ne
// produit aucun message d'erreur mais une infraction.
//
// ⚠️ CE FICHIER RECOPIE la règle de src/lib/integrations/zelty/clients.ts
//    (la source est en TypeScript). Modifier les deux ensemble.
//
// Usage : node scripts/test-zelty-clients.mjs

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}

// ─── La règle, recopiée ────────────────────────────────────────────
const telephoneComparable = tel => {
  if (!tel) return null
  const c = String(tel).replace(/[^\d+]/g, '')
  if (c.startsWith('+33')) return '0' + c.slice(3)
  if (c.startsWith('0033')) return '0' + c.slice(4)
  if (c.startsWith('33') && c.length === 11) return '0' + c.slice(2)
  return c || null
}
const emailComparable = m => {
  const s = (m ?? '').trim().toLowerCase()
  return s && s.includes('@') ? s : null
}

function fusionner(existant, entrant) {
  const patch = {}
  for (const champ of ['prenom', 'nom', 'email', 'telephone', 'date_naissance']) {
    if (!existant[champ] && entrant[champ]) patch[champ] = entrant[champ]
  }
  if (entrant.notes_internes && !(existant.notes_internes ?? '').includes(entrant.notes_internes)) {
    patch.notes_internes = [existant.notes_internes, entrant.notes_internes].filter(Boolean).join('\n')
  }
  if (!existant.caisse_externe_id) {
    patch.caisse_externe_systeme = entrant.caisse_externe_systeme
    patch.caisse_externe_id = entrant.caisse_externe_id
  }
  return patch
}

console.log('\n👥 Fichier client Zelty — traduction\n')

// ─── Le téléphone, clé du rapprochement ────────────────────────────
t('+33 devient 0 (« +33767453444 » = « 0767453444 »)',
  telephoneComparable('+33767453444') === '0767453444', telephoneComparable('+33767453444'))
t('0033 aussi', telephoneComparable('0033767453444') === '0767453444')
t('un numéro français reste lui-même', telephoneComparable('0767453444') === '0767453444')
t('les espaces et points ne font pas deux clients',
  telephoneComparable('07 67 45 34 44') === telephoneComparable('07.67.45.34.44'))
t('⚠️ sans cette mise à plat, le même client compterait double',
  telephoneComparable('+33767453444') === telephoneComparable('0767453444'))
t('un téléphone vide reste vide', telephoneComparable('') === null)

t('la casse d’un email ne fait pas deux clients',
  emailComparable('Jean.Dupont@Gmail.com') === 'jean.dupont@gmail.com')
t('une chaîne sans @ n’est pas un email', emailComparable('néant') === null)
t('un email vide reste vide', emailComparable('') === null)

// ─── LA règle : les consentements ──────────────────────────────────
console.log('\n🔒 Consentements — ce que le pont REFUSE\n')

const chezNous = {
  id: 'nous-1', prenom: 'Jean', nom: 'Dupont', email: 'jean@example.fr',
  telephone: null, date_naissance: null, notes_internes: null,
  caisse_externe_id: null, opt_in_marketing: false,
}
const deLaCaisse = {
  caisse_externe_systeme: 'zelty', caisse_externe_id: '42',
  prenom: 'Jean', nom: 'Dupont', email: 'jean@example.fr',
  telephone: '0767453444', date_naissance: '1980-05-02', notes_internes: 'sans gluten',
  accept_marketing: true, sms_optin: true, mail_optin: true,
}

const patch = fusionner(chezNous, deLaCaisse)
t('⚠️⚠️ le consentement N’EST PAS dans la mise à jour',
  !('opt_in_marketing' in patch), JSON.stringify(Object.keys(patch)))
t('⚠️ un « oui » de la caisse ne réabonne pas quelqu’un qui a dit non ici',
  chezNous.opt_in_marketing === false && !('opt_in_marketing' in patch))
t('le téléphone manquant est complété', patch.telephone === '0767453444')
t('la date de naissance manquante est complétée', patch.date_naissance === '1980-05-02')
t('⚠️ un prénom DÉJÀ renseigné n’est pas remplacé', !('prenom' in patch))
t('le lien avec la caisse est posé', patch.caisse_externe_id === '42')
t('les notes s’ajoutent au lieu d’écraser', patch.notes_internes === 'sans gluten')

const avecNotes = fusionner({ ...chezNous, notes_internes: 'habitué du mardi' }, deLaCaisse)
t('deux notes vraies coexistent',
  avecNotes.notes_internes === 'habitué du mardi\nsans gluten', avecNotes.notes_internes)
const deuxieme = fusionner({ ...chezNous, notes_internes: 'sans gluten' }, deLaCaisse)
t('⚠️ repasser deux fois n’empile pas la même note',
  !('notes_internes' in deuxieme))

const rien = fusionner(
  { ...chezNous, telephone: '0767453444', date_naissance: '1980-05-02',
    notes_internes: 'sans gluten', caisse_externe_id: '42' },
  deLaCaisse,
)
t('un client déjà complet ne produit aucune écriture', Object.keys(rien).length === 0)

// ─── Ce qui part vers la caisse ────────────────────────────────────
console.log('\n📤 Ce qui part vers la caisse\n')

function versZelty(c) {
  const nom = (c.nom || '').trim()
  if (!nom) return { ok: false, motif: 'nom manquant' }
  if (!c.email && !c.telephone) return { ok: false, motif: 'ni email ni téléphone' }
  return {
    ok: true,
    corps: {
      name: nom,
      ...(c.prenom ? { fname: c.prenom } : {}),
      ...(c.email ? { mail: c.email } : {}),
      ...(c.telephone ? { phone: c.telephone } : {}),
      remote_id: c.id,
    },
  }
}

const sortant = versZelty({ id: 'nous-1', prenom: 'Jean', nom: 'Dupont', email: 'jean@example.fr', telephone: null })
t('le corps porte le nom et l’email', sortant.ok && sortant.corps.name === 'Dupont')
t('⚠️ AUCUN consentement n’est envoyé',
  sortant.ok && !('accept_marketing' in sortant.corps) && !('sms_optin' in sortant.corps)
  && !('mail_optin' in sortant.corps) && !('opt_in_marketing' in sortant.corps))
t('notre identifiant part dans remote_id', sortant.ok && sortant.corps.remote_id === 'nous-1')
t('un client sans nom est refusé', versZelty({ id: 'x', nom: '', email: 'a@b.fr' }).ok === false)
t('⚠️ un client sans email NI téléphone est refusé (fiche muette)',
  versZelty({ id: 'x', nom: 'Dupont', email: null, telephone: null }).ok === false)

console.log(`\n${ko === 0 ? '✅' : '❌'} ${ok} réussite(s), ${ko} échec(s)\n`)
process.exit(ko === 0 ? 0 : 1)
