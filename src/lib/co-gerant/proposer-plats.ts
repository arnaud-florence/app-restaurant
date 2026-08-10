// Co-gérant « Arnaud » · le cerveau de la carte.
//  - genererPropositionsPlats : propose N plats (food cost complet, ingrédients
//    existants ET manquants avec prix estimé).
//  - affinerProposition : réajuste UN plat selon une instruction du gérant
//    (« moins cher », « plus copieux »…) — le peaufinage « on décide ensemble ».
// Côté serveur uniquement.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import {
  coutTotal, coutPortion, foodCostPct, statutFoodCost, prixSuggerePourMarge, round2,
  type StatutFoodCost,
} from '@/lib/foodCost'
import { getContexteResto, creerProposition, getProposition } from './propositions'
import { createIngredient } from '@/app/admin/ingredients/actions'
import { type FamilleId, FAMILLES } from './types'

type IngredientCat = { id: string; nom: string; unite: string; prix_achat_ht: number }

export type LignePlat = {
  ingredient_id: string | null
  nom: string
  categorie: string
  unite: string
  quantite: number
  prix_achat_ht: number
  nouveau: boolean
}

export type PlatPropose = {
  nom: string
  categorie: string
  tag_destination: 'CUISINE' | 'PIZZA' | 'BAR'
  description: string
  nb_portions: number
  tva: number
  prix_vente_ht: number
  ingredients: LignePlat[]
  cout_total: number
  food_cost_pct: number
  statut: StatutFoodCost
}

type IngBrut = { nom?: string; quantite?: number; unite?: string; prix_achat_estime?: number; categorie?: string }
type PlatBrut = {
  nom?: string; categorie?: string; tag_destination?: string; description?: string
  nb_portions?: number; prix_vente_ht?: number; ingredients?: IngBrut[]
}

const MODEL = 'claude-haiku-4-5'

// ── Helpers partagés ─────────────────────────────────────────────

