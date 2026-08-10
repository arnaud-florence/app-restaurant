// Co-gérant « Arnaud » · le chat qui AGIT.
// Tu lui parles (« remplis les food cost », « refais la carte », « où en est mon
// resto ») → Claude interprète et appelle l'outil → Arnaud fait, puis confirme.
// Outils sûrs uniquement (proposer carte, remplir food cost, auditer).
// Côté serveur uniquement.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getContexteResto } from './propositions'
import { genererPropositionsPlats, remplirFoodCostManquant, remplirPrixIngredientsManquants } from './proposer-plats'
import { auditerCompletude } from './completude'
import { autoGenererBonsDepuisStock } from '@/app/admin/fournisseurs/actions'
import { sendPushToPostes } from '@/lib/push'

const CANAUX = ['tous', 'cuisine', 'bar', 'salle', 'admin']
const POSTES_PAR_CANAL: Record<string, string[]> = {
  cuisine: ['cuisinier', 'cuisine', 'second', 'pizzaiolo', 'cuisinier_snacking', 'polyvalent'],
  bar: ['barman', 'bar', 'polyvalent'],
  salle: ['serveur', 'salle', 'polyvalent'],
  admin: ['manager', 'gerant'],
}

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'proposer_carte',
    description: 'Propose de nouveaux plats pour la carte (food cost calculé). Ils seront à valider par le patron sur la page. Utilise quand il dit « propose des plats », « refais la carte », « ajoute des plats ».',
    input_schema: { type: 'object', properties: { nb: { type: 'number', description: 'nombre de plats, 1 à 10' } } },
  },
  {
    name: 'remplir_food_cost',
    description: "Ajoute les ingrédients manquants aux recettes qui n'en ont aucune, pour que le food cost se calcule. Utilise quand il dit « remplis les food cost », « complète les recettes ».",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'remplir_prix_ingredients',
    description: "Renseigne le prix d'achat des ingrédients qui n'en ont pas (prix de marché estimés), directement dans la base. Utilise quand il dit « ajoute les prix », « remplis les prix des ingrédients », « mets les prix manquants ».",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'preparer_reassort',
    description: "Prépare les bons de commande (en BROUILLON) pour les ingrédients sous le seuil de stock, groupés par fournisseur. Le patron les vérifiera et les enverra. Utilise quand il dit « fais le réassort », « prépare mes commandes », « commande ce qui manque ».",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'auditer_resto',
    description: 'Audite la complétude du resto et renvoie le score + les manques. Utilise quand il demande « où en est mon resto », « qu\'est-ce qui manque ».',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'envoyer_message_equipe',
    description: "Envoie un message à l'équipe dans le chat interne, signé Arnaud (au nom du patron). UNIQUEMENT pour du ROUTINIER : info du jour, coup de pouce service, rappel (HACCP, checklist), félicitations/encouragements. JAMAIS pour recadrer, congés, paie, contrat, ou un message personnel/sensible — dans ce cas REFUSE et dis au patron de l'envoyer lui-même.",
    input_schema: {
      type: 'object',
      properties: {
        texte: { type: 'string', description: "le message à envoyer à l'équipe" },
        canal: { type: 'string', enum: ['tous', 'cuisine', 'bar', 'salle', 'admin'], description: 'canal cible (défaut: tous)' },
      },
      required: ['texte'],
    },
  },
]

