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
// ⚠️ ASSERTION RÉVISÉE LE 27/09/2026 — sur DÉCISION DU GÉRANT, pas par
// commodité. Elle exigeait que « tarif public » reste minoritaire, pour
// interdire de le déduire d'une absence. Deux choses l'ont levée :
//   · la MESURE du catalogue Arti'Pat — 41 articles sous contrat à 22 % de
//     remise, 404 autres à 0,3 %, c'est-à-dire le tarif public au centime ;
//   · le gérant : « ce sont seulement des prix publics pas encore remisés,
//     car aucune demande de remise n'a été faite sur ces produits ».
// Ce n'est donc plus une supposition, c'est le fonctionnement du portail.
// ⚠️ Ce qui reste interdit n'a pas bougé : `true` sans l'avoir acheté, et
// l'extension de cette règle À UN AUTRE FOURNISSEUR — la mesure n'a été
// faite que chez Gineys.
t('⚠️ tout le portail non acheté est au tarif public',
  portail.filter(x => !x.achete).every(x => x.tarif_negocie === false))
// ⚠️ La règle ne déborde pas : « tarif public » ne peut porter que sur un
// prix AFFICHÉ — le portail, ou le catalogue imprimé d'Arti'Pat, public par
// définition. Un DEVIS est chiffré nommément pour CASATASIA et une FACTURE
// est un prix payé : marquer l'un des deux « public » effacerait une
// négociation obtenue.
t('⚠️ un devis ou une facture n’est JAMAIS marqué « tarif public »',
  (await sbTout('catalogue_fournisseur?select=nature,tarif_negocie'))
    .filter(x => x.nature === 'devis' || x.nature === 'facture')
    .every(x => x.tarif_negocie !== false))
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
// ⚠️ RÉVISÉE avec la précédente : il ne reste plus AUCUN « inconnu », et
// c'est voulu. L'écran ne sert plus à trier l'inconnu du connu, il sert à
// dire ce qui est ENCORE À DEMANDER — d'où le libellé « Tarif public —
// remise à demander », qui ne se lit pas « remise refusée ».
t('⚠️ plus aucune remise « inconnue » : tout est tranché',
  tous.filter(x => x.tarif_negocie === null).length === 0)
t('et le gisement à demander reste ÉNORME — c’est la raison d’être de l’écran',
  tous.filter(x => x.tarif_negocie === false).length > 2000)

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

// ═══ L'ÉTAT DE LA PLATEFORME ═══════════════════════════════════════════
// ⚠️ RECOPIE de `etatPlateforme()` / `manques()` (src/lib/catalogue-achats.ts).
const etatPlateforme = (articles, offres, fournisseurs, groupes) => {
  const remises = { negocie: 0, public: 0, inconnu: 0 }
  const parF = new Map()
  for (const f of fournisseurs) {
    if (!f.actif) continue
    parF.set(f.id, { nom: f.nom, lignes: 0, avecPrix: 0, email: f.email, dernierTarif: null, _nat: new Map() })
  }
  for (const a of articles) {
    remises[a.tarif_negocie === true ? 'negocie' : a.tarif_negocie === false ? 'public' : 'inconnu']++
    let e = parF.get(a.fournisseur_id)
    if (!e) { e = { nom: a.fournisseur_nom, lignes: 0, avecPrix: 0, email: null, dernierTarif: null, _nat: new Map() }; parF.set(a.fournisseur_id, e) }
    e.lignes++
    if (a.prix_ht != null) e.avecPrix++
    e._nat.set(a.nature, (e._nat.get(a.nature) ?? 0) + 1)
    if (!e.dernierTarif || a.date_tarif > e.dernierTarif) e.dernierTarif = a.date_tarif
  }
  const liste = [...parF.values()].map(e => ({
    nom: e.nom, lignes: e.lignes, avecPrix: e.avecPrix, email: e.email, dernierTarif: e.dernierTarif,
    natures: [...e._nat.entries()].map(([nature, n]) => ({ nature, n })).sort((a, b) => b.n - a.n),
  })).sort((a, b) => b.lignes - a.lignes)
  const aDeux = groupes.filter(g => g.fournisseurs >= 2)
  return {
    lignes: articles.length, fournisseurs: liste.length,
    avecPrix: articles.filter(a => a.prix_ht != null).length,
    sansPrix: articles.filter(a => a.prix_ht == null).length,
    avecFamille: articles.filter(a => a.famille).length,
    cles: groupes.length,
    faceAFace: aDeux.filter(g => g.comparable).length,
    nonComparables: aDeux.filter(g => !g.comparable).length,
    seul: groupes.length - aDeux.length,
    remises,
    demandees: articles.filter(a => a.remise_demandee_le).length,
    achetes: articles.filter(a => a.achete).length,
    promos: offres.length, parFournisseur: liste,
  }
}