async function chargerCatalogue(sb: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, IngredientCat>> {
  const { data } = await sb.from('ingredients').select('id, nom, unite, prix_achat_ht').eq('actif', true).order('nom')
  const cat = (data ?? []).map(i => ({ id: i.id as string, nom: i.nom as string, unite: i.unite as string, prix_achat_ht: Number(i.prix_achat_ht) }))
  return new Map(cat.map(i => [i.nom.toLowerCase().trim(), i]))
}

function listeStock(byNom: Map<string, IngredientCat>): string {
  const arr = [...byNom.values()]
  return arr.length ? arr.map(i => `- ${i.nom} (${i.unite}, ${i.prix_achat_ht}€/${i.unite})`).join('\n') : '(catalogue vide)'
}

/** Construit un PlatPropose (avec food cost) à partir de la sortie brute de Claude. */
function platDepuisBrut(p: PlatBrut, byNom: Map<string, IngredientCat>): PlatPropose {
  const lignes: LignePlat[] = []
  for (const ing of p.ingredients ?? []) {
    const nom = String(ing.nom ?? '').trim()
    if (!nom) continue
    const q = Number(ing.quantite) || 0
    const match = byNom.get(nom.toLowerCase())
    if (match) {
      lignes.push({ ingredient_id: match.id, nom: match.nom, categorie: '', unite: ing.unite || match.unite, quantite: q, prix_achat_ht: match.prix_achat_ht, nouveau: false })
    } else {
      const prixEst = Number(ing.prix_achat_estime)
      lignes.push({ ingredient_id: null, nom, categorie: String(ing.categorie || 'Divers'), unite: String(ing.unite || 'pièce'), quantite: q, prix_achat_ht: Number.isFinite(prixEst) ? prixEst : 0, nouveau: true })
    }
  }
  const total = round2(coutTotal(lignes.map(l => ({ quantite: l.quantite, prix_achat_ht: l.prix_achat_ht }))))
  const nbPort = Number(p.nb_portions) || 1
  const cp = coutPortion(total, nbPort)
  const prix = round2(Number(p.prix_vente_ht) || prixSuggerePourMarge(cp, 72))
  const fc = round2(foodCostPct(cp, prix))
  const tag = (p.tag_destination === 'PIZZA' || p.tag_destination === 'BAR') ? p.tag_destination : 'CUISINE'
  return {
    nom: String(p.nom ?? 'Plat sans nom'),
    categorie: String(p.categorie ?? 'Plat'),
    tag_destination: tag,
    description: String(p.description ?? ''),
    nb_portions: nbPort, tva: 10, prix_vente_ht: prix,
    ingredients: lignes, cout_total: total, food_cost_pct: fc, statut: statutFoodCost(fc),
  }
}

/** Les champs d'une proposition « ajouter un plat » (partagés création/ajustement). */
function champsProposition(plat: PlatPropose) {
  const nbNouveaux = plat.ingredients.filter(l => l.nouveau).length
  const listeNoms = plat.ingredients.map(l => l.nouveau ? `✨ ${l.nom}` : l.nom).join(', ')
  return {
    titre: `Ajouter « ${plat.nom} »`,
    resume: `${plat.categorie} · ${plat.prix_vente_ht.toFixed(2)} € HT · food cost ${plat.food_cost_pct.toFixed(0)} %`,
    details: plat.description
      + (listeNoms ? `\n\n🧾 ${listeNoms}` : '')
      + (nbNouveaux ? `\n✨ ${nbNouveaux} ingrédient${nbNouveaux > 1 ? 's' : ''} à créer (prix estimé).` : ''),
    urgence: (plat.statut === 'rouge' ? 'orange' : 'info') as 'orange' | 'info',
    action_type: 'create_recette',
    action_payload: {
      recette: {
        nom: plat.nom, categorie: plat.categorie, tag_destination: plat.tag_destination,
        description: plat.description, temps_preparation: 0, nb_portions: plat.nb_portions,
        prix_vente_ht: plat.prix_vente_ht, tva: plat.tva,
      },
      ingredients: plat.ingredients,
    },
  }
}

async function appelClaude(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  const client = new Anthropic({ apiKey })
  const resp = await client.messages.create({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  return resp.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n').trim()
}

function parseJson<T>(txt: string): T {
  try { return JSON.parse(txt) as T }
  catch { const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('Réponse IA non parsable'); return JSON.parse(m[0]) as T }
}

// Extrait les objets {…} de premier niveau d'un texte (slice d'un tableau JSON),
// en tolérant une troncature : le dernier objet incomplet est simplement ignoré.
function extraireObjetsTopLevel(slice: string): Record<string, unknown>[] {
  const objs: Record<string, unknown>[] = []
  let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') { if (depth === 0) start = i; depth++ }
    else if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try { objs.push(JSON.parse(slice.slice(start, i + 1)) as Record<string, unknown>) } catch { /* objet incomplet → ignoré */ }
        start = -1
      }
    }
  }
  return objs
}

// Parse une liste sous une clé donnée ({"plats":[…]} / {"boissons":[…]}), robuste à la troncature.
function parseListe<T>(txt: string, key: string): T[] {
  try {
    const full = JSON.parse(txt) as Record<string, unknown>
    if (Array.isArray(full?.[key])) return full[key] as T[]
  } catch { /* on tente la récupération partielle */ }
  const m = txt.match(new RegExp(`"${key}"\\s*:\\s*\\[`))
  const from = m && m.index != null ? m.index + m[0].length : txt.indexOf('[')
  if (from < 0) return []
  return extraireObjetsTopLevel(txt.slice(from)) as T[]
}

// ── Génération de la carte ───────────────────────────────────────

