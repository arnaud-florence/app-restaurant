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
import { journaliser } from '@/lib/integrations/journal'
import { chargerCorrespondances, noterCorrespondance } from '@/lib/integrations/correspondances'
// ⚠️ Deux normaliseurs PURS, réutilisés plutôt que réécrits : `+33767453444`
// et `0767453444` sont le même client, et une seconde implémentation finirait
// par rapprocher autrement que le pont client — donc par afficher deux
// totaux pour la même personne.
import { telephoneComparable, emailComparable } from '@/lib/integrations/zelty/clients'
// ⚠️ Le total d'un client vit dans une COLONNE (`clients.total_depense`), que
// `/admin/clients` lit telle quelle — il ne recalcule rien à l'affichage.
// Jusqu'ici seul un clic « Recalculer » sur la fiche la mettait à jour : un
// ticket rattaché laissait donc le total FAUX, et la facture de fin de mois
// avec. On réutilise le calcul existant plutôt que d'en écrire un second —
// deux sommes du même chiffre finissent par en afficher deux.
import { recalculerStatsClient } from '@/app/admin/clients/actions'

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
  /** Identifiant STABLE du produit côté caisse (0137). Quand la caisse en
   *  fournit un, c'est lui qui fait foi : un renommage ne doit pas créer un
   *  doublon chez nous. SumUp n'en donne pas ; Zelty devrait. */
  identifiant_externe: z.string().min(1).optional(),
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
  /** Le client du ticket, quand la caisse le connaît. POS-AGNOSTIQUE comme le
   *  reste : SumUp n'en donne pas, Zelty oui. */
  client: z.object({
    identifiant_externe: z.string().optional(),
    nom: z.string().optional(),
    email: z.string().optional(),
    telephone: z.string().optional(),
  }).optional(),
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
  // Index prioritaire : l'identifiant stable de la caisse (0137).
  const parId = await chargerCorrespondances(source_caisse).catch(() => new Map<string, string>())
  const tagParRecette = new Map<string, string>()
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
      tagParRecette.set(String(r.id), v.tag)
    }
  } catch { /* carte injoignable → import sans lignes */ }

  const t0 = Date.now()
  // Denrées alimentaires créées à 20 % : le taux vient du ticket, donc de la
  // caisse. 20 % sur un produit non alcoolisé est presque toujours une erreur
  // de paramétrage côté caisse — vécu sur 7 produits du Fournil, ~270 €/an de
  // TVA sur-collectée, invisibles jusqu'à ce qu'on les cherche.
  // ─── Le fichier client, chargé UNE fois ──────────────────────────────
  // ⚠️⚠️ ON NE CRÉE JAMAIS DE CLIENT DEPUIS UNE VENTE. Un ticket qui porte un
  // inconnu est SIGNALÉ, pas inventé : créer à l'aveugle remplirait le CRM de
  // fiches muettes et de doublons, et surtout une fiche client porte des
  // consentements que seul le pont client (cron de 4 h 40) sait recueillir
  // correctement. Un ticket de caisse n'est pas un formulaire d'inscription.
  const clientParCaisse = new Map<string, string>()
  const clientParEmail = new Map<string, string>()
  const clientParTel = new Map<string, string>()
  {
    const { data: cls } = await sb.from('clients')
      .select('id, email, telephone, caisse_externe_id, caisse_externe_systeme')
    for (const c of cls ?? []) {
      const id = String(c.id)
      // L'identifiant de caisse ne se trompe JAMAIS : il passe en premier.
      if (c.caisse_externe_id && c.caisse_externe_systeme === source_caisse) {
        clientParCaisse.set(String(c.caisse_externe_id), id)
      }
      const m = emailComparable(c.email as string | null)
      if (m && !clientParEmail.has(m)) clientParEmail.set(m, id)
      const t = telephoneComparable(c.telephone as string | null)
      if (t && !clientParTel.has(t)) clientParTel.set(t, id)
    }
  }
  /** Rapprochement par ordre de FIABILITÉ : l'identifiant de caisse est
   *  exact, l'email presque toujours, le téléphone peut être celui du
   *  conjoint. Même ordre que le pont client — deux ordres différents
   *  finiraient par désigner deux fiches pour le même ticket. */
  const trouverClient = (cl?: { identifiant_externe?: string; email?: string; telephone?: string }) => {
    if (!cl) return null
    if (cl.identifiant_externe) {
      const v = clientParCaisse.get(String(cl.identifiant_externe))
      if (v) return v
    }
    const m = emailComparable(cl.email)
    if (m) { const v = clientParEmail.get(m); if (v) return v }
    const t = telephoneComparable(cl.telephone)
    if (t) { const v = clientParTel.get(t); if (v) return v }
    return null
  }
  let clientsRattaches = 0
  const clientsInconnus: string[] = []
  /** Les fiches dont le total doit être repris, une seule fois en fin
   *  d'import même si le client a plusieurs tickets dans le lot. */
  const aRecalculer = new Set<string>()

  const tauxSuspects: string[] = []
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
          // ⚠️ UN TICKET DÉJÀ INGÉRÉ N'EST PAS UN TICKET COMPLET. Les 93 ventes
          // du 12/10 sont entrées avant que le client soit transporté : sans ce
          // rattrapage, un rejeu depuis le journal ne les corrigerait JAMAIS —
          // la commande existe, donc on passe à côté sans rien écrire.
          //
          // On COMPLÈTE, on ne remplace pas : seul un `client_id` encore nul
          // est rempli. Un rattachement corrigé à la main ne doit pas se faire
          // écraser par un passage automatique (même règle que le pont client).
          const rattrape = trouverClient(l.client)
          if (rattrape) {
            // ⚠️ Le total est repris DÈS QUE le ticket désigne ce client, même
            // s'il était déjà rattaché. Ne le faire que sur un rattachement
            // NEUF laissait la fiche périmée pour toujours : le premier
            // passage attachait, le suivant passait à côté sans rien reprendre
            // — vécu sur la fiche Ceccherini, restée à son total de mai.
            aRecalculer.add(rattrape)
            const { data: cmd } = await sb.from('commandes')
              .select('client_id').eq('id', commandeId).maybeSingle()
            if (cmd && !cmd.client_id) {
              await sb.from('commandes').update({
                client_id: rattrape,
                client_nom: l.client?.nom ?? null,
                client_email: l.client?.email ?? null,
                client_telephone: l.client?.telephone ?? null,
              }).eq('id', commandeId)
              clientsRattaches++
            }
          } else if (l.client?.nom || l.client?.identifiant_externe) {
            clientsInconnus.push(l.client.nom ?? `#${l.client.identifiant_externe}`)
          }
        } else {
          const encaisseLe = l.encaisse_at ?? new Date().toISOString()
          const clientTrouve = trouverClient(l.client)
          if (clientTrouve) { clientsRattaches++; aRecalculer.add(clientTrouve) }
          else if (l.client?.nom || l.client?.identifiant_externe) {
            clientsInconnus.push(l.client.nom ?? `#${l.client.identifiant_externe}`)
          }
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
            // ⚠️ Le rattachement ne doit JAMAIS faire échouer la vente : un
            // client introuvable laisse `client_id` à NULL et le ticket entre
            // quand même. Perdre un chiffre d'affaires pour un rapprochement
            // raté serait le pire des deux maux.
            client_id: clientTrouve,
            // Les coordonnées du ticket sont gardées même sans fiche : elles
            // DISENT qui a acheté, et `recalculerStatsClient()` sait aussi
            // rapprocher par email ou téléphone.
            client_nom: l.client?.nom ?? null,
            client_email: l.client?.email ?? null,
            client_telephone: l.client?.telephone ?? null,
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
              // Ordre volontaire : l'identifiant stable AVANT le libellé.
              // Le libellé change au gré des humeurs du back-office de la
              // caisse ; l'identifiant, non.
              const idExt = p.identifiant_externe
              const parIdent = idExt ? parId.get(idExt) : undefined
              let rec = parIdent
                ? { id: parIdent, tag: tagParRecette.get(parIdent) ?? 'FOURNIL' }
                : (parCaisse.get(cle) ?? parNom.get(cle))

              // Rattaché par le nom alors que la caisse donnait un identifiant :
              // on note le lien pour que la prochaine fois se passe du libellé.
              if (rec && idExt && !parIdent) {
                await noterCorrespondance({
                  systeme: source_caisse, identifiant_externe: idExt,
                  recette_id: rec.id, libelle_externe: p.nom_caisse,
                })
                parId.set(idExt, rec.id)
              }

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
                  if (taux === 20) tauxSuspects.push(p.nom_caisse)
                  rec = { id: String(neuf.id), tag: String(neuf.tag_destination ?? 'FOURNIL') }
                  parCaisse.set(cle, rec)   // les lignes suivantes du même lot en profitent
                  tagParRecette.set(rec.id, rec.tag)
                  crees.push(p.nom_caisse)
                  if (idExt) {
                    await noterCorrespondance({
                      systeme: source_caisse, identifiant_externe: idExt,
                      recette_id: rec.id, libelle_externe: p.nom_caisse,
                    })
                    parId.set(idExt, rec.id)
                  }
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

  // ─── Les totaux des clients touchés ──────────────────────────────────
  // ⚠️ JAMAIS bloquant : un total non repris est un chiffre à rafraîchir,
  // une ingestion perdue est du chiffre d'affaires évaporé. On compte les
  // échecs plutôt que de les lever.
  let totauxRepris = 0
  for (const id of aRecalculer) {
    try { await recalculerStatsClient(id); totauxRepris++ }
    catch { /* le clic « Recalculer » de la fiche reste le filet */ }
  }

  const bilan = {
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
    // À vérifier dans la caisse : 20 % sur une denrée alimentaire est presque
    // toujours un mauvais paramétrage, et il sur-collecte en silence.
    ...(tauxSuspects.length > 0 ? { tva_20_suspecte: tauxSuspects } : {}),
    sans_commande: sansCommande,
    // Le rattachement au fichier client. ⚠️ Les INCONNUS sont nommés, pas
    // comptés en silence : chacun est une fiche à créer dans /admin/clients,
    // et sans cette liste on ne saurait pas laquelle.
    clients_rattaches: clientsRattaches,
    clients_totaux_repris: totauxRepris,
    ...(clientsInconnus.length > 0
      ? { clients_inconnus: [...new Set(clientsInconnus)].slice(0, 40) } : {}),
    erreurs,
  }

  // Trace de l'échange (0137). On garde le payload BRUT : c'est ce qui permet
  // de rejouer un import raté au lieu de perdre la journée. `journaliser` ne
  // lève jamais — une trace manquée ne doit pas faire échouer un import qui a
  // réussi.
  await journaliser({
    sens: 'entrant',
    systeme: source_caisse,
    type: 'tickets',
    reference: `${encaissements.length} ticket(s)`,
    payload: body as unknown,
    resultat: bilan,
    statut: erreurs.length === 0 ? 'succes' : 'echec',
    erreur: erreurs.length ? erreurs.map(e => `${e.ticket}: ${e.error}`).join(' | ').slice(0, 2000) : null,
    duree_ms: Date.now() - t0,
  })

  return NextResponse.json(bilan)
}