export async function chatAvecArnaud(history: ChatMsg[]): Promise<{ reponse: string; aAgi: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  const ctx = await getContexteResto()
  const client = new Anthropic({ apiKey })

  const system = `Tu es Arnaud, le co-gérant IA de "${ctx.cg_concept || 'un restaurant'}". Tu parles à ton patron (le vrai Arnaud). Ton : SIMPLE, CLAIR, EFFICACE. Tutoiement, court, zéro blabla.
Tu peux AGIR via tes outils (proposer une carte, remplir le food cost manquant, renseigner les prix d'ingrédients manquants, préparer le réassort stock en brouillon, auditer le resto, envoyer un message à l'équipe). Quand le patron te demande un truc que tu peux faire, FAIS-LE avec l'outil, puis confirme en 1 phrase ce que tu as fait.
Tu peux parler à l'équipe EN SON NOM, mais SEULEMENT pour du routinier (infos, coups de pouce, rappels, félicitations). Le sensible — recadrer quelqu'un, congés, paie, contrat, message perso — tu REFUSES et tu lui dis de l'envoyer lui-même.
Tu ne touches JAMAIS à l'argent, aux contrats, ni aux messages externes (clients/fournisseurs) sans son accord explicite.`

  const messages: Anthropic.MessageParam[] = history.slice(-12).map(m => ({ role: m.role, content: m.content }))
  let aAgi = false

  for (let i = 0; i < 5; i++) {
    const resp = await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 1200, system, tools: TOOLS, messages })
    const toolUses = resp.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')

    if (toolUses.length === 0) {
      const text = resp.content.filter(c => c.type === 'text').map(c => (c as Anthropic.TextBlock).text).join('\n').trim()
      return { reponse: text || 'Ok.', aAgi }
    }

    messages.push({ role: 'assistant', content: resp.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      let out = ''
      try {
        if (tu.name === 'proposer_carte') {
          const nb = Number((tu.input as { nb?: number })?.nb) || 6
          const r = await genererPropositionsPlats({ nb: Math.min(Math.max(nb, 1), 10), persister: true })
          out = `${r.propositionsCreees} plat(s) proposé(s), à valider sur la page.`
          aAgi = true
        } else if (tu.name === 'remplir_food_cost') {
          const r = await remplirFoodCostManquant()
          out = r.recettesCompletees > 0
            ? `${r.recettesCompletees} recette(s) complétée(s), ${r.ingredientsCrees} ingrédient(s) créé(s). Food cost à jour.`
            : 'Aucune recette sans ingrédient — tout est déjà calculable.'
          aAgi = true
        } else if (tu.name === 'preparer_reassort') {
          const r = await autoGenererBonsDepuisStock()
          out = (r?.bons_crees ?? 0) > 0
            ? `${r.bons_crees} bon(s) de commande préparé(s) en brouillon — à vérifier puis envoyer sur la page Fournisseurs.`
            : (r?.message || "Rien à commander pour l'instant.")
          aAgi = true
        } else if (tu.name === 'remplir_prix_ingredients') {
          const r = await remplirPrixIngredientsManquants()
          out = r.ingredientsMisAJour > 0
            ? `${r.ingredientsMisAJour} ingrédient(s) avec un prix estimé renseigné.`
            : 'Tous les ingrédients ont déjà un prix.'
          aAgi = true
        } else if (tu.name === 'auditer_resto') {
          const c = await auditerCompletude()
          out = `Score ${c.score}%. ${c.manques.length ? 'Manques : ' + c.manques.map(m => m.label).join(', ') + '.' : 'Tout est en place.'}`
        } else if (tu.name === 'envoyer_message_equipe') {
          const inp = tu.input as { texte?: string; canal?: string }
          const texte = String(inp?.texte ?? '').trim()
          if (!texte) {
            out = 'Rien à envoyer.'
          } else {
            const canal = CANAUX.includes(String(inp?.canal)) ? String(inp?.canal) : 'tous'
            const sb = await createClient()
            await sb.from('messages').insert({ canal, expediteur_id: null, contenu: `${texte}\n— Arnaud (co-gérant)` })
            // Push aux concernés (best-effort, ne bloque pas si VAPID/abonnements absents).
            try {
              let postes: string[]
              if (canal === 'tous') {
                const { data: emps } = await sb.from('employes').select('poste').eq('actif', true)
                postes = [...new Set((emps ?? []).map(e => e.poste as string).filter(Boolean))]
              } else {
                postes = POSTES_PAR_CANAL[canal] ?? []
              }
              if (postes.length) {
                await sendPushToPostes(postes, { title: '📣 Arnaud', body: texte.slice(0, 140), url: '/equipes', tag: 'arnaud-equipe' })
              }
            } catch { /* push best-effort */ }
            out = `Message envoyé à l'équipe (canal ${canal}) + notif push.`
            aAgi = true
          }
        } else {
          out = 'Outil inconnu.'
        }
      } catch (e) {
        out = 'Erreur : ' + (e instanceof Error ? e.message : 'inconnue')
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out })
    }
    messages.push({ role: 'user', content: results })
  }
  return { reponse: 'C\'est fait.', aAgi }
}