export async function genererPropositionsPlats(opts?: {
  nb?: number; persister?: boolean
}): Promise<{ plats: PlatPropose[]; propositionsCreees: number }> {
  const nb = opts?.nb ?? 6
  const sb = await createClient()
  const ctx = await getContexteResto()
  const { data: nomRow } = await sb.from('parametres').select('valeur').eq('cle', 'etablissement_nom').maybeSingle()
  const restoNom = (nomRow?.valeur as string | null) ?? 'CASATASIA'
  const byNom = await chargerCatalogue(sb)

  const concept = ctx.cg_concept || 'pizzeria-trattoria italienne conviviale'
  const style = ctx.cg_style_cuisine || 'cuisine italienne maison'
  const gamme = ctx.cg_gamme_prix || 'plat 12-18 €'
  const specialites = ctx.cg_specialites ? `, spécialités : ${ctx.cg_specialites}` : ''

  const prompt = `Tu es un chef-consultant en restauration. Tu aides "${restoNom}" (${concept}, ${style}, gamme ${gamme}${specialites}) à bâtir sa carte (carte équilibrée, food cost cible < 30%).

Ingrédients DÉJÀ en stock (réutilise-les en priorité, nom EXACT) :
${listeStock(byNom)}

Propose ${nb} plats cohérents, quantités réalistes par portion. Pour chaque ingrédient absent de la liste, donne aussi "prix_achat_estime" (prix d'achat HT réaliste au €/unité, resto France) et "categorie".

Réponds UNIQUEMENT en JSON strict (pas de markdown) :
{"plats":[{"nom":"...","categorie":"Entrée|Plat|Pizza|Dessert","tag_destination":"CUISINE|PIZZA|BAR","description":"phrase courte appétissante","nb_portions":1,"prix_vente_ht":12.5,"ingredients":[{"nom":"...","quantite":0.15,"unite":"kg","prix_achat_estime":9.5,"categorie":"Fromage"}]}]}`

  const txt = await appelClaude(prompt, 6000)
  const plats = parseListe<PlatBrut>(txt, 'plats').map(p => platDepuisBrut(p, byNom))

  let created = 0
  if (opts?.persister) {
    for (const plat of plats) {
      await creerProposition({ domaine: 'carte', type: 'completer', cible_url: '/admin/recettes', ...champsProposition(plat) })
      created++
    }
  }
  return { plats, propositionsCreees: created }
}

// ── Ajustement d'un plat (le dialogue libre) ─────────────────────

export async function affinerProposition(id: string, instruction: string): Promise<{ ok: boolean; explication: string }> {
  const sb = await createClient()
  const prop = await getProposition(id)
  if (!prop || prop.action_type !== 'create_recette' || !prop.action_payload) throw new Error('Proposition non ajustable')
  const payload = prop.action_payload as { recette: { nom?: string; description?: string; prix_vente_ht?: number }; ingredients?: LignePlat[] }
  const ctx = await getContexteResto()
  const byNom = await chargerCatalogue(sb)
  const concept = ctx.cg_concept || 'pizzeria-trattoria italienne conviviale'
  const r = payload.recette
  const ingActuels = (payload.ingredients ?? [])
    .map(l => `- ${l.nom} ${l.quantite}${l.unite} (${l.prix_achat_ht}€/${l.unite}${l.nouveau ? ', nouveau' : ''})`).join('\n')

  const prompt = `Tu es chef-consultant pour "${concept}".
Plat actuel :
- Nom : ${r.nom}
- Description : ${r.description ?? ''}
- Prix de vente HT : ${r.prix_vente_ht} €
- Ingrédients :
${ingActuels || '(aucun)'}

Le gérant demande : « ${instruction} »

Révise le plat en conséquence, garde-le cohérent et appétissant. Si tu utilises un ingrédient absent du stock ci-dessous, donne "prix_achat_estime" + "categorie".
Ingrédients en stock :
${listeStock(byNom)}

Réponds UNIQUEMENT en JSON strict :
{"plat":{"nom":"...","categorie":"...","tag_destination":"CUISINE|PIZZA|BAR","description":"...","nb_portions":1,"prix_vente_ht":12.5,"ingredients":[{"nom":"...","quantite":0.15,"unite":"kg","prix_achat_estime":9.5,"categorie":"..."}]},"explication":"ce que tu as changé, 1 phrase courte"}`

  const txt = await appelClaude(prompt, 1800)
  const parsed = parseJson<{ plat?: PlatBrut; explication?: string }>(txt)
  if (!parsed.plat) throw new Error('Pas de plat révisé')

  const plat = platDepuisBrut(parsed.plat, byNom)
  const explication = String(parsed.explication || 'Plat ajusté.')
  const champs = champsProposition(plat)
  const echanges = [
    ...(prop.echanges ?? []),
    { role: 'gerant', texte: instruction, at: new Date().toISOString() },
    { role: 'arnaud', texte: explication, at: new Date().toISOString() },
  ]

  await sb.from('propositions').update({
    titre: champs.titre, resume: champs.resume, details: champs.details,
    urgence: champs.urgence, action_payload: champs.action_payload,
    echanges, statut: 'en_discussion', updated_at: new Date().toISOString(),
  }).eq('id', id)

  return { ok: true, explication }
}

