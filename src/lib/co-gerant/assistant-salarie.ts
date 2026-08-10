// Arnaud côté SALARIÉ — « Demande à Arnaud ».
// Un assistant métier pour l'équipe : allergènes, recettes, dressage, accords
// mets-boissons, fiches de poste, procédures d'urgence.
// CLOISONNÉ : ne révèle JAMAIS les prix d'achat, coûts, food cost, marges,
// chiffre d'affaires, salaires ni finances. Côté serveur uniquement.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { allergenesRecette, ALLERGENE_INFO } from '@/lib/allergenes'

export type AssistMsg = { role: 'user' | 'assistant'; content: string }

const MODEL = 'claude-haiku-4-5'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'chercher_plat',
    description: "Récupère la fiche d'un plat de la carte : description, ingrédients (SANS prix), allergènes, temps de prépa, nombre de portions. Utilise pour « c'est quoi le plat X », « qu'est-ce qu'il y a dans Y », « comment se prépare Z ».",
    input_schema: { type: 'object', properties: { nom: { type: 'string', description: 'nom (ou partie) du plat' } }, required: ['nom'] },
  },
  {
    name: 'allergenes_plat',
    description: "Donne les allergènes officiels (14 UE) d'un plat. Utilise pour « est-ce que X contient du gluten / lait / fruits à coque… », « allergènes de Y ».",
    input_schema: { type: 'object', properties: { nom: { type: 'string' } }, required: ['nom'] },
  },
  {
    name: 'accord_boisson',
    description: "Suggère les boissons qui accompagnent un plat (accords mets-boissons). Utilise pour « quel vin avec X », « quoi conseiller à boire avec Y ».",
    input_schema: { type: 'object', properties: { nom: { type: 'string' } }, required: ['nom'] },
  },
  {
    name: 'fiche_poste',
    description: "Récupère la fiche de poste / le guide étape par étape (ouverture, fermeture, gestes du métier). Utilise pour « je fais quoi à l'ouverture / la fermeture », « comment on fait X à mon poste ».",
    input_schema: { type: 'object', properties: { poste: { type: 'string', description: 'cuisine|pizzaiolo|bar|salle|serveur|plonge — défaut: le poste du salarié' } } },
  },
  {
    name: 'procedure_urgence',
    description: "Donne la procédure d'urgence à suivre, étape par étape. Utilise pour « que faire en cas de réaction allergique / incendie / malaise client / évacuation ».",
    input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['allergie', 'incendie', 'evacuation', 'malaise', 'intoxication', 'vol', 'autre'] } }, required: ['type'] },
  },
]

type SB = Awaited<ReturnType<typeof createClient>>

async function fichePlat(sb: SB, nom: string) {
  const { data: recs } = await sb.from('recettes')
    .select('id, nom, categorie, description, temps_preparation, nb_portions, allergenes_complementaires')
    .eq('actif', true).ilike('nom', `%${nom}%`).limit(3)
  if (!recs?.length) return { trouve: false }
  const plats = []
  for (const r of recs) {
    const { data: ris } = await sb.from('recette_ingredients').select('ingredient_id, quantite, unite').eq('recette_id', r.id as string)
    const ids = (ris ?? []).map(x => x.ingredient_id as string)
    const { data: ings } = ids.length ? await sb.from('ingredients').select('id, nom, allergenes').in('id', ids) : { data: [] }
    const byId = new Map((ings ?? []).map(i => [i.id as string, i]))
    const ingredients = (ris ?? []).map(x => byId.get(x.ingredient_id as string)?.nom as string).filter(Boolean)
    const allergArrays = (ris ?? []).map(x => (byId.get(x.ingredient_id as string)?.allergenes ?? []) as string[])
    const allergs = allergenesRecette(allergArrays, (r.allergenes_complementaires ?? []) as string[]).map(a => ALLERGENE_INFO[a].label)
    plats.push({
      nom: r.nom, categorie: r.categorie, description: r.description,
      temps_min: r.temps_preparation, portions: r.nb_portions,
      ingredients, allergenes: allergs.length ? allergs : ['aucun allergène majeur déclaré'],
    })
  }
  return { trouve: true, plats }
}

async function accords(sb: SB, nom: string) {
  const { data: rec } = await sb.from('recettes').select('id, nom').eq('actif', true).ilike('nom', `%${nom}%`).limit(1).maybeSingle()
  if (!rec) return { trouve: false }
  const { data: acc } = await sb.from('accords_mets_boissons').select('boisson_id, note').eq('recette_id', rec.id as string)
  const ids = (acc ?? []).map(a => a.boisson_id as string)
  if (!ids.length) return { trouve: true, plat: rec.nom, accords: [], message: 'Aucun accord enregistré pour ce plat — propose un vin de la même région ou un classique maison.' }
  const noteById = new Map((acc ?? []).map(a => [a.boisson_id as string, a.note as string | null]))
  const { data: bs } = await sb.from('boissons').select('id, nom, type, appellation, region, cepage').in('id', ids)
  const accordsList = (bs ?? []).map(b => ({ nom: b.nom, type: b.type, appellation: b.appellation, region: b.region, cepage: b.cepage, note: noteById.get(b.id as string) ?? null }))
  return { trouve: true, plat: rec.nom, accords: accordsList }
}

