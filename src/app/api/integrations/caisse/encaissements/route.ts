// ─── Connecteur « caisse agréée » → ingestion des encaissements (lecture seule) ───
//
// La caisse agréée (NF525) est la source de vérité fiscale. Elle nous POUSSE ses
// tickets ici ; on les miroite dans `encaissements_externes` et on rapproche
// best-effort la commande prise dans l'app (par numéro) → on la marque encaissée.
//
// POS-AGNOSTIQUE : la payload est normalisée. Le jour où la caisse est choisie,
// on écrit un fin adaptateur (cron/webhook) qui mappe son export → ce format.
//
// Auth : Bearer CRON_SECRET. Idempotent via (source_caisse, ticket_externe).
//
//   POST /api/integrations/caisse/encaissements
//   Authorization: Bearer ${CRON_SECRET}
//   {
//     "source_caisse": "tiller",
//     "encaissements": [
//       { "ticket_externe": "T-123", "etablissement_slug": "bar",
//         "commande_numero": "BAR-260609-AB12", "montant_ttc": 12.0,
//         "montant_ht": 10.0, "tva_total": 2.0, "ventilation_tva": {"20": 2.0},
//         "mode_paiement": "cb", "encaisse_at": "2026-06-09T18:00:00Z" }
//     ]
//   }
//
// Pré-requis : migration 0108_encaissements_externes.sql appliquée.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}`
}

// Détail d'un ticket, quand la caisse sait le fournir. Sans lignes, on ne
// connaît qu'un montant : le CA est juste mais le stock, le food cost et le
// menu engineering restent aveugles.
const produitSchema = z.object({
  nom_caisse: z.string().min(1),
  quantite: z.number().positive(),
  prix_unitaire_ttc: z.number(),
  tva_taux: z.number().optional(),
})

const ligneSchema = z.object({
  ticket_externe: z.string().min(1),
  produits: z.array(produitSchema).optional(),
  etablissement_slug: z.string().optional(),
  commande_numero: z.string().optional(),
  montant_ttc: z.number(),
  montant_ht: z.number().optional(),
  tva_total: z.number().optional(),
  ventilation_tva: z.record(z.string(), z.number()).optional(),
  mode_paiement: z.string().optional(),
  encaisse_at: z.string().optional(),
  /** Pourboire encaissé avec la vente. Il appartient à l'équipe, pas au CA —
   *  il est donc stocké à part et n'entre pas dans montant_total_ttc. */
  pourboire: z.number().optional(),
})
const payloadSchema = z.object({
  source_caisse: z.string().min(1),
  encaissements: z.array(ligneSchema).min(1).max(500),
})