// ── Remplir le food cost manquant (Arnaud le fait lui-même) ──────
// Ajoute des ingrédients aux recettes qui n'en ont aucune → food cost calculable.

export async function remplirFoodCostManquant(max = 8): Promise<{ recettesCompletees: number; ingredientsCrees: number }> {
  const sb = await createClient()
  const { data: riRows } = await sb.from('recette_ingredients').select('recette_id')
  const avec = new Set((riRows ?? []).map(r => r.recette_id))
  const { data: recRows } = await sb.from('recettes').select('id, nom, description').eq('actif', true)
  const sansIng = (recRows ?? []).filter(r => !avec.has(r.id)).slice(0, max)
  if (sansIng.length === 0) return { recettesCompletees: 0, ingredientsCrees: 0 }

  const byNom = await chargerCatalogue(sb)
  let recettesCompletees = 0
  let ingredientsCrees = 0

  for (const rec of sansIng) {
    let lignesBrut: IngBrut[] = []
    try {
      const prompt = `Plat : "${rec.nom}"${rec.description ? ` — ${rec.description}` : ''}.
Donne ses ingrédients réalistes par portion. Réutilise en priorité ceux en stock (nom EXACT). Pour un ingrédient absent, donne "prix_achat_estime" (HT €/unité) + "categorie".
Ingrédients en stock :
${listeStock(byNom)}
Réponds UNIQUEMENT en JSON : {"ingredients":[{"nom":"...","quantite":0.15,"unite":"kg","prix_achat_estime":9.5,"categorie":"..."}]}`
      const txt = await appelClaude(prompt, 1200)
      lignesBrut = parseJson<{ ingredients?: IngBrut[] }>(txt).ingredients ?? []
    } catch { continue }

    const rows: Array<{ recette_id: string; ingredient_id: string; quantite: number; unite: string }> = []
    for (const ing of lignesBrut) {
      const nom = String(ing.nom ?? '').trim()
      if (!nom) continue
      const q = Number(ing.quantite) || 0
      const unite = String(ing.unite || byNom.get(nom.toLowerCase())?.unite || 'pièce')
      const match = byNom.get(nom.toLowerCase())
      let ingId: string
      if (match) {
        ingId = match.id
      } else {
        const { data: ex } = await sb.from('ingredients').select('id').ilike('nom', nom).limit(1).maybeSingle()
        if (ex?.id) {
          ingId = ex.id as string
        } else {
          const prix = Number(ing.prix_achat_estime) || 0
          const created = await createIngredient({
            nom, categorie: String(ing.categorie || 'Divers'), unite, prix_achat_ht: prix,
            stock_actuel: 0, stock_minimum: 0, stock_maximum: 0, dlc_moyenne_jours: 0, allergenes: [],
          })
          ingId = created.id
          ingredientsCrees++
          byNom.set(nom.toLowerCase(), { id: created.id, nom, unite, prix_achat_ht: prix })
        }
      }
      rows.push({ recette_id: rec.id, ingredient_id: ingId, quantite: q, unite })
    }
    if (rows.length) {
      await sb.from('recette_ingredients').insert(rows)
      recettesCompletees++
    }
  }
  return { recettesCompletees, ingredientsCrees }
}

// ── Renseigner les prix d'ingrédients manquants (Arnaud le fait) ─────
// Estime un prix d'achat de marché pour les ingrédients à 0 / sans prix.

