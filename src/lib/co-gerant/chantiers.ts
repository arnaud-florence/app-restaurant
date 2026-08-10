// Co-gérant « Arnaud » · les CHANTIERS.
// Arnaud fait le tour du resto (stock, prix, food cost, recettes, boissons…),
// repère ce qu'il y a à faire, et te SOUMET un chantier — qu'il peut lancer
// lui-même (réassort, prix, food cost, proposer des plats) ou un lien pour t'en
// occuper. Même boucle que la carte : tu valides → il agit → il rend compte.
// Côté serveur uniquement.

import { createClient } from '@/lib/supabase/server'
import { creerProposition, getProposition, marquerFaite } from './propositions'
import { autoGenererBonsDepuisStock } from '@/app/admin/fournisseurs/actions'
import { remplirPrixIngredientsManquants, remplirFoodCostManquant, genererFamille } from './proposer-plats'
import { type PropositionType, type PropositionUrgence, type FamilleId } from './types'

type ChantierCand = {
  domaine: string
  type: PropositionType
  titre: string            // STABLE — sert de clé de dédup avec le domaine
  resume: string
  details: string
  urgence: PropositionUrgence
  action_type: string | null   // preparer_reassort | remplir_prix | remplir_food_cost | generer_famille | null
  action_payload?: unknown
  cible_url?: string | null
}

// Alertes des 15 agents → quel domaine de chantier (hors-carte uniquement).
// On ne promeut PAS stock (déjà couvert en propre) ni les agents temps réel.
const AGENT_DOMAINE: Record<string, string> = {
  haccp:      'hygiene',
  rh:         'rh',
  financier:  'finances',
  securite:   'securite',
  commercial: 'clients',
  legal:      'legal',
}