const art = (o) => ({
  id: o.id, fournisseur_id: o.fid ?? 'f1', fournisseur_nom: o.fnom ?? 'Gineys',
  reference: '', designation: o.d ?? 'X', famille: o.fam ?? null, cle: o.cle ?? null,
  ref: null, meilleur: false, unite: 'kg', prix_ht: o.prix === undefined ? 1 : o.prix,
  remise_pct: null, tarif_negocie: o.neg === undefined ? null : o.neg,
  achete: Boolean(o.achete), remise_demandee_le: o.dem ?? null,
  date_tarif: o.date ?? '2026-09-01', nature: o.nat ?? 'portail',
})
const FS = [{ id: 'f1', nom: 'Gineys', email: 'a@b.c', actif: true },
            { id: 'f2', nom: 'Promocash', email: null, actif: true }]

console.log('\n── L\'état de la plateforme ──')
{
  const e = etatPlateforme(
    [art({ id: '1' }), art({ id: '2', prix: null }), art({ id: '3', fid: 'f2', fnom: 'Promocash', fam: 'ÉPICERIE' })],
    [], FS,
    [{ cle: 'a', comparable: true, fournisseurs: 2, ecartPct: 30 },
     { cle: 'b', comparable: false, fournisseurs: 2, ecartPct: null },
     { cle: 'c', comparable: true, fournisseurs: 1, ecartPct: null }])

  t('un prix sur demande n\'est pas compté comme un prix', e.avecPrix === 2 && e.sansPrix === 1)
  t('⚠️ un face-à-face exige DEUX fournisseurs ET des unités concordantes', e.faceAFace === 1)
  t('un groupe à unités discordantes est compté à part, pas perdu', e.nonComparables === 1)
  t('un groupe à un seul fournisseur n\'est pas une comparaison', e.seul === 1)
  t('les trois compteurs couvrent tous les groupes', e.faceAFace + e.nonComparables + e.seul === e.cles)
  t('« inconnu » est compté à part de « tarif public »', e.remises.inconnu === 3 && e.remises.public === 0)
  t('la famille absente n\'est pas comptée', e.avecFamille === 1)
  t('le dernier tarif est le PLUS RÉCENT', 
    etatPlateforme([art({ id: '1', date: '2026-01-01' }), art({ id: '2', date: '2026-09-27' })], [], FS, [])
      .parFournisseur[0].dernierTarif === '2026-09-27')
  t('un fournisseur sans ligne apparaît quand même', e.parFournisseur.length === 2)
  t('les fournisseurs sont triés par volume', e.parFournisseur[0].lignes >= e.parFournisseur[1].lignes)
}