export async function remplirPrixIngredientsManquants(max = 50): Promise<{ ingredientsMisAJour: number }> {
  const sb = await createClient()
  const { data } = await sb.from('ingredients')
    .select('id, nom, unite')
    .eq('actif', true)
    .or('prix_achat_ht.is.null,prix_achat_ht.eq.0')
    .limit(max)
  const cibles = (data ?? []) as Array<{ id: string; nom: string; unite: string }>
  if (cibles.length === 0) return { ingredientsMisAJour: 0 }

  const liste = cibles.map((i, idx) => `${idx + 1}. ${i.nom} (${i.unite})`).join('\n')
  const prompt = `Donne le prix d'achat HT réaliste (prix de gros/fournisseur, au €/unité, pour un restaurant en France) de CHAQUE ingrédient ci-dessous.
${liste}
Réponds UNIQUEMENT en JSON : {"prix":[{"nom":"<nom EXACT>","prix_achat_ht":9.5}]}`

  let parsed: { prix?: Array<{ nom?: string; prix_achat_ht?: number }> }
  try { parsed = parseJson<{ prix?: Array<{ nom?: string; prix_achat_ht?: number }> }>(await appelClaude(prompt, 2500)) }
  catch { return { ingredientsMisAJour: 0 } }

  const byNom = new Map(cibles.map(c => [c.nom.toLowerCase().trim(), c]))
  let n = 0
  for (const p of parsed.prix ?? []) {
    const match = byNom.get(String(p.nom ?? '').toLowerCase().trim())
    const prix = Number(p.prix_achat_ht)
    if (match && Number.isFinite(prix) && prix > 0) {
      await sb.from('ingredients').update({ prix_achat_ht: round2(prix), updated_at: new Date().toISOString() }).eq('id', match.id)
      n++
    }
  }
  return { ingredientsMisAJour: n }
}

// ════════════════════════════════════════════════════════════════════
//  CARTE COMPLÈTE — Arnaud bâtit chaque famille (entrées → bar)
//  Une génération par famille = une requête courte (pas de timeout serveur).
// ════════════════════════════════════════════════════════════════════

const FAMILLE_CFG: Record<FamilleId, {
  categorie: string
  tag: 'CUISINE' | 'PIZZA' | 'BAR'
  nb: number
  guide: string
}> = {
  entrees:  { categorie: 'Entrée',   tag: 'CUISINE', nb: 4, guide: 'entrées de brasserie (froides et chaudes), simples et qui se vendent' },
  plats:    { categorie: 'Plat',     tag: 'CUISINE', nb: 6, guide: 'plats principaux variés (viande, poisson, pâtes/risotto, au moins une option végétarienne)' },
  desserts: { categorie: 'Dessert',  tag: 'CUISINE', nb: 4, guide: 'desserts maison classiques et gourmands' },
  pizzas:   { categorie: 'Pizza',    tag: 'PIZZA',   nb: 6, guide: 'pizzas à pâte fine (bases tomate ET bases crème), garnitures équilibrées' },
  snacking: { categorie: 'Snacking', tag: 'CUISINE', nb: 5, guide: 'snacking à emporter et sur place : burgers, paninis, croque, wraps, frites garnies' },
  bar:      { categorie: 'Bar',      tag: 'BAR',     nb: 6, guide: '' },
}

// Types de boissons valides côté table `boissons` (doit matcher le schéma boissons).
const BOISSON_TYPES = ['vin', 'champagne', 'biere_pression', 'biere_bouteille', 'soft', 'eau', 'spiritueux', 'cafe_the', 'cocktail', 'autre'] as const
type BoissonType = typeof BOISSON_TYPES[number]
const TYPE_LABEL: Record<BoissonType, string> = {
  vin: 'Vin', champagne: 'Champagne', biere_pression: 'Bière', biere_bouteille: 'Bière',
  soft: 'Soft', eau: 'Eau', spiritueux: 'Spiritueux', cafe_the: 'Café / thé', cocktail: 'Cocktail', autre: 'Boisson',
}

type BoissonBrut = {
  nom?: string; type?: string; description?: string
  prix_achat_ht_verre?: number; prix_vente_ht_verre?: number; contenance_verre_cl?: number; tva?: number
}

/** Noms déjà présents (recettes d'une catégorie) — pour éviter les doublons. */
async function nomsRecettesCategorie(sb: Awaited<ReturnType<typeof createClient>>, categorie: string): Promise<string[]> {
  const { data } = await sb.from('recettes').select('nom').eq('categorie', categorie).limit(80)
  return (data ?? []).map(r => r.nom as string)
}