// ── L'AUDIT : Arnaud fait le tour du resto ───────────────────────────
export async function auditerChantiers(persister = true): Promise<{ crees: number; total: number }> {
  const sb = await createClient()
  const cands: ChantierCand[] = []

  // 1) STOCK — ruptures & alertes sous le seuil → préparer le réassort
  const { data: ingRows } = await sb.from('ingredients')
    .select('id, stock_actuel, stock_minimum, prix_achat_ht, actif').eq('actif', true)
  const ings = ingRows ?? []
  const ruptures = ings.filter(i => Number(i.stock_actuel) <= 0).length
  const alertes = ings.filter(i => Number(i.stock_actuel) > 0 && Number(i.stock_actuel) <= Number(i.stock_minimum)).length
  if (ruptures + alertes > 0) {
    cands.push({
      domaine: 'stock', type: 'mettre_en_place', titre: 'Préparer le réassort stock',
      resume: `${ruptures} rupture(s) · ${alertes} sous le seuil`,
      details: `${ruptures} ingrédient(s) en rupture et ${alertes} sous le minimum. Je prépare les bons de commande en brouillon, groupés par fournisseur — tu vérifies et tu envoies.`,
      urgence: ruptures > 0 ? 'rouge' : 'orange',
      action_type: 'preparer_reassort', cible_url: '/admin/fournisseurs',
    })
  }

  // 2) INGRÉDIENTS — prix d'achat manquants → fausse le food cost
  const sansPrix = ings.filter(i => !Number(i.prix_achat_ht)).length
  if (sansPrix > 0) {
    cands.push({
      domaine: 'ingredients', type: 'completer', titre: 'Renseigner les prix d’ingrédients manquants',
      resume: `${sansPrix} ingrédient(s) sans prix d’achat`,
      details: `${sansPrix} ingrédient(s) n’ont pas de prix → leur food cost est faux. Je renseigne des prix de marché réalistes, tu ajustes si besoin.`,
      urgence: 'jaune', action_type: 'remplir_prix', cible_url: '/admin/ingredients',
    })
  }

  // 3 & 4) RECETTES — sans food cost calculable + food cost trop élevé
  const { data: recRows } = await sb.from('recettes')
    .select('id, categorie, prix_vente_ht, nb_portions, actif').eq('actif', true)
  const recs = recRows ?? []
  const { data: riRows } = await sb.from('recette_ingredients').select('recette_id, ingredient_id, quantite')
  const ris = riRows ?? []
  const avecIng = new Set(ris.map(r => r.recette_id as string))
  const sansIng = recs.filter(r => !avecIng.has(r.id as string)).length
  if (sansIng > 0) {
    cands.push({
      domaine: 'recettes', type: 'completer', titre: 'Compléter les recettes sans food cost',
      resume: `${sansIng} recette(s) sans ingrédient`,
      details: `${sansIng} plat(s) n’ont pas d’ingrédients → impossible de calculer leur food cost. Je leur ajoute des ingrédients réalistes pour fiabiliser tes marges.`,
      urgence: 'orange', action_type: 'remplir_food_cost', cible_url: '/admin/recettes',
    })
  }

  // food cost > 32 % (coût matière / prix de vente)
  const prixById = new Map(ings.map(i => [i.id as string, Number(i.prix_achat_ht) || 0]))
  const coutByRec = new Map<string, number>()
  for (const r of ris) {
    const p = prixById.get(r.ingredient_id as string) ?? 0
    coutByRec.set(r.recette_id as string, (coutByRec.get(r.recette_id as string) ?? 0) + Number(r.quantite) * p)
  }
  const HORS_FOOD = /vin|champagne|boisson|bi[èe]re|spiritueux|\bsoft\b|cocktail|caf[ée]|th[ée]|\beau\b|ap[ée]ritif|digestif|alcool|whisky|rhum|gin|vodka/i
  let tropCher = 0
  for (const rec of recs) {
    if (HORS_FOOD.test(String(rec.categorie ?? ''))) continue
    const cout = coutByRec.get(rec.id as string)
    const pv = Number(rec.prix_vente_ht)
    if (cout == null || !pv) continue
    const cp = cout / (Number(rec.nb_portions) || 1)
    if ((cp / pv) * 100 > 32) tropCher++
  }
  if (tropCher > 0) {
    cands.push({
      domaine: 'food_cost', type: 'ameliorer', titre: 'Retravailler les plats au food cost trop élevé',
      resume: `${tropCher} plat(s) au-dessus de 32 %`,
      details: `${tropCher} plat(s) ont un food cost > 32 % (seuil rouge). À retravailler : monter le prix, ajuster les portions ou changer un ingrédient. L’engineering de carte te montre lesquels rapportent vraiment.`,
      urgence: 'orange', action_type: null, cible_url: '/admin/recettes/engineering',
    })
  }

  // 5) BAR — carte des boissons trop maigre → Arnaud propose d'étoffer
  const { count: nbBoissons } = await sb.from('boissons').select('id', { count: 'exact', head: true }).eq('actif', true)
  if ((nbBoissons ?? 0) < 8) {
    cands.push({
      domaine: 'bar', type: 'completer', titre: 'Étoffer la carte des boissons',
      resume: `${nbBoissons ?? 0} boisson(s) seulement`,
      details: `Ta carte des boissons est légère. Je te propose des cocktails signature, softs maison et vins au verre (food cost calculé) — à valider dans la carte.`,
      urgence: 'info', action_type: 'generer_famille', action_payload: { famId: 'bar' }, cible_url: '/admin/boissons',
    })
  }

  // 6) ALERTES DES 15 AGENTS — HACCP, RH, finances, sécurité, clients → chantiers
  //    Les domaines que le co-gérant ne couvre pas en propre passent par les agents.
  const { data: finds } = await sb.from('agent_findings')
    .select('agent_id, urgence, titre, message, action_label, action_url')
    .eq('resolu', false).in('urgence', ['rouge', 'jaune'])
    .order('created_at', { ascending: false }).limit(60)
  let promus = 0
  for (const f of finds ?? []) {
    if (promus >= 10) break
    const aid = String(f.agent_id)
    const dom = AGENT_DOMAINE[aid]
    if (!dom) continue   // on ne promeut que les domaines hors-carte pertinents
    cands.push({
      domaine: dom, type: 'alerte',
      titre: String(f.titre ?? '').slice(0, 160),
      resume: String(f.action_label ?? ''),
      details: String(f.message ?? ''),
      urgence: f.urgence === 'rouge' ? 'rouge' : 'jaune',
      action_type: null, cible_url: (f.action_url as string) ?? '/admin/pilotage',
    })
    promus++
  }

  if (!persister) return { crees: 0, total: cands.length }

  // Dédup : on met à jour un chantier ouvert de même (domaine, titre), sinon on crée.
  const { data: open } = await sb.from('propositions')
    .select('id, domaine, titre').in('statut', ['proposee', 'en_discussion']).neq('domaine', 'carte')
  const existing = new Map((open ?? []).map(o => [`${o.domaine}::${o.titre}`, o.id as string]))

  let crees = 0
  for (const c of cands) {
    const id = existing.get(`${c.domaine}::${c.titre}`)
    if (id) {
      await sb.from('propositions').update({
        resume: c.resume, details: c.details, urgence: c.urgence,
        action_type: c.action_type, action_payload: c.action_payload ?? null, cible_url: c.cible_url ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
    } else {
      await creerProposition({
        domaine: c.domaine, type: c.type, titre: c.titre, resume: c.resume, details: c.details,
        urgence: c.urgence, action_type: c.action_type, action_payload: c.action_payload,
        cible_url: c.cible_url, source: 'co_gerant_audit',
      })
      crees++
    }
  }
  return { crees, total: cands.length }
}

// ── AUDIT AUTO : 1×/jour, dès la 1ʳᵉ ouverture — « il vient vers toi » ──
// Déterministe (pas d'IA, pas de clé requise) → sûr à lancer au chargement.
export async function auditerChantiersSiNecessaire(): Promise<void> {
  try {
    const sb = await createClient()
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await sb.from('parametres').select('valeur').eq('cle', 'cg_audit_jour').maybeSingle()
    if ((data?.valeur as string | null) === today) return
    await auditerChantiers(true)
    await sb.from('parametres').upsert({ cle: 'cg_audit_jour', valeur: today, updated_at: new Date().toISOString() }, { onConflict: 'cle' })
  } catch { /* best-effort — ne casse jamais le rendu de la page */ }
}

// ── LANCER un chantier : Arnaud fait le boulot, puis rend compte ──────
export async function lancerChantier(id: string): Promise<{ message: string }> {
  const prop = await getProposition(id)
  if (!prop) throw new Error('Chantier introuvable')
  let message = ''
  switch (prop.action_type) {
    case 'preparer_reassort': {
      const r = await autoGenererBonsDepuisStock()
      message = (r?.bons_crees ?? 0) > 0
        ? `${r.bons_crees} bon(s) de commande préparé(s) en brouillon — à vérifier puis envoyer (Fournisseurs).`
        : (r?.message || 'Rien à commander pour l’instant.')
      break
    }
    case 'remplir_prix': {
      const r = await remplirPrixIngredientsManquants()
      message = r.ingredientsMisAJour > 0 ? `${r.ingredientsMisAJour} prix d’ingrédient renseigné(s).` : 'Tous les prix sont déjà renseignés.'
      break
    }
    case 'remplir_food_cost': {
      const r = await remplirFoodCostManquant()
      message = r.recettesCompletees > 0
        ? `${r.recettesCompletees} recette(s) complétée(s), ${r.ingredientsCrees} ingrédient(s) créé(s).`
        : 'Toutes les recettes ont déjà leurs ingrédients.'
      break
    }
    case 'generer_famille': {
      const famId = (prop.action_payload as { famId?: string })?.famId as FamilleId
      if (!famId) throw new Error('Famille manquante')
      const r = await genererFamille(famId, true)
      message = `${r.items} proposition(s) ajoutée(s) — à valider dans ta carte.`
      break
    }
    default:
      throw new Error('Ce chantier n’a pas d’action automatique — ouvre le lien pour t’en occuper.')
  }
  await marquerFaite(id, message)
  return { message }
}