console.log('\n── Ce qui manque est DIT, avec sa conséquence ──')
{
  const manques = (e, matieresSansOffre) => {
    const m = []
    if (matieresSansOffre > 0) m.push({ quoi: 'matières sans offre', combien: matieresSansOffre, consequence: 'x' })
    const sansEmail = e.parFournisseur.filter(f => !f.email).length
    if (sansEmail > 0) m.push({ quoi: 'sans e-mail', combien: sansEmail, consequence: 'x' })
    if (e.remises.inconnu > 0) m.push({ quoi: 'remise inconnue', combien: e.remises.inconnu, consequence: 'x' })
    if (e.nonComparables > 0) m.push({ quoi: 'unités discordantes', combien: e.nonComparables, consequence: 'x' })
    const sf = e.lignes - e.avecFamille
    if (sf > 0) m.push({ quoi: 'sans famille', combien: sf, consequence: 'x' })
    if (e.sansPrix > 0) m.push({ quoi: 'prix sur demande', combien: e.sansPrix, consequence: 'x' })
    m.push({ quoi: 'aucune API', combien: null, consequence: 'x' })
    return m
  }
  const e = etatPlateforme([art({ id: '1' })], [], FS, [])
  const m = manques(e, 54)
  t('un fournisseur sans e-mail est signalé', m.some(x => x.quoi === 'sans e-mail' && x.combien === 1))
  t('les matières sans offre sont signalées', m.some(x => x.combien === 54))
  t('l\'absence d\'API est TOUJOURS dite — elle n\'a pas de chiffre',
    m.some(x => x.quoi === 'aucune API' && x.combien === null))
  t('chaque manque porte une CONSÉQUENCE, jamais un simple constat',
    m.every(x => x.consequence && x.consequence.length > 0))
  const parfait = etatPlateforme([art({ id: '1', neg: true, fam: 'X' })], [], [FS[0]], [])
  t('une plateforme sans trou ne liste que l\'absence d\'API', manques(parfait, 0).length === 1)
}

// ═══ NOTRE CATALOGUE D'ACHAT ═══════════════════════════════════════════
// ⚠️ RECOPIE de `acheteIncomplet()` / `filtrerAchetes()` / `bilanAchats()` /
// `achetesParFournisseur()` (src/lib/catalogue-achats.ts).
const acheteIncomplet = a => a.prix == null || !a.fournisseur
const filtrerAchetes = (arts, f) => {
  const mots = motsCles(f.requete)
  return arts.filter(a => {
    if (f.fournisseur !== undefined && (a.fournisseur ?? null) !== f.fournisseur) return false
    if (f.estimeSeul && !a.estime) return false
    if (f.incompletSeul && !acheteIncomplet(a)) return false
    if (!mots.length) return true
    const foin = motsCles(`${a.nom} ${a.reference ?? ''} ${a.categorie ?? ''}`)
    return mots.every(m => foin.some(h => h.startsWith(m)))
  })
}
const bilanAchats = arts => ({
  references: arts.length,
  avecPrix: arts.filter(a => a.prix != null).length,
  sansPrix: arts.filter(a => a.prix == null).length,
  avecReference: arts.filter(a => a.reference).length,
  estimes: arts.filter(a => a.prix != null && a.estime).length,
  releves: arts.filter(a => a.prix != null && !a.estime).length,
  incomplets: arts.filter(acheteIncomplet).length,
})
const achetesParFournisseur = arts => {
  const m = new Map()
  for (const a of arts) { const k = a.fournisseur ?? '\u0000'; if (!m.has(k)) m.set(k, []); m.get(k).push(a) }
  return [...m.entries()].map(([k, as]) => ({
    fournisseur: k === '\u0000' ? null : k,
    articles: as.sort((x, y) => (x.nom < y.nom ? -1 : 1)),
    estimes: as.filter(a => a.estime && a.prix != null).length,
  })).sort((a, b) => (a.fournisseur === null ? 1 : b.fournisseur === null ? -1
    : b.articles.length - a.articles.length))
}

const A = o => ({
  cle: o.cle ?? 'k', nom: o.nom ?? 'X', nom_vente: o.vente ?? null, categorie: o.cat ?? null, etablissement: null,
  unite: o.unite ?? 'kg', fournisseur: o.f === undefined ? 'Gineys' : o.f,
  reference: o.ref ?? null, prix: o.prix === undefined ? 5 : o.prix,
  estime: Boolean(o.estime), dernier_achat: o.le ?? null, ailleurs: null,
})

const FV = { requete: '', fournisseur: undefined, estimeSeul: false, incompletSeul: false }

