// Ce qu'il reste à faire chiffrer — DVB (boissons, jus, sirops, canettes) et
// Pomona TerreAzur (fruits et légumes frais).
//
// ⚠️ NOS PRIX FIGURENT EN FACE, quand on les a. Un fournisseur qui ignore ce
// qu'il doit battre propose son tarif public, et tout le monde y perd : lui
// l'affaire, nous le temps de comparer.
//
// ⚠️ Chaque prix est marqué « relevé » ou « ⚠ estimation » (0165). Les
// présenter tous comme des prix payés fausserait la négociation dans les deux
// sens — on demanderait une remise sur un chiffre qu'on n'a jamais réglé.
//
// ⚠️ La case reste VIDE quand on ne sait pas. Un zéro se lit « gratuit ».
//
//   node scripts/demande-tarif-dvb-terreazur.mjs [--creer-fournisseur]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const eur = (n, u) => n == null ? '' : `${Number(n).toFixed(3).replace('.', ',')} €${u ? ` / ${u}` : ''}`

// ── Le fournisseur DVB, prêt à recevoir son devis ─────────────────────
if (process.argv.includes('--creer-fournisseur')) {
  const [deja] = await sb('fournisseurs?nom=eq.DVB&select=id')
  if (deja) console.log('  DVB existe déjà')
  else {
    await sb('fournisseurs', { method: 'POST', body: JSON.stringify({ nom: 'DVB', actif: true,
      conditions_tarifaires: `Boissons, jus, sirops et canettes. Tarif demandé le ${new Date().toISOString().slice(0, 10)}.` }) })
    console.log('  ✓ fournisseur DVB créé')
  }
}
// ⚠️ Terre d'Azur n'est PAS à créer : c'est « Pomona TerreAzur », déjà en base
// depuis le rendez-vous du 28/09. Un doublon couperait ses tarifs en deux et
// le comparateur les opposerait l'un à l'autre comme deux fournisseurs.

const bar = await sb('recettes?tag_destination=eq.BAR&categorie=eq.Boisson%20fra%C3%AEche&select=nom,actif,cout_achat_ht,nom_matiere&limit=100')
const fournil = await sb('recettes?tag_destination=eq.FOURNIL&categorie=eq.Boisson%20fra%C3%AEche&select=nom,actif,cout_achat_ht,nom_matiere&limit=100')
const retires = await sb('recettes?tag_destination=eq.BAR&actif=eq.false&select=nom,cout_achat_ht,nom_matiere&limit=100')
const ing = await sb('ingredients?stocke=eq.true&actif=eq.true&select=id,nom,unite,prix_achat_ht,prix_estime,fournisseur_principal&limit=300')
const offres = new Set((await sb('catalogue_fournisseur?ingredient_id=not.is.null&select=ingredient_id&limit=2000')).map(x => x.ingredient_id))