/** Champs d'une proposition « ajouter une boisson » (food cost = coût matière / prix). */
function champsPropositionBoisson(b: BoissonBrut): {
  titre: string; resume: string; details: string; urgence: 'orange' | 'info'
  action_type: string; action_payload: unknown
} | null {
  const nom = String(b.nom ?? '').trim()
  if (!nom) return null
  const type: BoissonType = (BOISSON_TYPES as readonly string[]).includes(String(b.type)) ? (b.type as BoissonType) : 'autre'
  const cout = round2(Math.max(0, Number(b.prix_achat_ht_verre) || 0))
  const prix = round2(Number(b.prix_vente_ht_verre) || prixSuggerePourMarge(cout, 78))
  const cont = Math.max(1, Math.round(Number(b.contenance_verre_cl) || 12))
  const tva = Number(b.tva) || 20
  const fc = prix > 0 ? round2((cout / prix) * 100) : 0
  const label = TYPE_LABEL[type]
  return {
    titre: `Ajouter « ${nom} »`,
    resume: `${label} · ${prix.toFixed(2)} € le verre · food cost ${fc.toFixed(0)} %`,
    details: String(b.description ?? '') + `\n\n🥃 Coût matière ${cout.toFixed(2)} € / verre ${cont} cl`,
    urgence: (fc > 32 ? 'orange' : 'info'),
    action_type: 'create_boisson',
    action_payload: {
      boisson: { nom, type, description: String(b.description ?? ''), prix_achat_ht_verre: cout, prix_vente_ht_verre: prix, contenance_verre_cl: cont, tva },
    },
  }
}

/** Génère la famille BAR (boissons) — chemin create_boisson. */
async function genererFamilleBar(
  sb: Awaited<ReturnType<typeof createClient>>,
  ctx: Awaited<ReturnType<typeof getContexteResto>>,
  nb: number,
  persister: boolean,
): Promise<{ items: number }> {
  const concept = ctx.cg_concept || 'brasserie conviviale'
  const { data: existing } = await sb.from('boissons').select('nom').limit(120)
  const deja = (existing ?? []).map(b => b.nom as string)
  const prompt = `Tu es chef de bar pour "${concept}". Compose ${nb} boissons variées et qui marchent : cocktails signature, softs maison, éventuellement un vin au verre.
Ne propose PAS ces boissons déjà à la carte : ${deja.length ? deja.join(', ') : '(aucune)'}.
Pour CHAQUE boisson donne : le coût matière par verre (prix_achat_ht_verre, HT €), le prix de vente HT au verre (prix_vente_ht_verre), la contenance (cl) et la TVA (20 pour alcool, 10 pour soft/café). Food cost cible 18-25 %.
Réponds UNIQUEMENT en JSON strict (pas de markdown) :
{"boissons":[{"nom":"...","type":"cocktail|soft|vin|biere_bouteille|spiritueux|cafe_the|eau","description":"phrase courte appétissante","prix_achat_ht_verre":1.8,"prix_vente_ht_verre":8.0,"contenance_verre_cl":12,"tva":20}]}`
  const boissons = parseListe<BoissonBrut>(await appelClaude(prompt, 3000), 'boissons')
  let created = 0
  if (persister) {
    for (const b of boissons) {
      const champs = champsPropositionBoisson(b)
      if (!champs) continue
      await creerProposition({ domaine: 'carte', type: 'completer', cible_url: '/admin/boissons', ...champs })
      created++
    }
  }
  return { items: created }
}