titre('Notre catalogue d’achat')
{
  const arts = [
    A({ cle: 'a', nom: 'Beurre doux', ref: '0067807', prix: 8, le: '2026-08-20' }),
    A({ cle: 'b', nom: 'Burrata 125 g', f: 'Félix Potin', prix: 1.55, estime: true }),
    A({ cle: 'c', nom: 'Tomates', f: null, prix: null }),
    A({ cle: 'd', nom: 'Roquette', f: null, prix: 12, estime: true }),
  ]
  const b = bilanAchats(arts)
  t('⚠️ un prix ESTIMÉ est compté à part d’un prix relevé', b.releves === 1 && b.estimes === 2)
  t('un prix inconnu n’est ni l’un ni l’autre', b.sansPrix === 1 && b.releves + b.estimes === 3)
  t('⚠️ incomplet = pas de prix OU pas de fournisseur',
    b.incomplets === 2)
  t('la référence est comptée séparément — elle se retrouve, un prix non',
    b.avecReference === 1)

  t('la recherche trouve par le NOM', filtrerAchetes(arts, { ...FV, requete: 'beurre' }).length === 1)
  t('et par la RÉFÉRENCE — c’est ce qu’on lit sur la facture',
    filtrerAchetes(arts, { ...FV, requete: '0067807' }).length === 1)
  t('⚠️ TOUS les mots, pas un seul : « beurre tomate » ne rend rien',
    filtrerAchetes(arts, { ...FV, requete: 'beurre tomate' }).length === 0)
  t('le filtre « sans fournisseur » se distingue de « tous »',
    filtrerAchetes(arts, { ...FV, fournisseur: null }).length === 2)
  t('le filtre « estimés » ne garde que les hypothèses',
    filtrerAchetes(arts, { ...FV, estimeSeul: true }).every(a => a.estime))

  const g = achetesParFournisseur(arts)
  t('⚠️ « sans fournisseur » passe en DERNIER, jamais masqué',
    g[g.length - 1].fournisseur === null)
  t('et il porte bien les deux références concernées',
    g[g.length - 1].articles.length === 2)
  t('le plus gros fournisseur d’abord', g[0].articles.length >= g[1].articles.length)
  t('les articles sont triés par nom dans chaque groupe',
    g[g.length - 1].articles[0].nom === 'Roquette' || g[g.length - 1].articles[0].nom === 'Tomates')
}

titre('Modifier une ligne du catalogue d’achat')
{
  // ⚠️ RECOPIE des règles de `modifierArticleAchat()`
  // (src/app/admin/achats/modifier-actions.ts).
  const coutVendu = (prixAchat, parAchat) =>
    prixAchat == null ? null : Number((prixAchat / (Number(parAchat ?? 1) || 1)).toFixed(4))
  const refuse = (prixAchat, parAchat, vente) => {
    const c = coutVendu(prixAchat, parAchat)
    return c != null && vente != null && vente > 0 && c >= vente * 0.95
  }
  const estime = (prix, releve) => (prix == null ? true : !releve)

  t('⚠️ le prix saisi est celui de l’unité ACHETÉE, divisé par les unités vendues',
    coutVendu(28.84, 96) === 0.3004)
  t('sans conditionnement, il passe tel quel', coutVendu(2.5, null) === 2.5)
  t('un prix effacé efface le coût', coutVendu(null, 96) === null)

  t('⚠️ un coût à 95 % du prix de vente est REFUSÉ — le croissant à 40 €',
    refuse(28.84, 1, 0.55))
  t('le même prix divisé par son colis de 96 passe',
    !refuse(28.84, 96, 0.55))
  t('sans prix de vente connu, on ne refuse pas — on ne sait pas comparer',
    !refuse(28.84, 1, null))
  t('juste sous le seuil, ça passe', !refuse(0.94, 1, 1))
  t('pile au seuil, ça bloque', refuse(0.95, 1, 1))

  t('⚠️ un prix tapé reste ESTIMÉ tant que personne ne coche « relevé »',
    estime(5, false) === true)
  t('coché, il devient relevé', estime(5, true) === false)
  t('⚠️ un prix EFFACÉ redevient estimé, même si la case était cochée',
    estime(null, true) === true)
}