async function fichePoste(sb: SB, poste: string | null) {
  const p = String(poste ?? '').toLowerCase().trim()
  let q = sb.from('guides_formation').select('id, titre, poste').eq('actif', true).order('ordre')
  if (p) q = q.or(`poste.eq.${p},poste.eq.tous`)
  const { data: guides } = await q.limit(3)
  if (!guides?.length) return { trouve: false }
  const out = []
  for (const g of guides) {
    const { data: et } = await sb.from('etapes_formation').select('titre, contenu, ordre').eq('guide_id', g.id as string).order('ordre').limit(15)
    out.push({ guide: g.titre, poste: g.poste, etapes: (et ?? []).map(e => ({ titre: e.titre, contenu: e.contenu })) })
  }
  return { trouve: true, fiches: out }
}

async function procedureUrgence(sb: SB, type: string) {
  const { data } = await sb.from('procedures_urgence').select('titre, type, etapes, contacts').eq('type', type).eq('actif', true).order('ordre').limit(2)
  if (!data?.length) return { trouve: false }
  return { trouve: true, procedures: data.map(d => ({ titre: d.titre, etapes: d.etapes, contacts: d.contacts })) }
}

export async function chatAssistantSalarie(history: AssistMsg[], posteSalarie: string | null): Promise<{ reponse: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  const client = new Anthropic({ apiKey })
  const sb = await createClient()

  const system = `Tu es Arnaud, un collègue expérimenté qui AIDE l'équipe du restaurant. Tu réponds aux salariés (poste : ${posteSalarie || 'non précisé'}). Ton : SIMPLE, CONCRET, BIENVEILLANT — un coup de main, jamais un chef qui surveille. Tutoiement, réponses courtes et utiles.
Tu réponds sur le MÉTIER : ce qu'il y a dans un plat, comment le préparer/dresser, les allergènes, les accords boissons, les gestes d'ouverture/fermeture du poste, les procédures d'urgence. Sers-toi de tes outils pour des infos exactes du resto ; pour une question technique générale (cuisson, service, hygiène) tu peux répondre de toi-même.
RÈGLE ABSOLUE — CLOISONNEMENT : tu ne donnes JAMAIS d'info financière : ni prix d'achat, ni coût matière, ni food cost, ni marge, ni chiffre d'affaires, ni salaires, ni chiffres de gestion. Si on te le demande, refuse gentiment : « Ça, c'est côté gérant — vois avec lui. » (Le prix de VENTE d'un plat, lui, est public, tu peux le rappeler s'il aide à servir.)
Sur une question d'allergie d'un client : sois prudent et factuel, rappelle de TOUJOURS vérifier auprès du responsable en cas de doute. En cas d'urgence vitale, dis d'appeler les secours (15 / 112).`

  const messages: Anthropic.MessageParam[] = history.slice(-10).map(m => ({ role: m.role, content: m.content }))

  for (let i = 0; i < 4; i++) {
    const resp = await client.messages.create({ model: MODEL, max_tokens: 1100, system, tools: TOOLS, messages })
    const toolUses = resp.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    if (toolUses.length === 0) {
      const text = resp.content.filter(c => c.type === 'text').map(c => (c as Anthropic.TextBlock).text).join('\n').trim()
      return { reponse: text || 'Dis-m\'en un peu plus ?' }
    }
    messages.push({ role: 'assistant', content: resp.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      let out: unknown = {}
      try {
        const inp = tu.input as { nom?: string; poste?: string; type?: string }
        if (tu.name === 'chercher_plat' || tu.name === 'allergenes_plat') out = await fichePlat(sb, String(inp?.nom ?? ''))
        else if (tu.name === 'accord_boisson') out = await accords(sb, String(inp?.nom ?? ''))
        else if (tu.name === 'fiche_poste') out = await fichePoste(sb, inp?.poste ?? posteSalarie)
        else if (tu.name === 'procedure_urgence') out = await procedureUrgence(sb, String(inp?.type ?? 'autre'))
        else out = { erreur: 'outil inconnu' }
      } catch (e) {
        out = { erreur: e instanceof Error ? e.message : 'inconnue' }
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) })
    }
    messages.push({ role: 'user', content: results })
  }
  return { reponse: "Désolé, je n'ai pas réussi à te répondre — reformule ou demande au responsable." }
}
