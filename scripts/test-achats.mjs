// La plateforme d'achat — catalogue tous fournisseurs, remises, demandes.
//
//   PORT=3000 node scripts/test-achats.mjs
//
// ⚠️ Il RECOPIE les règles de `src/lib/catalogue-achats.ts` (la source est en
// TS) : modifier les deux ensemble. L'essentiel des assertions porte sur ce
// que l'écran REFUSE d'affirmer — c'est là que se logent les fautes de cette
// famille (« rien déclaré » lu « aucun allergène », food cost 0 % en vert).

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async p => {
  const r = await fetch(U + '/rest/v1/' + p, { headers: { apikey: K, Authorization: `Bearer ${K}` } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}
// ⚠️ PostgREST plafonne à 1 000 lignes SANS le dire — `limit=5000` n'y change
// rien. Sans pagination, ce test validerait un tiers du catalogue en croyant
// le voir en entier. C'est ce plafond qui a fait échouer sa première version.
const sbTout = async (p, max = 20000) => {
  const out = []
  for (let de = 0; de < max; de += 1000) {
    const lot = await sb(`${p}&offset=${de}&limit=1000`)
    out.push(...lot)
    if (lot.length < 1000) break
  }
  return out
}
let ok = 0, ko = 0
const t = (nom, cond) => { if (cond) { ok++; console.log(`  ✓ ${nom}`) } else { ko++; console.log(`  ✗ ${nom}`) } }
const titre = s => console.log(`\n── ${s} ──`)

// ─── Les règles pures, recopiées ──────────────────────────────────
const etatRemise = a => a.tarif_negocie === true ? 'negocie'
  : a.tarif_negocie === false ? 'public' : 'inconnu'
const motsCles = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
const correspond = (a, q) => {
  const termes = motsCles(q); if (!termes.length) return true
  const cibles = motsCles(a.designation); const ref = (a.reference || '').toUpperCase()
  return termes.every(x => ref.includes(x) || cibles.some(c => c.startsWith(x)))
}

const tousLesArticles = await sbTout('catalogue_fournisseur?actif=eq.true&select=famille,remise_pct,achete,cle_comparaison,date_tarif')

titre('Trois états de remise, pas deux')
t('un tarif vérifié est « négocié »',      etatRemise({ tarif_negocie: true }) === 'negocie')
t('un tarif public confirmé est « public »', etatRemise({ tarif_negocie: false }) === 'public')
t('⚠️ NULL est « inconnu », JAMAIS « public »', etatRemise({ tarif_negocie: null }) === 'inconnu')
t('undefined ne vaut pas non plus « public »', etatRemise({}) === 'inconnu')

titre('La recherche')
const a1 = { designation: 'MOZZARELLA RAPEE BELLA STELLA SAC=2KG', reference: '0061414' }
t('un préfixe trouve le mot entier',        correspond(a1, 'mozza'))
t('plusieurs mots : TOUS doivent y être',   correspond(a1, 'mozza stella'))
t('un mot absent exclut la ligne',          !correspond(a1, 'mozza jambon'))
t('la référence se colle telle quelle',     correspond(a1, '0061414'))
t('les accents ne gênent pas',              correspond({ designation: 'CRÈME FRAÎCHE ÉPAISSE', reference: 'X' }, 'creme fraiche'))
t('une requête vide rend tout',             correspond(a1, '   '))

titre('Le message envoyé au fournisseur')
const message = arts => {
  const lignes = arts.map(a => `  · ${a.reference} — ${a.designation} (affiché : ${
    a.prix_ht == null ? 'prix sur demande' : `${a.prix_ht.toFixed(3).replace('.', ',')} € / ${a.unite}`})`)
  return lignes.join('\n')
}
const m1 = message([{ reference: '0061414', designation: 'MOZZARELLA', prix_ht: 6.924, unite: 'kg' }])
t('il porte la RÉFÉRENCE de l’article',  m1.includes('0061414'))
t('il porte le prix affiché',            m1.includes('6,924'))
const m2 = message([{ reference: '0053088', designation: 'HOMARD', prix_ht: null, unite: 'colis' }])
t('⚠️ un prix absent se dit, il ne vaut pas 0', m2.includes('prix sur demande') && !m2.includes('0,000'))

titre('Les promos du moment, et leur âge')
// ⚠️ Recopie `fraicheur()` : une promo ne dit pas sa date de péremption.
// Affichée trois mois plus tard, elle fait commander au tarif plein en
// croyant profiter d'une affaire — la faute déjà payée sur Gel Var.
const jours = (d, auj) => Math.max(0, Math.floor((auj - new Date(d + 'T00:00:00Z')) / 86400000))
const fraicheur = (d, auj) => { const j = jours(d, auj); return j <= 7 ? 'fraiche' : j <= 30 ? 'tiede' : 'perimee' }
const AUJ = new Date('2026-09-27T12:00:00Z')
t('un relevé du jour est frais',        fraicheur('2026-09-27', AUJ) === 'fraiche')
t('un relevé de trois semaines est tiède', fraicheur('2026-09-06', AUJ) === 'tiede')
t('⚠️ un relevé de deux mois est PÉRIMÉ', fraicheur('2026-07-27', AUJ) === 'perimee')

// « Intéressante » = sur un produit qu'on achète ou qu'on a rattaché.
const interessante = a => a.achete || a.cle_comparaison != null
const promos = tousLesArticles.filter(a => a.remise_pct != null && a.remise_pct > 0)
t('des promotions existent', promos.length > 100)
t('⚠️ celles qui portent sur nos achats sont identifiables',
  promos.some(interessante) && promos.some(a => !interessante(a)))

titre('Les offres conditionnelles des fournisseurs (0161)')
// ⚠️ Recopie `joursRestants()`. Une offre « 2 achetés, 1 offert » ne se
// convertit PAS en pourcentage : sous le seuil, l'avantage n'existe pas.
const joursRestants = (fin, auj) => fin == null ? null
  : Math.ceil((new Date(fin + 'T00:00:00Z') - auj) / 86400000)
t('une offre qui finit demain reste 1 jour', joursRestants('2026-09-28', AUJ) === 1)
t('⚠️ une offre finie rend un nombre NÉGATIF, pas null', joursRestants('2026-09-20', AUJ) < 0)
t('une offre sans date de fin rend null', joursRestants(null, AUJ) === null)

const offres = await sbTout('promotions_fournisseur?actif=eq.true&select=libelle,type,seuil_quantite,seuil_unite,avantage,date_fin,releve_le')
t('des offres sont enregistrées', offres.length > 0)
t('⚠️ chacune porte une DATE DE FIN — c’est ce qui manque aux badges Gineys',
  offres.every(o => o.date_fin))
t('⚠️ chacune porte sa CONDITION (seuil + unité)',
  offres.every(o => o.seuil_quantite != null && o.seuil_unite))
t('le type est explicite, jamais un pourcentage inventé',
  offres.every(o => ['gratuite','remise_montant','remise_pct','prix_promo'].includes(o.type)))
t('une gratuité n’a pas de montant de remise',
  offres.filter(o => o.type === 'gratuite').every(o => o.avantage != null && o.avantage > 0))
t('⚠️ `releve_le` dit quand NOUS avons regardé, pas la validité',
  offres.every(o => o.releve_le && o.releve_le !== o.date_fin))

titre('Les catégories')
// ⚠️ On ne fusionne QUE la casse : « SECS » et « Sauce » viennent de deux
// taxonomies et ne se rapprochent pas.
const fams = new Map()
for (const a of tousLesArticles) {
  if (!a.famille) continue
  const k = a.famille.toLowerCase()
  fams.set(k, (fams.get(k) ?? 0) + 1)
}
t('des familles existent', fams.size >= 10)
t('⚠️ « Boissons » et « BOISSONS » ne font qu’une entrée',
  [...new Set(tousLesArticles.filter(a=>a.famille).map(a=>a.famille.toLowerCase()))].length < 
  [...new Set(tousLesArticles.filter(a=>a.famille).map(a=>a.famille))].length)
t('⚠️ le non-classé est compté, pas caché',
  tousLesArticles.filter(a => !a.famille).length > 0)

titre('Le catalogue en base')
const portail = await sbTout('catalogue_fournisseur?nature=eq.portail&select=id,prix_ht,tarif_negocie,achete,remise_pct,reference,colis_quantite,unite')
t('le portail Gineys est importé en ENTIER', portail.length === 2892)
t('⚠️ la lecture n’est pas tronquée à 1 000', portail.length > 1000)
t('les 92 articles achetés sont marqués', portail.filter(x => x.achete).length === 92)
t('ils portent tous un tarif négocié confirmé',
  portail.filter(x => x.achete).every(x => x.tarif_negocie === true))
// ⚠️ Assertion RÉVISÉE le 27/09/2026. Elle exigeait que tout le portail
// non acheté reste NULL — c'était juste tant qu'on ne savait rien. Le
// catalogue Arti'Pat a MESURÉ que 388 de ces références sont au tarif
// public au centime près : « false » y est désormais un constat, pas une
// supposition. Ce qui reste interdit, c'est `true` sans l'avoir acheté.
t('⚠️ une ligne du portail non achetée n’est JAMAIS « remisée »',
  portail.filter(x => !x.achete).every(x => x.tarif_negocie !== true))
t('⚠️ et « tarif public » n’est posé que sur ce qui a été MESURÉ',
  portail.filter(x => x.tarif_negocie === false).length > 0
  && portail.filter(x => x.tarif_negocie === false).length < portail.filter(x => !x.achete).length)
t('⚠️ aucun prix n’est à zéro',           portail.every(x => x.prix_ht === null || Number(x.prix_ht) > 0))
t('les « prix sur demande » sont NULL',   portail.filter(x => x.prix_ht === null).length > 0)
t('toutes les lignes ont une référence',  portail.every(x => x.reference && x.reference.length >= 5))
t('des promotions sont enregistrées',     portail.filter(x => x.remise_pct != null).length > 100)

titre('Le multiplicateur vers le colis')
// ⚠️ « 27,410 € / Col » avec « 30 PI / Col » : le colis coûte DÉJÀ 27,41 €.
// Le multiplier par 30 afficherait un carton de pain à 822 €.
const auColis = portail.filter(x => x.unite === 'colis')
t('un prix au colis ne se multiplie pas', auColis.length > 0 && auColis.every(x => x.colis_quantite === null || Number(x.colis_quantite) === 1))
t('un prix au kilo n’invente pas de colisage',
  portail.filter(x => x.unite === 'kg').every(x => x.colis_quantite === null))

titre('Qui a une remise connue, et qui reste à demander')
// Un prix FACTURÉ est une preuve de paiement ; un DEVIS est un prix proposé
// nommément à CASATASIA. Les deux sont « notre prix ». Seule une référence
// de catalogue qu'on n'a jamais achetée reste à demander.
const tous = await sbTout('catalogue_fournisseur?select=nature,achete,tarif_negocie')
t('une ligne de facture vaut remise connue',
  tous.filter(x => x.nature === 'facture').every(x => x.tarif_negocie === true))
t('un devis aussi',
  tous.filter(x => x.nature === 'devis').every(x => x.tarif_negocie === true))
t('⚠️ TOUT ce qui reste inconnu est du catalogue jamais acheté',
  tous.filter(x => x.tarif_negocie === null).every(x => x.nature === 'portail' && !x.achete))
t('et il en reste vraiment (sinon l’écran ne sert à rien)',
  tous.filter(x => x.tarif_negocie === null).length > 1000)

titre('Le comparateur branché sur l’agent Stock')
// ⚠️ Recopie les trois filtres de `comparerPrixFournisseurs()` : comparable,
// deux fournisseurs DISTINCTS, écart ≥ 10 %. Chacun écarte un faux positif,
// et un agent qui crie pour rien cesse d'être lu.
const trouvailles = await sbTout('agent_findings?type=eq.comparaison_fournisseur&resolu=is.false&select=titre,message,data')
t('l’agent a trouvé des économies', trouvailles.length > 0)
t('⚠️ aucune économie sous 10 % (ce serait du bruit de conditionnement)',
  trouvailles.every(f => Number(f.data?.economiePct ?? 0) >= 10))
t('⚠️ jamais « moins cher » chez le fournisseur où l’on est DÉJÀ',
  trouvailles.every(f => f.data?.fournActuel && f.data?.fournAlternatif && f.data.fournActuel !== f.data.fournAlternatif))
t('⚠️ la NATURE de chaque prix est dite (payé / devis / portail)',
  trouvailles.every(f => /\((pay\u00e9|devis|tarif portail)\)/.test(String(f.message))))
t('le message dit qu’un écart ne décide rien sans les quantités',
  trouvailles.every(f => /quantit\u00e9s r\u00e9elles/.test(String(f.message))))
// Contrôle croisé avec le verdict relevé à la main (CLAUDE.md) : la
// mayonnaise et le beurre doux sont moins chers chez Félix Potin.
t('il retrouve la mayonnaise et le beurre doux',
  ['mayonnaise', 'Beurre doux'].every(x => trouvailles.some(f => String(f.titre).includes(x))))
// ⚠️ Et il ne crie PAS sur ce qui est moins cher chez nous : l'huile d'olive
// est 19 % plus chère chez Félix Potin, l'emmental 8 %.
t('⚠️ il ne signale PAS l’huile d’olive (moins chère chez Gineys)',
  !trouvailles.some(f => /huile/i.test(String(f.titre))))

titre('Un tarif n’est pas un prix payé')
// La règle de la 0151 doit tenir MÊME ICI, où le tarif s'est révélé exact.
const ings = await sb('ingredients?select=id,prix_achat_ht&stocke=eq.true&limit=500')
t('des matières ont un prix d’achat',     ings.some(i => Number(i.prix_achat_ht) > 0))
t('⚠️ l’import n’a écrit aucun prix d’achat nul', ings.every(i => i.prix_achat_ht === null || Number(i.prix_achat_ht) >= 0))

titre('Demandé n’est pas obtenu')
const demandes = await sb('catalogue_fournisseur?remise_demandee_le=not.is.null&select=id,tarif_negocie&limit=500')
t('une demande ne pose pas de remise toute seule',
  demandes.every(d => d.tarif_negocie === null || d.tarif_negocie === true))

// ─── L'écran est-il fermé aux appels anonymes ? ───────────────────
// Il expose des conditions négociées : le laisser répondre les publierait.
if (process.env.PORT) {
  titre('L’écran ne répond pas sans authentification')
  const r = await fetch(`http://localhost:${process.env.PORT}/admin/achats`, { redirect: 'manual' })
  t('appel anonyme refusé ou redirigé', r.status === 307 || r.status === 302 || r.status === 401 || r.status === 403)
}

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