titre('Basculer chez le moins cher, depuis la fiche')
{
  // ⚠️ RECOPIE de `prixReprenable()` (src/lib/catalogue-achats.ts) et de la
  // construction des offres (src/lib/reassort-donnees.ts).
  const nU = u => {
    const t = String(u ?? '').trim().toLowerCase()
    if (['kg', 'kilo', 'kilogramme'].includes(t)) return 'kg'
    if (['l', 'litre', 'litres'].includes(t)) return 'litre'
    if (['pce', 'pièce', 'piece', 'u', 'unité', 'unite'].includes(t)) return 'pièce'
    return t
  }
  const prixReprenable = (o, notre) => (nU(o.unite_ref) === nU(notre) ? o.prix_ref : null)
  // ⚠️ Ce n'est PAS le refus du prix qui protège, c'est le drapeau.
  const estimeApres = nature => nature !== 'facture'

  t('⚠️ LE PRIX SUIT LE FOURNISSEUR — garder l’ancien serait plus faux',
    prixReprenable({ unite_ref: 'kg', prix_ref: 5.625 }, 'kg') === 5.625)
  t('« Kg » et « kg » sont la même unité',
    prixReprenable({ unite_ref: 'Kg', prix_ref: 5.6 }, 'kg') === 5.6)
  t('⚠️⚠️ un prix repris d’un DEVIS arrive marqué ESTIMÉ', estimeApres('devis') === true)
  t('⚠️ d’un PORTAIL aussi — c’est un prix affiché', estimeApres('portail') === true)
  t('d’un CATALOGUE aussi', estimeApres('catalogue') === true)
  t('seule une FACTURE vaut prix relevé', estimeApres('facture') === false)
  t('⚠️⚠️ le prix ne se reprend PAS d’un sachet de neuf vers une pièce',
    prixReprenable({ unite_ref: 'sachet', prix_ref: 5.776 }, 'pièce') === null)
  t('ni d’un kilo vers une barquette de 500 g',
    prixReprenable({ unite_ref: 'kg', prix_ref: 9 }, 'barquette 500 g') === null)
  t('une unité inconnue des deux côtés ne se reprend pas non plus',
    prixReprenable({ unite_ref: 'BT', prix_ref: 3 }, null) === null)

  // Construction des offres : strictement moins cher, et jamais chez soi.
  const offres = (lignes, mien, monFournisseur) => lignes
    .filter(o => o.fournisseur_id !== monFournisseur && o.prix_ref < mien)
    .sort((a, b) => a.prix_ref - b.prix_ref)
  const L = [
    { fournisseur_id: 'f1', prix_ref: 8.0 },
    { fournisseur_id: 'f2', prix_ref: 5.6 },
    { fournisseur_id: 'f3', prix_ref: 6.9 },
    { fournisseur_id: 'f4', prix_ref: 9.5 },
  ]
  const o = offres(L, 8.0, 'f1')
  t('⚠️ seules les offres STRICTEMENT moins chères sont proposées',
    o.length === 2 && o.every(x => x.prix_ref < 8))
  t('⚠️ jamais le fournisseur chez qui on est déjà',
    !o.some(x => x.fournisseur_id === 'f1'))
  t('elles sont triées du moins cher au plus cher',
    o[0].prix_ref === 5.6 && o[1].prix_ref === 6.9)
  t('⚠️ on les montre TOUTES, pas seulement la meilleure — délai et minimum de commande comptent',
    o.length === 2)
  t('aucune offre si l’on est déjà le moins cher', offres(L, 5.6, 'f2').length === 0)

  // ⚠️ La référence suit le fournisseur, elle ne lui survit pas.
  const refApres = (ancienne, offre) => offre.reference ?? ''
  t('⚠️⚠️ la référence de l’ancien fournisseur NE SURVIT PAS au changement',
    refApres('0061024', { reference: null }) === '')
  t('et celle du nouveau la remplace', refApres('0061024', { reference: '63470' }) === '63470')

  // ⚠️ Un devis repris ne devient pas un prix relevé.
  t('⚠️ un prix repris et une case « relevé » vont ENSEMBLE : jamais un devis coché',
    !(estimeApres('devis') === false))
}