export async function POST(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 }) }

  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Payload invalide', details: parsed.error.flatten() }, { status: 422 })
  }
  const { source_caisse, encaissements } = parsed.data

  const sb = await createClient()

  // Map slug → etablissement_id (best-effort)
  const slugToId = new Map<string, string>()
  try {
    const { data: etabs } = await sb.from('etablissements').select('id, slug')
    for (const e of etabs ?? []) slugToId.set(String(e.slug), String(e.id))
  } catch { /* table absente → ignore */ }

  // Carte du Fournil indexée par libellé de caisse ET par nom normalisé : le
  // premier gagne quand il existe (c'est une correspondance déclarée à la
  // main), le second rattrape les libellés identiques à l'accent près.
  const norm = (x: string) =>
    x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  const parCaisse = new Map<string, { id: string; tag: string }>()
  const parNom = new Map<string, { id: string; tag: string }>()
  try {
    // Volontairement SANS filtre `actif` : un produit désactivé exprès
    // (focaccias arrêtées, « Jus de fruit » remplacé par orange/pomme) doit
    // être RETROUVÉ, pas recréé en double. La vente s'y rattache — elle a
    // bien eu lieu — et le produit reste désactivé, donc absent du site, de
    // l'inventaire et des suggestions de commande.
    // `.order('actif')` : false avant true, donc un homonyme ACTIF écrase
    // l'inactif dans la map et garde la priorité.
    const { data: recs } = await sb.from('recettes')
      .select('id, nom, nom_caisse, tag_destination, actif').order('actif')
    for (const r of recs ?? []) {
      const v = { id: String(r.id), tag: String(r.tag_destination ?? 'FOURNIL') }
      if (r.nom_caisse) parCaisse.set(norm(String(r.nom_caisse)), v)
      parNom.set(norm(String(r.nom)), v)
    }
  } catch { /* carte injoignable → import sans lignes */ }

  let recus = 0, rapproches = 0, sansCommande = 0, creees = 0
  let lignesPosees = 0
  const inconnus = new Map<string, number>()
  const crees: string[] = []
  const erreurs: { ticket: string; error: string }[] = []

  for (const l of encaissements) {
    try {
      // 1. Rapprochement commande par numéro (si fourni)
      let commandeId: string | null = null
      if (l.commande_numero) {
        const { data: cmd } = await sb.from('commandes')
          .select('id, statut').eq('numero', l.commande_numero).maybeSingle()
        if (cmd) {
          commandeId = String(cmd.id)
          // Marque la commande encaissée si elle ne l'est pas déjà (ni annulée)
          if (cmd.statut !== 'encaisse' && cmd.statut !== 'annule') {
            await sb.from('commandes').update({
              statut: 'encaisse',
              mode_paiement: l.mode_paiement ?? 'caisse_agreee',
            }).eq('id', commandeId)
          }
        }
      }
      // 1 bis. Ticket sans commande dans l'app (le cas normal au comptoir) :
      // on le matérialise en commande 'encaisse' de source CAISSE. Sans ça, le
      // ticket ne vivrait que dans le miroir `encaissements_externes`, que
      // AUCUN calcul de CA ne lit — dashboard, pilotage, finances et agents
      // filtrent tous sur `commandes.statut = 'encaisse'`.
      //
      // Idempotence : si ce ticket a déjà été ingéré, le miroir porte son
      // commande_id ; on le réutilise au lieu d'en créer un second.
      if (!commandeId) {
        const { data: dejaVu } = await sb.from('encaissements_externes')
          .select('commande_id')
          .eq('source_caisse', source_caisse)
          .eq('ticket_externe', l.ticket_externe)
          .maybeSingle()

        if (dejaVu?.commande_id) {
          commandeId = String(dejaVu.commande_id)
        } else {
          const encaisseLe = l.encaisse_at ?? new Date().toISOString()
          const { data: synth, error: eSynth } = await sb.from('commandes').insert({
            numero: `CAI-${source_caisse.slice(0, 6).toUpperCase()}-${l.ticket_externe}`.slice(0, 60),
            source: 'CAISSE',
            statut: 'encaisse',
            montant_total_ttc: l.montant_ttc,
            montant_total_ht: l.montant_ht ?? null,
            tva_total: l.tva_total ?? null,
            ventilation_tva: l.ventilation_tva ?? {},
            mode_paiement: l.mode_paiement ?? 'caisse_agreee',
            pourboire_total: l.pourboire ?? 0,
            etablissement_id: l.etablissement_slug ? (slugToId.get(l.etablissement_slug) ?? null) : null,
            created_at: encaisseLe,
            notes: `Ticket ${source_caisse} ${l.ticket_externe} — encaissé hors app`,
          }).select('id').maybeSingle()

          if (eSynth) { erreurs.push({ ticket: l.ticket_externe, error: eSynth.message }); continue }
          if (synth) {
            commandeId = String(synth.id)
            creees++

            // Lignes du ticket → commande_articles. C'est ce qui rend le stock,
            // le food cost et le menu engineering exploitables : sans elles, la
            // commande n'est qu'un montant. Statut 'servi' d'emblée — le produit
            // est parti au comptoir — ce qui déclenche la déduction de stock
            // (trigger de la 0009).
            //
            // Le prix et la TVA viennent du TICKET, jamais de la fiche produit :
            // c'est la caisse qui fait foi, y compris quand elle applique un
            // tarif que la fiche ignore.
            const aInserer = []
            for (const p of l.produits ?? []) {
              const cle = norm(p.nom_caisse)
              let rec = parCaisse.get(cle) ?? parNom.get(cle)

              // Libellé jamais vu : on crée sa fiche à la volée. SumUp n'expose
              // aucune API catalogue (vérifié : Checkouts, Readers, Customers,
              // Transactions, Payouts, Receipts, Members, Memberships, Roles,
              // Merchants — rien sur les produits). Le ticket est donc la seule
              // source, et c'est elle qui construit le miroir.
              //
              // Sans ça, un produit ajouté dans SumUp le matin vend toute la
              // journée sans jamais apparaître dans le top des ventes ni dans
              // les marges — son CA est compté, mais rattaché à rien.
              if (!rec) {
                const taux = p.tva_taux ?? 10
                const { data: neuf } = await sb.from('recettes').insert({
                  nom: p.nom_caisse,
                  nom_caisse: p.nom_caisse,
                  categorie: 'À classer',
                  tag_destination: 'FOURNIL',
                  prix_vente_ht: Math.round((p.prix_unitaire_ttc / (1 + taux / 100)) * 10000) / 10000,
                  tva: taux,
                  contient_alcool: false,
                  vendable_online: false,   // pas de photo ni de description : hors vitrine
                  actif: true,
                  cree_par_caisse: true,
                  etablissement_id: l.etablissement_slug ? (slugToId.get(l.etablissement_slug) ?? null) : null,
                }).select('id, tag_destination').maybeSingle()

                if (neuf) {
                  rec = { id: String(neuf.id), tag: String(neuf.tag_destination ?? 'FOURNIL') }
                  parCaisse.set(cle, rec)   // les lignes suivantes du même lot en profitent
                  crees.push(p.nom_caisse)
                }
              }

              if (!rec) { inconnus.set(p.nom_caisse, (inconnus.get(p.nom_caisse) ?? 0) + 1); continue }
              const ttc = p.prix_unitaire_ttc
              const taux = p.tva_taux ?? 10
              aInserer.push({
                commande_id: commandeId,
                recette_id: rec.id,
                quantite: p.quantite,
                prix_unitaire_ht: Math.round((ttc / (1 + taux / 100)) * 10000) / 10000,
                prix_unitaire_ttc: ttc,
                tva_taux: taux,
                tva_eur: Math.round((ttc - ttc / (1 + taux / 100)) * p.quantite * 100) / 100,
                tag_destination: rec.tag,
                statut: 'servi',
              })
            }
            if (aInserer.length > 0) {
              const { error: eArt } = await sb.from('commande_articles').insert(aInserer)
              if (eArt) erreurs.push({ ticket: l.ticket_externe, error: `lignes : ${eArt.message}` })
              else lignesPosees += aInserer.length
            }
          }
        }
      }

      const statutRappr = commandeId
        ? (l.commande_numero ? 'rapproche' : 'non_rapproche')
        : 'sans_commande'

      // 2. Miroir local (idempotent)
      const { error } = await sb.from('encaissements_externes').upsert({
        source_caisse,
        ticket_externe: l.ticket_externe,
        etablissement_id: l.etablissement_slug ? (slugToId.get(l.etablissement_slug) ?? null) : null,
        commande_id: commandeId,
        montant_ttc: l.montant_ttc,
        montant_ht: l.montant_ht ?? null,
        tva_total: l.tva_total ?? null,
        ventilation_tva: l.ventilation_tva ?? {},
        mode_paiement: l.mode_paiement ?? null,
        encaisse_at: l.encaisse_at ?? null,
        statut_rapprochement: statutRappr,
        raw: l as unknown as Record<string, unknown>,
      }, { onConflict: 'source_caisse,ticket_externe' })
      if (error) { erreurs.push({ ticket: l.ticket_externe, error: error.message }); continue }

      recus++
      if (statutRappr === 'rapproche') rapproches++
      else if (statutRappr === 'sans_commande') sansCommande++
    } catch (e) {
      erreurs.push({ ticket: l.ticket_externe, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({
    ok: erreurs.length === 0,
    source_caisse,
    recus,
    rapproches,
    // Tickets matérialisés en commande 'CAISSE' pour entrer dans le CA.
    commandes_creees: creees,
    lignes_posees: lignesPosees,
    // Libellés de caisse sans équivalent dans la carte : leur CA est compté,
    // mais ni le stock ni la marge ne les connaîtront tant qu'on ne les a pas
    // rattachés (colonne `recettes.nom_caisse`).
    produits_inconnus: Object.fromEntries(inconnus),
    // Fiches créées à la volée depuis un libellé de caisse jamais vu.
    // À relire dans /admin/recettes : catégorie « À classer », sans photo.
    produits_crees: crees,
    sans_commande: sansCommande,
    erreurs,
  })
}