/** Génère UNE famille de la carte (entrées, plats, pizzas, snacking, desserts ou bar). */
export async function genererFamille(famId: FamilleId, persister = true): Promise<{ items: number }> {
  const cfg = FAMILLE_CFG[famId]
  const sb = await createClient()
  const ctx = await getContexteResto()
  const kind = FAMILLES.find(f => f.id === famId)?.kind ?? 'food'

  if (kind === 'drink') return genererFamilleBar(sb, ctx, cfg.nb, persister)

  const byNom = await chargerCatalogue(sb)
  const { data: nomRow } = await sb.from('parametres').select('valeur').eq('cle', 'etablissement_nom').maybeSingle()
  const restoNom = (nomRow?.valeur as string | null) ?? 'CASATASIA'
  const concept = ctx.cg_concept || 'brasserie-pizzeria conviviale'
  const style = ctx.cg_style_cuisine || 'cuisine maison de brasserie'
  const gamme = ctx.cg_gamme_prix || 'plat 12-18 €'
  const specialites = ctx.cg_specialites ? `, spécialités : ${ctx.cg_specialites}` : ''
  const deja = await nomsRecettesCategorie(sb, cfg.categorie)

  const prompt = `Tu es chef-consultant en restauration. Tu bâtis la rubrique "${cfg.categorie}" de la carte de "${restoNom}" (${concept}, ${style}, gamme ${gamme}${specialites}).
Objectif : ${cfg.nb} ${cfg.guide}. Food cost cible < 30 %. Des propositions cohérentes, réalistes et qui se vendent.
Ne propose PAS ces plats déjà présents : ${deja.length ? deja.join(', ') : '(aucun)'}.

Ingrédients déjà en stock (réutilise-les en priorité, nom EXACT) :
${listeStock(byNom)}

Pour chaque ingrédient absent de la liste, donne aussi "prix_achat_estime" (prix d'achat HT réaliste au €/unité, resto France) et "categorie". Quantités réalistes par portion.
Réponds UNIQUEMENT en JSON strict (pas de markdown) :
{"plats":[{"nom":"...","description":"phrase courte appétissante","nb_portions":1,"prix_vente_ht":12.5,"ingredients":[{"nom":"...","quantite":0.15,"unite":"kg","prix_achat_estime":9.5,"categorie":"..."}]}]}`

  const maxTok = cfg.nb >= 5 ? 6000 : 4000
  const plats = parseListe<PlatBrut>(await appelClaude(prompt, maxTok), 'plats')
    .map(p => platDepuisBrut({ ...p, categorie: cfg.categorie, tag_destination: cfg.tag }, byNom))

  let created = 0
  if (persister) {
    for (const plat of plats) {
      await creerProposition({ domaine: 'carte', type: 'completer', cible_url: '/admin/recettes', ...champsProposition(plat) })
      created++
    }
  }
  return { items: created }
}

// ── Ajustement instantané du prix (sans IA) — « prix à la hausse / à la baisse » ──
// Recalcule le food cost localement à partir des ingrédients déjà chiffrés.

export async function ajusterPrixProposition(id: string, nouveauPrixHt: number): Promise<{ ok: boolean; prix: number; foodCost: number }> {
  const sb = await createClient()
  const prop = await getProposition(id)
  if (!prop || !prop.action_payload) throw new Error('Proposition introuvable')
  const prix = round2(Math.max(0, Number(nouveauPrixHt) || 0))

  if (prop.action_type === 'create_recette') {
    const pl = prop.action_payload as { recette: { categorie?: string; nb_portions?: number; prix_vente_ht?: number }; ingredients?: LignePlat[] }
    const total = round2(coutTotal((pl.ingredients ?? []).map(l => ({ quantite: l.quantite, prix_achat_ht: l.prix_achat_ht }))))
    const cp = coutPortion(total, Number(pl.recette.nb_portions) || 1)
    const fc = round2(foodCostPct(cp, prix))
    pl.recette.prix_vente_ht = prix
    const cat = String(pl.recette.categorie ?? 'Plat')
    await sb.from('propositions').update({
      action_payload: pl,
      resume: `${cat} · ${prix.toFixed(2)} € HT · food cost ${fc.toFixed(0)} %`,
      urgence: statutFoodCost(fc) === 'rouge' ? 'orange' : 'info',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return { ok: true, prix, foodCost: fc }
  }

  if (prop.action_type === 'create_boisson') {
    const pl = prop.action_payload as { boisson: { type?: string; prix_achat_ht_verre?: number; contenance_verre_cl?: number; prix_vente_ht_verre?: number } }
    const cout = round2(Number(pl.boisson.prix_achat_ht_verre) || 0)
    const fc = prix > 0 ? round2((cout / prix) * 100) : 0
    pl.boisson.prix_vente_ht_verre = prix
    const t = String(pl.boisson.type ?? 'autre') as BoissonType
    const label = TYPE_LABEL[t] ?? 'Boisson'
    await sb.from('propositions').update({
      action_payload: pl,
      resume: `${label} · ${prix.toFixed(2)} € le verre · food cost ${fc.toFixed(0)} %`,
      urgence: fc > 32 ? 'orange' : 'info',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return { ok: true, prix, foodCost: fc }
  }

  throw new Error('Prix non ajustable pour cette proposition')
}