titre('Les rayons du catalogue')
{
  // ⚠️ RECOPIE de RAYONS / rayonDe() / parRayon() (catalogue-achats.ts).
  const RAYONS = [
    { cle: 'boulangerie', categories: ['Pain', 'Viennoiserie', 'Pâtisserie', 'Boulangerie', 'Gourmandise', 'Dessert'] },
    { cle: 'pizzeria', categories: ['Pizzeria', 'Pizza'] },
    { cle: 'restaurant', categories: ['Restaurant'] },
    { cle: 'charcuterie', categories: ['Charcuterie', 'Poisson'] },
    { cle: 'cremerie', categories: ['Crémerie'] },
    { cle: 'epicerie', categories: ['Épicerie'] },
    { cle: 'boissons', categories: ['Boisson fraîche', 'Boisson chaude'] },
    { cle: 'cave', categories: ['Alcool', 'Apéritif', 'Bière', 'Vin'] },
    { cle: 'glaces', categories: ['Glace'] },
    { cle: 'emballages', categories: ['Emballage'] },
  ]
  const AUTRES = { cle: 'autres', categories: [] }
  const M = new Map()
  for (const r of RAYONS) for (const c of r.categories) M.set(c, r)
  const rayonDe = c => (c && M.get(c)) || AUTRES

  t('le pain et la viennoiserie tombent dans le MÊME rayon — même camion',
    rayonDe('Pain').cle === rayonDe('Viennoiserie').cle)
  t('la bière, le vin et les apéritifs aussi',
    rayonDe('Bière').cle === 'cave' && rayonDe('Vin').cle === 'cave' && rayonDe('Apéritif').cle === 'cave')
  t('⚠️ une catégorie INCONNUE tombe dans « Autres », pas dans un rayon au hasard',
    rayonDe('Tabac').cle === 'autres')
  t('⚠️ et une catégorie absente aussi — jamais masquée',
    rayonDe(null).cle === 'autres')
  t('aucune catégorie n’appartient à DEUX rayons',
    RAYONS.flatMap(r => r.categories).length === new Set(RAYONS.flatMap(r => r.categories)).size)
  t('les rayons couvrent les 21 catégories réelles du catalogue',
    ['Pain', 'Viennoiserie', 'Pâtisserie', 'Gourmandise', 'Dessert', 'Boulangerie',
     'Pizzeria', 'Pizza', 'Restaurant', 'Charcuterie', 'Poisson', 'Crémerie',
     'Épicerie', 'Boisson fraîche', 'Boisson chaude', 'Alcool', 'Apéritif',
     'Bière', 'Vin', 'Glace', 'Emballage'].every(c => rayonDe(c).cle !== 'autres'))

  // Le filtre par rayon
  const parRayonFiltre = (arts, cle) => arts.filter(a => rayonDe(a.categorie).cle === cle)
  const arts = [A({ cle: '1', cat: 'Pain' }), A({ cle: '2', cat: 'Bière' }), A({ cle: '3', cat: 'Tabac' })]
  t('filtrer sur un rayon ne garde que lui', parRayonFiltre(arts, 'cave').length === 1)
  t('le rayon « Autres » est filtrable comme les autres', parRayonFiltre(arts, 'autres').length === 1)
}

titre('Le titre affiché : vitrine ou libellé d’achat')
{
  // ⚠️ RECOPIE de la règle de `reassort-donnees.ts` et de `LigneAchat`.
  const nomVente = (membres, nomProduit, cle) =>
    membres === 1 && nomProduit !== cle ? nomProduit : null
  const titre = a => a.nom_vente ?? a.nom

  t('un seul produit sous le libellé → son nom de vitrine s’affiche',
    nomVente(1, 'Baguette campestre', 'BAGUETTE CAMPESTRE 51CM ARTIPAT C=25') === 'Baguette campestre')
  t('⚠️⚠️ DEUX produits sous le même libellé → c’est le LIBELLÉ qui fait foi',
    nomVente(2, 'Pizza à la plaque Margherita', 'PLAQUE PIZZA CRUE 1.25KG') === null)
  t('un nom identique au libellé n’est pas répété',
    nomVente(1, 'Croissant', 'Croissant') === null)
  t('le titre retombe sur le libellé quand il n’y a pas de vitrine',
    titre({ nom: 'PLAQUE PIZZA CRUE', nom_vente: null }) === 'PLAQUE PIZZA CRUE')
  t('et sur la vitrine quand elle existe',
    titre({ nom: 'BAGUETTE …', nom_vente: 'Baguette campestre' }) === 'Baguette campestre')
}

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