const lignes = []
// ⚠️ Dédoublonné sur le NOM : un produit retiré de la carte remontait deux
// fois — une liste à chiffrer qui répète ses lignes se fait renvoyer.
const vus = new Set()
const pousser = (dest, quoi, prix, unite, estime, note) => {
  const cle = quoi.replace(/\s*\(.*$/, '').trim()
  if (vus.has(cle)) return
  vus.add(cle); lignes.push({ dest, quoi, prix, unite, estime, note })
}

console.log(`\n╔═══════════════════════════════════════════════════════════════════════════════╗`)
console.log(`║ À faire chiffrer                                                              ║`)
console.log(`╚═══════════════════════════════════════════════════════════════════════════════╝`)

console.log(`\n🥤 DVB — boissons, jus, sirops, canettes\n`)
console.log(`  ⚠️ LES SIROPS EN PREMIER : quatre produits sont hors carte faute de menthe,`)
console.log(`     grenadine et orgeat — Monaco, Mauresque, Perroquet, Tomate.\n`)
for (const s of ['Sirop de menthe verte 1 L', 'Sirop de grenadine 1 L', 'Sirop d’orgeat 1 L', 'Sirop de citron 1 L'])
  pousser('DVB', s, 4.98, 'bouteille 1 L', true, 'repère Teisseire chez France Boissons')
for (const r of [...bar, ...fournil].sort((a, b) => a.nom.localeCompare(b.nom))) {
  if (!/cola|fanta|orangina|oasis|ice tea|jus|perrier|schweppes|sprite|limonade|eau |red bull|ciao/i.test(r.nom)) continue
  pousser('DVB', `${r.nom}${r.actif ? '' : ' (retiré de la carte)'}`, r.cout_achat_ht, 'unité vendue', true,
    r.nom_matiere ?? '')
}
for (const r of retires) if (/jus|schweppes|rade|heineken 0/i.test(r.nom))
  pousser('DVB', `${r.nom} (retiré faute d’approvisionnement)`, r.cout_achat_ht, 'unité vendue', true, r.nom_matiere ?? '')

console.log(`  ${'à chiffrer'.padEnd(44)} ${'notre prix'.padStart(16)}   base`)
for (const l of lignes.filter(x => x.dest === 'DVB'))
  console.log(`  ${l.quoi.slice(0, 43).padEnd(44)} ${eur(l.prix).padStart(16)}   ${l.prix == null ? '—' : (l.estime ? '⚠ estimation' : 'prix payé')}${l.note ? ` · ${l.note.slice(0, 34)}` : ''}`)

console.log(`\n🥬 Pomona TerreAzur — fruits et légumes frais\n`)
for (const i of ing) {
  if (offres.has(i.id)) continue
  // ⚠️ On demande du FRAIS À TRAVAILLER, pas des préparations. « Sauce tomate
  // pizza » est une conserve 5/1 de chez Gineys et « Oignons confits » un
  // produit cuisiné : les faire chiffrer par un primeur, c'est lui demander
  // un produit qu'il ne vend pas, et se décrédibiliser sur toute la liste.
  if (/sauce|confit|s[ée]ch|surgel|conserve|huile/i.test(i.nom)) continue
  if (!/salade|roquette|tomate|citron|concombre|pommes? de terre|oignon|champignon|mesclun|herbe|basilic|persil|courgette|aubergine|poivron|carotte|fruit|l[ée]gume/i.test(i.nom)) continue
  pousser('TerreAzur', i.nom, i.prix_achat_ht, i.unite, i.prix_estime, '')
}
console.log(`  ${'à chiffrer'.padEnd(44)} ${'notre prix'.padStart(16)}   base`)
for (const l of lignes.filter(x => x.dest === 'TerreAzur'))
  console.log(`  ${l.quoi.slice(0, 43).padEnd(44)} ${eur(l.prix, l.unite).padStart(16)}   ${l.prix == null ? '—' : (l.estime ? '⚠ estimation' : 'prix payé')}`)

// Ce qui n'entre dans aucune des deux listes, et qu'il ne faut pas oublier.
const orphelines = ing.filter(i => !offres.has(i.id) && !lignes.some(l => l.quoi === i.nom))
console.log(`\n❓ ${orphelines.length} matière(s) qui ne relèvent ni de l’un ni de l’autre :`)
console.log(`   ${orphelines.map(i => i.nom).join(', ')}`)

const csv = ['Destinataire;Article a chiffrer;Notre prix HT;Unite;Base de notre prix;Prix DVB/TerreAzur HT',
  ...lignes.map(l => [l.dest, l.quoi, l.prix == null ? '' : String(l.prix).replace('.', ','), l.unite ?? '',
    l.prix == null ? '' : (l.estime ? 'ESTIMATION a confirmer' : 'prix paye'), ''].join(';'))]
fs.writeFileSync('data/demande-tarif-dvb-terreazur.csv', '﻿' + csv.join('\n'), 'utf8')
console.log(`\n  → data/demande-tarif-dvb-terreazur.csv  (${lignes.length} lignes, hors dépôt)\n`)
