'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { type StatutArticle, type StatutCommande, type SourceCommande } from '@/lib/service'
import { sendPushToPostes } from '@/lib/push'
import { tauxTvaArticle, calculerLigneTva, agregerVentilation, type Consommation } from '@/lib/tva'
import { logActivite } from '@/lib/operateur'
import { getOrCreateSessionCaisseId } from '@/lib/caisse'
import {
  statutCommandeCible, estRemiseDirecte,
  type StatutArticleAgrege,
} from '@/lib/commande-statut'

// Marque 'servi' les articles d'une commande pas encore servis → déclenche la
// déduction de stock (trigger tg_deduire_stock_article). Le .neq évite toute
// double déduction (idempotent). À appeler quand la commande est consommée
// (servie/retirée/encaissée) pour les canaux comptoir/online/borne qui ne
// passent pas par le marquage article-par-article du serveur.
async function deduireStockCommande(
  supabase: Awaited<ReturnType<typeof createClient>>,
  commande_id: string,
): Promise<void> {
  try {
    await supabase.from('commande_articles')
      .update({ statut: 'servi' })
      .eq('commande_id', commande_id)
      .neq('statut', 'servi')
  } catch { /* best-effort */ }
}

// Libellé de zone à partir de la source d'une commande (pour le journal).
function zoneSource(source?: string | null): string {
  switch (source) {
    case 'TABLE': return 'Salle'
    case 'ONLINE': return 'En ligne'
    case 'COMPTOIR': return 'Comptoir'
    case 'BORNE': return 'Borne'
    default: return 'Service'
  }
}

// Attribue une commande à son POINT DE VENTE (etablissements.slug) selon la source
// + le tag majoritaire des articles. Permet à la caisse agréée / aux dashboards de
// ventiler le CA par point de vente. Best-effort (renvoie null si introuvable).
function etablissementSlugPour(source: string | null | undefined, tags: (string | null | undefined)[]): string {
  if (source === 'ONLINE') return 'snack-emporter'
  if (source === 'COMPTOIR') {
    const counts = new Map<string, number>()
    for (const t of tags) if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    switch (dominant) {
      case 'BAR': return 'bar'
      case 'SNACKING': return 'snack-emporter'
      case 'FOURNIL': return 'fournil'
      default: return 'le-relais-des-saveurs'   // CUISINE / PIZZA / mixte
    }
  }
  return 'le-relais-des-saveurs'                 // TABLE / BORNE / défaut = restauration
}

// ─── Articles : transitions de statut ────────────────────────────────
const transitionArticleSchema = z.object({
  article_id: z.string().uuid(),
  nouveau_statut: z.enum(['en_attente','en_preparation','pret','servi']),
})

export async function changerStatutArticle(input: unknown) {
  const p = transitionArticleSchema.parse(input)
  const supabase = await createClient()

  // 1. Update article
  const { error } = await supabase
    .from('commande_articles')
    .update({ statut: p.nouveau_statut })
    .eq('id', p.article_id)
  if (error) throw new Error(error.message)

  // 2. Synchronise commande.statut depuis l'agrégat des articles
  // Logique :
  //   • Si tous articles 'servi'           → commande 'servi'
  //   • Sinon si tous 'pret' ou 'servi'    → commande 'pret'
  //   • Sinon si au moins un 'en_preparation' → commande 'en_preparation'
  //   • Sinon (tous 'en_attente')          → commande 'en_attente'
  const { data: article } = await supabase
    .from('commande_articles')
    .select('commande_id')
    .eq('id', p.article_id)
    .single()

  if (article?.commande_id) {
    const { data: tous } = await supabase
      .from('commande_articles')
      .select('statut, tag_destination')
      .eq('commande_id', article.commande_id)

    const statuts = (tous ?? []).map(a => a.statut as StatutArticleAgrege)

    // Ne jamais downgrader depuis 'encaisse' ou 'annule'
    const { data: cmd } = await supabase
      .from('commandes')
      .select('statut, source, numero_table, ardoise_nom, mode_paiement, mode_retrait')
      .eq('id', article.commande_id)
      .single()

    // Règle de synchronisation + clôture des ventes au comptoir :
    // fonction pure, testée par scripts/test-commande-statut.mjs.
    //
    // Une vente au comptoir entièrement servie passe directement à
    // 'encaisse'. Sans cela elle resterait à 'servi' pour toujours et le
    // chiffre d'affaires du Fournil n'apparaîtrait NULLE PART — tout le
    // calcul du CA (dashboard, finances, agents) filtre sur 'encaisse'.
    // Ce n'est pas un encaissement fiscal : aucune ligne dans
    // `paiements_caisse`, la caisse agréée reste la source de vérité et le
    // connecteur rapprochera ses tickets de ces commandes.
    // Le retrait d'une commande web au Fournil se clôture de la même façon :
    // le client règle au comptoir en récupérant son sac. D'où mode_retrait
    // (pour écarter les livraisons) et les tags des articles (pour distinguer
    // une commande Fournil d'une commande du restaurant).
    const ctx = {
      source: (cmd?.source as string) ?? null,
      numero_table: (cmd?.numero_table as string) ?? null,
      ardoise_nom: (cmd?.ardoise_nom as string) ?? null,
      mode_retrait: (cmd?.mode_retrait as string) ?? null,
      tags: (tous ?? []).map(a => a.tag_destination as string),
    }
    const statutCible = statutCommandeCible(statuts, ctx) as StatutCommande
    const remiseDirecte = estRemiseDirecte(ctx)

    if (cmd && cmd.statut !== 'encaisse' && cmd.statut !== 'annule' && cmd.statut !== statutCible) {
      await supabase
        .from('commandes')
        .update({
          statut: statutCible,
          ...(statutCible === 'encaisse' && remiseDirecte
            ? { mode_paiement: cmd.mode_paiement ?? 'caisse_agreee' }
            : {}),
        })
        .eq('id', article.commande_id)

      // Si on bascule à 'servi' → la table passe à 'a_encaisser'
      if (statutCible === 'servi' && cmd.numero_table) {
        await supabase
          .from('tables_restaurant')
          .update({ statut: 'a_encaisser' })
          .eq('numero', cmd.numero_table)
      }
    }
  }

  // 3. Push notif : article d'une commande DE TABLE passe à 'pret' → ping serveurs/salle.
  //    On ne notifie QUE les commandes de table (numero_table présent) : les commandes
  //    ONLINE (emporter/livraison) et COMPTOIR ont leurs propres écrans (/emporter,
  //    /livreur, onglet comptoir) et ne sont pas portées par un serveur en salle —
  //    les pousser ici générait du bruit inutile pour la salle.
  if (p.nouveau_statut === 'pret') {
    try {
      const { data: art } = await supabase
        .from('commande_articles')
        .select('quantite, recette:recettes(nom), commande:commandes(numero_table, source)')
        .eq('id', p.article_id)
        .maybeSingle()
      if (art) {
        type CmdRow = { numero_table?: string | null; source?: string | null }
        const cmd = (art.commande ?? null) as CmdRow | null
        if (cmd?.numero_table) {
          const qty = (art.quantite as number) ?? 1
          const recJoin = art.recette as unknown as { nom?: string } | { nom?: string }[] | null
          const nom = (Array.isArray(recJoin) ? recJoin[0]?.nom : recJoin?.nom) ?? 'plat'
          await sendPushToPostes(['serveur', 'salle'], {
            title: '🍽 Plat prêt',
            body: `T${cmd.numero_table} · ×${qty} ${nom}`,
            tag: `art-${p.article_id}`,
            url:  '/serveur',
          })
        }
      }
    } catch { /* best-effort */ }
  }

  revalidatePath('/cuisine')
  revalidatePath('/bar')
  revalidatePath('/serveur')
  return { ok: true as const }
}

// ─── Création commande depuis /serveur ───────────────────────────────
const articleInputSchema = z.object({
  recette_id: z.string().uuid(),
  quantite: z.number().int().min(1),
  prix_unitaire_ht: z.number().min(0),
  tag_destination: z.enum(['CUISINE','SNACKING','PIZZA','BAR']),
  commentaire: z.string().max(500).optional().nullable(),
  allergenes_a_eviter: z.array(z.string()).optional(),  // Module 12
})

const creerCommandeSchema = z.object({
  source: z.enum(['ONLINE','TABLE','COMPTOIR']),
  numero_table: z.string().max(20).optional().nullable(),
  serveur_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  consommation: z.enum(['sur_place','emporter']).default('sur_place'),
  // Créneau retrait global (legacy/ONLINE site web) — si null : « dès que possible ».
  // Si `creneaux_par_tag` est fourni avec des entrées, `creneau_retrait` global est
  // recalculé = max(values) côté serveur (et le param d'entrée est ignoré).
  creneau_retrait: z.string().datetime().optional().nullable(),
  // Créneaux séparés par zone : { "SNACKING": "iso", "PIZZA": "iso", … }
  // Utilisé quand un panier mixe plusieurs tags avec plannings distincts.
  // NB : `partialRecord` (Zod v4) au lieu de `record` — sinon Zod exige TOUTES
  // les clés de l'enum présentes, ce qui casse les commandes mono-tag.
  creneaux_par_tag: z.partialRecord(
    z.enum(['CUISINE','SNACKING','PIZZA','BAR']),
    z.string().datetime(),
  ).optional().nullable(),
  articles: z.array(articleInputSchema).min(1, 'Au moins un article'),
  // Si true → commande créée en statut 'en_attente_paiement_comptoir' (visible
  // dans le banner d'encaissement /emporter), bascule en cuisine APRÈS encaissement.
  // Utilisé pour les commandes snack comptoir (mêmes règles que la borne).
  paiement_au_comptoir: z.boolean().optional().default(false),
  // Ardoise comptoir bar : nom du « tab » d'un client debout au comptoir. Les
  // tournées suivantes portant le même nom s'ajoutent à la même commande (une
  // seule addition, un seul encaissement à la fin).
  ardoise_nom: z.string().trim().max(60).optional().nullable(),
})

export async function creerCommande(input: unknown): Promise<{ id: string; numero: string; ajoute: boolean }> {
  const p = creerCommandeSchema.parse(input)
  const supabase = await createClient()

  // Récupère la session caisse ouverte du jour (pour les paiements futurs)
  const { data: session } = await supabase
    .from('sessions_caisse')
    .select('id')
    .is('fermee_at', null)
    .eq('date_session', new Date().toISOString().slice(0, 10))
    .maybeSingle()

  // ─── Addition unique par table : on AJOUTE à la commande active ───────
  // Règle métier service réel : une table = UNE seule addition qui se construit
  // par étapes (apéro → entrées → plats → desserts → café → digestifs). Tant que
  // la table n'est pas encaissée, un nouvel envoi s'ajoute à la commande existante
  // au lieu d'en créer une 2ᵉ — sinon on aurait plusieurs encaissements obligatoires.
  // (Ne concerne QUE les commandes de table ; ONLINE/COMPTOIR/borne restent séparées.)
  let appendCmd: {
    id: string; numero: string
    montant_total_ht: number; montant_total_ttc: number; tva_total: number
    ventilation_tva: Record<string, number>
    consommation: Consommation
    tousServis: boolean
  } | null = null
  if (p.paiement_au_comptoir !== true) {
    // Cas 1 — table : on suit la commande active de la table.
    // Cas 2 — ardoise comptoir : on suit la commande COMPTOIR ouverte du même nom.
    let activeId: string | null = null
    if (p.source === 'TABLE' && p.numero_table) {
      const { data: tbl } = await supabase.from('tables_restaurant')
        .select('commande_active_id').eq('numero', p.numero_table).maybeSingle()
      activeId = (tbl?.commande_active_id as string | null) ?? null
    } else if (p.source === 'COMPTOIR' && p.ardoise_nom) {
      const { data: ard } = await supabase.from('commandes')
        .select('id')
        .eq('source', 'COMPTOIR').eq('ardoise_nom', p.ardoise_nom)
        .not('statut', 'in', '(encaisse,annule,en_attente_paiement_comptoir)')
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
      activeId = (ard?.id as string | null) ?? null
    }
    if (activeId) {
      const { data: ac } = await supabase.from('commandes')
        .select('id, numero, statut, montant_total_ht, montant_total_ttc, tva_total, ventilation_tva, consommation')
        .eq('id', activeId).maybeSingle()
      // On ajoute uniquement si la commande est encore « ouverte » (ni payée, ni annulée,
      // ni en attente de paiement comptoir).
      if (ac && !['encaisse', 'annule', 'en_attente_paiement_comptoir'].includes(ac.statut as string)) {
        const { data: existArts } = await supabase.from('commande_articles')
          .select('statut').eq('commande_id', activeId)
        const arts = existArts ?? []
        const tousServis = arts.length > 0 && arts.every(a => a.statut === 'servi')
        appendCmd = {
          id: ac.id as string,
          numero: ac.numero as string,
          montant_total_ht: Number(ac.montant_total_ht ?? 0),
          montant_total_ttc: Number(ac.montant_total_ttc ?? 0),
          tva_total: Number(ac.tva_total ?? 0),
          ventilation_tva: (ac.ventilation_tva ?? {}) as Record<string, number>,
          consommation: (ac.consommation ?? 'sur_place') as Consommation,
          tousServis,
        }
      }
    }
  }

  // Récupère contient_alcool pour chaque recette de la commande
  const recetteIds = Array.from(new Set(p.articles.map(a => a.recette_id)))
  const { data: recettes } = await supabase.from('recettes')
    .select('id, contient_alcool')
    .in('id', recetteIds)
  const alcoolMap = new Map<string, boolean>()
  for (const r of (recettes ?? [])) alcoolMap.set(r.id as string, !!r.contient_alcool)

  // Calcule TVA par article + agrège. Si on ajoute à une commande existante, on
  // reprend SA consommation (sur place / emporter) pour rester cohérent sur l'addition.
  const consommation: Consommation = appendCmd ? appendCmd.consommation : p.consommation
  const lignesTva = p.articles.map(a => {
    const alcool = alcoolMap.get(a.recette_id) ?? false
    const taux   = tauxTvaArticle(alcool, consommation)
    const calc   = calculerLigneTva(a.quantite, a.prix_unitaire_ht, taux)
    return { ...a, tva_taux: taux, tva_eur: calc.tva_eur, ttc: calc.ttc, prix_unitaire_ttc: calc.prix_unitaire_ttc, ht: calc.ht }
  })
  const total_ht  = lignesTva.reduce((s, l) => s + l.ht, 0)
  const total_ttc = lignesTva.reduce((s, l) => s + l.ttc, 0)
  const tva_total = lignesTva.reduce((s, l) => s + l.tva_eur, 0)
  const ventilation = agregerVentilation(lignesTva.map(l => ({ tva_taux: l.tva_taux, tva_eur: l.tva_eur })))

  // ─── AJOUT à la commande active de la table (addition unique) ─────────
  if (appendCmd) {
    // 1. Ajoute les nouveaux articles à la commande existante
    const { error: aErr } = await supabase.from('commande_articles').insert(
      lignesTva.map(a => ({
        commande_id: appendCmd!.id,
        recette_id: a.recette_id,
        quantite: a.quantite,
        prix_unitaire_ht: a.prix_unitaire_ht,
        prix_unitaire_ttc: a.prix_unitaire_ttc,
        tva_taux: a.tva_taux,
        tva_eur:  a.tva_eur,
        tag_destination: a.tag_destination,
        commentaire: a.commentaire || null,
        allergenes_a_eviter: a.allergenes_a_eviter ?? [],
        statut: 'en_attente',
      }))
    )
    if (aErr) throw new Error(`Erreur ajout articles : ${aErr.message}`)

    // 2. Recalcule les totaux = existant + nouveaux ; fusionne la ventilation TVA
    const mergedVent: Record<string, number> = { ...appendCmd.ventilation_tva }
    for (const [taux, eur] of Object.entries(ventilation)) {
      mergedVent[taux] = Math.round(((mergedVent[taux] ?? 0) + Number(eur)) * 100) / 100
    }
    const upd: Record<string, unknown> = {
      montant_total_ht:  Math.round((appendCmd.montant_total_ht  + total_ht)  * 100) / 100,
      montant_total_ttc: Math.round((appendCmd.montant_total_ttc + total_ttc) * 100) / 100,
      tva_total:         Math.round((appendCmd.tva_total         + tva_total) * 100) / 100,
      ventilation_tva:   mergedVent,
      statut: 'en_attente',
    }
    // Si la tournée précédente était entièrement servie, on redémarre le minuteur
    // cuisine (created_at = maintenant) pour que la nouvelle tournée parte « au vert ».
    // Sinon on garde le created_at (le minuteur reflète le plus ancien plat en cours).
    if (appendCmd.tousServis) upd.created_at = new Date().toISOString()
    await supabase.from('commandes').update(upd).eq('id', appendCmd.id)

    // 3. Pour une table : elle redevient « occupée » (elle pouvait être 'a_encaisser'
    //    si tout était servi). Pour une ardoise comptoir : pas de table à mettre à jour.
    if (p.numero_table) {
      await supabase.from('tables_restaurant')
        .update({ statut: 'occupee', commande_active_id: appendCmd.id })
        .eq('numero', p.numero_table)
    }

    await logActivite({
      action: 'commande_articles_ajoutes',
      zone: zoneSource(p.source),
      cible: p.numero_table ? `Table ${p.numero_table}` : `Ardoise ${p.ardoise_nom ?? ''}`,
      details: { commande: appendCmd.numero, nb_articles: lignesTva.length },
    })

    revalidatePath('/cuisine')
    revalidatePath('/bar')
    revalidatePath('/serveur')
    return { id: appendCmd.id, numero: appendCmd.numero, ajoute: true }
  }

  // ─── Anti-race par tag : vérifie chaque créneau distinct n'est pas déjà pris ───
  // On consolide creneau_retrait (legacy) + creneaux_par_tag dans une map à vérifier.
  // 1 commande max par slot, par tag (= par planning).
  const creneauxAVerifier: Array<{ tag: 'CUISINE'|'SNACKING'|'PIZZA'|'BAR'; iso: string }> = []
  if (p.creneaux_par_tag) {
    for (const [tag, iso] of Object.entries(p.creneaux_par_tag)) {
      if (iso) creneauxAVerifier.push({ tag: tag as 'CUISINE'|'SNACKING'|'PIZZA'|'BAR', iso })
    }
  }
  // Legacy : si creneau_retrait fourni sans creneaux_par_tag, on déduit le tag de l'article majoritaire.
  // (Ce chemin reste utilisé par /api/public/commande pour le site web ONLINE.)
  if (p.creneau_retrait && creneauxAVerifier.length === 0) {
    const tagsPanier = p.articles.map(a => a.tag_destination)
    const tagPrincipal = (tagsPanier.find(t => t === 'SNACKING' || t === 'PIZZA') ?? 'SNACKING') as 'CUISINE'|'SNACKING'|'PIZZA'|'BAR'
    creneauxAVerifier.push({ tag: tagPrincipal, iso: p.creneau_retrait })
  }

  for (const { tag, iso } of creneauxAVerifier) {
    const slotStart = new Date(iso)
    const jourSemaine = slotStart.getDay()
    const { data: cfg } = await supabase.from('capacite_cuisine_par_creneau')
      .select('duree_creneau_min')
      .eq('jour_semaine', jourSemaine)
      .eq('tag_destination', tag)
      .eq('actif', true)
      .limit(1)
      .maybeSingle()
    const dureeMin = Number(cfg?.duree_creneau_min ?? 15)
    const slotEnd = new Date(slotStart.getTime() + dureeMin * 60_000)
    // 2 cas à compter :
    //   (a) commandes avec creneaux_par_tag[tag] qui tombent dans le slot
    //   (b) commandes legacy (creneaux_par_tag vide / sans ce tag) dont le
    //       creneau_retrait global tombe dans le slot — uniquement pour le tag
    //       « principal » (=SNACKING) car le legacy ne distingue pas les zones.
    const jsonPath = `creneaux_par_tag->>${tag}` as unknown as 'id'  // contourne le typing strict
    const { count: dejaPrisesJsonb } = await supabase.from('commandes')
      .select('*', { count: 'exact', head: true })
      .in('source', ['ONLINE', 'COMPTOIR'])
      .not('statut', 'in', '(annule)')
      .gte(jsonPath, slotStart.toISOString())
      .lt(jsonPath, slotEnd.toISOString())

    let dejaPrisesLegacy = 0
    if (tag === 'SNACKING') {
      const { count } = await supabase.from('commandes')
        .select('*', { count: 'exact', head: true })
        .in('source', ['ONLINE', 'COMPTOIR'])
        .not('statut', 'in', '(annule)')
        .is(jsonPath, null)
        .gte('creneau_retrait', slotStart.toISOString())
        .lt('creneau_retrait', slotEnd.toISOString())
      dejaPrisesLegacy = count ?? 0
    }

    if ((dejaPrisesJsonb ?? 0) + dejaPrisesLegacy >= 1) {
      throw new Error(`Ce créneau ${tag.toLowerCase()} vient d'être réservé. Choisis un autre horaire.`)
    }
  }

  // Calcule creneau_retrait global = max des creneaux_par_tag (= moment où tout est prêt)
  let creneauRetraitFinal: string | null = p.creneau_retrait ?? null
  let creneauxParTagFinal: Record<string, string> = {}
  if (p.creneaux_par_tag && Object.keys(p.creneaux_par_tag).length > 0) {
    creneauxParTagFinal = Object.fromEntries(
      Object.entries(p.creneaux_par_tag).filter(([, iso]) => !!iso),
    ) as Record<string, string>
    const maxIso = Object.values(creneauxParTagFinal)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    if (maxIso) creneauRetraitFinal = maxIso
  }

  // Génère un numéro lisible (TKT-YYMMDD-XXXX)
  const today = new Date()
  const yymmdd = `${String(today.getFullYear()).slice(2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`
  const random4 = Math.random().toString(36).slice(2, 6).toUpperCase()
  const numero = `TKT-${yymmdd}-${random4}`

  // Si paiement_au_comptoir → statut 'en_attente_paiement_comptoir' (banner /emporter
  // affiche, snack ne voit pas tant que pas payé). Sinon flow normal 'en_attente'.
  const statutInitial = p.paiement_au_comptoir === true
    ? 'en_attente_paiement_comptoir'
    : 'en_attente'

  // Attribution au point de vente (best-effort, jamais bloquant).
  let etablissementId: string | null = null
  try {
    const slugPdv = etablissementSlugPour(p.source, p.articles.map(a => a.tag_destination))
    const { data: etab } = await supabase.from('etablissements').select('id').eq('slug', slugPdv).maybeSingle()
    etablissementId = (etab?.id as string) ?? null
  } catch { /* colonne/table absente → on ignore */ }

  const { data: cmd, error } = await supabase.from('commandes').insert({
    numero,
    source: p.source,
    numero_table: p.numero_table || null,
    statut: statutInitial,
    etablissement_id: etablissementId,
    montant_total_ht: Math.round(total_ht * 100) / 100,
    montant_total_ttc: Math.round(total_ttc * 100) / 100,
    tva_total: Math.round(tva_total * 100) / 100,
    ventilation_tva: ventilation,
    consommation,
    notes: p.notes || null,
    serveur_id: p.serveur_id || null,
    session_caisse_id: session?.id ?? null,
    creneau_retrait: creneauRetraitFinal,
    creneaux_par_tag: creneauxParTagFinal,
    ardoise_nom: p.ardoise_nom || null,
  }).select('id, numero').single()
  if (error || !cmd) throw new Error(error?.message ?? 'Erreur création commande')

  // Articles
  const { error: aErr } = await supabase.from('commande_articles').insert(
    lignesTva.map(a => ({
      commande_id: cmd.id,
      recette_id: a.recette_id,
      quantite: a.quantite,
      prix_unitaire_ht: a.prix_unitaire_ht,
      prix_unitaire_ttc: a.prix_unitaire_ttc,
      tva_taux: a.tva_taux,
      tva_eur:  a.tva_eur,
      tag_destination: a.tag_destination,
      commentaire: a.commentaire || null,
      allergenes_a_eviter: a.allergenes_a_eviter ?? [],
      statut: 'en_attente',
    }))
  )
  if (aErr) {
    await supabase.from('commandes').delete().eq('id', cmd.id)
    throw new Error(`Erreur articles : ${aErr.message}`)
  }

  // Marque la table 'occupee' si commande TABLE
  if (p.source === 'TABLE' && p.numero_table) {
    await supabase
      .from('tables_restaurant')
      .update({ statut: 'occupee', commande_active_id: cmd.id })
      .eq('numero', p.numero_table)
  }

  // ─── Hook ONLINE : notif interne managers + cuisine ─────────────
  // Best-effort, jamais bloquant.
  if (p.source === 'ONLINE') {
    try {
      const { data: destinataires } = await supabase.from('employes')
        .select('id')
        .in('poste', ['manager', 'cuisine', 'cuisinier', 'second', 'pizzaiolo', 'barman'])
        .eq('actif', true)
      if (destinataires && destinataires.length > 0) {
        await supabase.from('notifications').insert(
          destinataires.map(e => ({
            destinataire_employe_id: e.id,
            type: 'commande_online_recue',
            titre: '📦 Nouvelle commande ONLINE',
            message: `Commande #${cmd.numero ?? cmd.id.slice(-6)} reçue depuis le site web`,
            url_action: '/emporter',
          }))
        )
      }
    } catch (e) {
      console.error('[notif-online] erreur création notifs :', e)
    }
  }

  await logActivite({
    action: 'commande_creee',
    zone: zoneSource(p.source),
    cible: p.numero_table ? `Table ${p.numero_table}` : `Cmd #${cmd.numero ?? cmd.id.slice(-6)}`,
    details: { source: p.source },
  })

  revalidatePath('/cuisine')
  revalidatePath('/bar')
  revalidatePath('/serveur')
  revalidatePath('/emporter')
  return { id: cmd.id as string, numero: cmd.numero as string, ajoute: false }
}

// ─── Toggle sur_place / emporter (recalcule TVA) ────────────────────
const setConsoSchema = z.object({
  commande_id: z.string().uuid(),
  consommation: z.enum(['sur_place', 'emporter']),
})

export async function setConsommationCommande(input: unknown): Promise<{ ok: true; montant_total_ht: number; montant_total_ttc: number; tva_total: number }> {
  const p = setConsoSchema.parse(input)
  const supabase = await createClient()

  // Récupère articles + recettes pour recalculer
  const { data: arts } = await supabase.from('commande_articles')
    .select('id, recette_id, quantite, prix_unitaire_ht')
    .eq('commande_id', p.commande_id)
  if (!arts || arts.length === 0) throw new Error('Commande introuvable ou vide')

  const recetteIds = Array.from(new Set(arts.map(a => a.recette_id as string)))
  const { data: recettes } = await supabase.from('recettes')
    .select('id, contient_alcool')
    .in('id', recetteIds)
  const alcoolMap = new Map<string, boolean>()
  for (const r of (recettes ?? [])) alcoolMap.set(r.id as string, !!r.contient_alcool)

  // Recalcule chaque ligne + agrège
  let total_ht = 0, total_ttc = 0, tva_total = 0
  const updates: Array<{ id: string; tva_taux: number; tva_eur: number; prix_unitaire_ttc: number }> = []
  for (const a of arts) {
    const alcool = alcoolMap.get(a.recette_id as string) ?? false
    const taux   = tauxTvaArticle(alcool, p.consommation)
    const calc   = calculerLigneTva(Number(a.quantite ?? 0), Number(a.prix_unitaire_ht ?? 0), taux)
    updates.push({
      id: a.id as string,
      tva_taux: taux,
      tva_eur: calc.tva_eur,
      prix_unitaire_ttc: calc.prix_unitaire_ttc,
    })
    total_ht  += calc.ht
    total_ttc += calc.ttc
    tva_total += calc.tva_eur
  }

  const ventilation = agregerVentilation(updates.map(u => ({ tva_taux: u.tva_taux, tva_eur: u.tva_eur })))

  // Update articles
  for (const u of updates) {
    await supabase.from('commande_articles').update({
      tva_taux: u.tva_taux, tva_eur: u.tva_eur, prix_unitaire_ttc: u.prix_unitaire_ttc,
    }).eq('id', u.id)
  }
  // Update commande
  const { error } = await supabase.from('commandes').update({
    consommation:      p.consommation,
    montant_total_ht:  Math.round(total_ht * 100) / 100,
    montant_total_ttc: Math.round(total_ttc * 100) / 100,
    tva_total:         Math.round(tva_total * 100) / 100,
    ventilation_tva:   ventilation,
  }).eq('id', p.commande_id)
  if (error) throw new Error(error.message)

  revalidatePath('/serveur')
  revalidatePath('/caisse')
  revalidatePath('/cuisine')
  return {
    ok: true as const,
    montant_total_ht:  Math.round(total_ht * 100) / 100,
    montant_total_ttc: Math.round(total_ttc * 100) / 100,
    tva_total:         Math.round(tva_total * 100) / 100,
  }
}

// ─── Encaissement : Multi-paiements + tips + libère table ────────────
// ─── Helper pour client : récupère le ratio points→€ depuis la config ────
export async function getRatioRemiseFidelite(): Promise<number> {
  const { getConfigFidelite } = await import('@/lib/fidelite')
  const c = await getConfigFidelite()
  return c.points_par_euro_remise
}

const paiementSchema = z.object({
  methode: z.enum(['especes','carte','ticket_resto','virement','autre','fidelite']),
  montant: z.number().min(0),
  pourboire: z.number().min(0).default(0),
  reference: z.string().max(100).optional().nullable(),
})

const encaisserSchema = z.object({
  commande_id: z.string().uuid(),
  serveur_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),  // pour crédit fidélité
  paiements: z.array(paiementSchema).min(1),
})

export async function encaisserCommande(input: unknown) {
  const p = encaisserSchema.parse(input)
  const supabase = await createClient()

  // Récupère la commande pour valider et récupérer le total
  const { data: cmd, error: cErr } = await supabase
    .from('commandes')
    .select('id, montant_total_ttc, numero_table, statut')
    .eq('id', p.commande_id)
    .single()
  if (cErr || !cmd) throw new Error('Commande introuvable')
  if (cmd.statut === 'encaisse') throw new Error('Commande déjà encaissée')
  if (cmd.statut === 'annule')   throw new Error('Commande annulée')

  // Détection mode "pré-cuisine" : commande en attente de paiement comptoir
  // (BORNE ou SNACK comptoir). Après encaissement → bascule en 'en_attente'
  // pour partir en cuisine, AU LIEU de 'encaisse' (qui clôt le cycle).
  const modePreCuisine = cmd.statut === 'en_attente_paiement_comptoir'

  // Session caisse : on récupère l'ouverte du jour, ou on en CRÉE une (filet de
  // sécurité) pour ne jamais produire de paiement orphelin hors Z-report.
  const sessionId = await getOrCreateSessionCaisseId(supabase)

  const totalPaye = p.paiements.reduce((s, x) => s + x.montant, 0)
  const totalTips = p.paiements.reduce((s, x) => s + x.pourboire, 0)
  const totalAttendu = Number(cmd.montant_total_ttc ?? 0)
  if (Math.abs(totalPaye - totalAttendu) > 0.05) {
    throw new Error(`Total paiements (${totalPaye.toFixed(2)} €) != total commande (${totalAttendu.toFixed(2)} €).`)
  }

  // 1. Insère les paiements
  const { error: pErr } = await supabase.from('paiements_caisse').insert(
    p.paiements.map(x => ({
      commande_id: p.commande_id,
      session_caisse_id: sessionId,
      methode: x.methode,
      montant: x.montant,
      pourboire: x.pourboire,
      serveur_id: p.serveur_id || null,
      reference: x.reference || null,
    }))
  )
  if (pErr) throw new Error(`Erreur paiements : ${pErr.message}`)

  // 2. Marque commande encaisse + tip total + lien client (si fourni)
  // EXCEPTION : mode pré-cuisine (borne/snack comptoir) → statut='en_attente'
  // (la commande doit encore être préparée, on ne clôt PAS le cycle).
  const updateCmd: Record<string, unknown> = {
    statut: modePreCuisine ? 'en_attente' : 'encaisse',
    mode_paiement: p.paiements.map(x => x.methode).join('+'),
    pourboire_total: totalTips,
    // Rattache la commande à la session caisse de l'encaissement : sinon le Z-report
    // (qui compte les commandes + agrège la TVA par session_caisse_id) la manquerait
    // si elle avait été créée avant l'ouverture de la session.
    session_caisse_id: sessionId,
    ...(modePreCuisine ? { borne_expire_at: null } : {}),
  }
  if (p.client_id) updateCmd.client_id = p.client_id
  const { error: uErr } = await supabase
    .from('commandes')
    .update(updateCmd)
    .eq('id', p.commande_id)
  if (uErr) throw new Error(`Erreur maj commande : ${uErr.message}`)

  // 3. Libère la table — mais SEULEMENT s'il ne reste plus aucune autre commande
  //    non réglée sur cette table (cas multi-tournées : apéro encaissé alors que
  //    les plats ne le sont pas encore). Sinon on garderait la table « libre »
  //    avec une tournée impayée orpheline → perte d'argent.
  if (cmd.numero_table && !modePreCuisine) {
    const { data: restantes } = await supabase
      .from('commandes')
      .select('id, statut')
      .eq('numero_table', cmd.numero_table)
      .not('statut', 'in', '(encaisse,annule)')
      .neq('id', p.commande_id)
      .order('created_at', { ascending: true })
      .limit(10)
    const reste = restantes ?? []
    if (reste.length === 0) {
      await supabase
        .from('tables_restaurant')
        .update({ statut: 'libre', commande_active_id: null })
        .eq('numero', cmd.numero_table)
    } else {
      // Il reste des tournées à régler → la table N'EST PAS libérée.
      const tousServis = reste.every(c => c.statut === 'servi')
      await supabase
        .from('tables_restaurant')
        .update({ statut: tousServis ? 'a_encaisser' : 'occupee', commande_active_id: reste[0].id })
        .eq('numero', cmd.numero_table)
    }
  }

  // 4. Fidélité — si paiement par points, on consomme + on crédite normalement
  // Best-effort : un échec ici ne bloque jamais l'encaissement.
  let fidelite: { points: number; client_id: string; consommes?: number } | null = null
  try {
    const { crediterPointsCommande, consommerPointsFidelite, getConfigFidelite } = await import('@/lib/fidelite')

    // 4a. Consommation : ligne de paiement 'fidelite' → mouvement utilisation
    const ligneFid = p.paiements.find(x => x.methode === 'fidelite')
    if (ligneFid && p.client_id) {
      const config = await getConfigFidelite()
      const pointsConsommes = Math.ceil(ligneFid.montant * config.points_par_euro_remise)
      try {
        await consommerPointsFidelite({
          client_id: p.client_id,
          points: pointsConsommes,
          commande_id: p.commande_id,
          employe_id: p.serveur_id ?? null,
        })
        fidelite = { points: 0, client_id: p.client_id, consommes: pointsConsommes }
      } catch (e) {
        // Solde insuffisant ou autre — log mais ne bloque pas
        console.error('[fidelite] consommation échouée :', e)
      }
    }

    // 4b. Crédit (gain) sur la part de l'addition réglée en argent réel — PAS sur la
    // part payée en points (sinon le client gagne des points sur ses propres points).
    const redemptionTTC = p.paiements.filter(x => x.methode === 'fidelite').reduce((s, x) => s + x.montant, 0)
    const ratioEligible = totalAttendu > 0 ? Math.max(0, 1 - redemptionTTC / totalAttendu) : 1
    const r = await crediterPointsCommande(p.commande_id, p.serveur_id ?? null, ratioEligible)
    if (r) {
      fidelite = {
        points: r.points,
        client_id: r.client_id,
        consommes: fidelite?.consommes,
      }
    }
  } catch (e) {
    console.error('[fidelite] erreur globale :', e)
  }

  // Filet de sécurité : déduit le stock si la commande est encaissée sans être
  // passée par 'servi' (ex. comptoir encaissé directement). Idempotent.
  await deduireStockCommande(supabase, p.commande_id)

  const totalEncaisse = p.paiements.reduce((s, x) => s + Number(x.montant ?? 0), 0)
  await logActivite({
    action: 'encaissement',
    zone: 'Caisse',
    cible: `${totalEncaisse.toFixed(2)} €`,
    details: { montant: totalEncaisse, commande_id: p.commande_id, modes: p.paiements.map(x => x.methode) },
  })

  revalidatePath('/cuisine')
  revalidatePath('/bar')
  revalidatePath('/serveur')
  revalidatePath('/admin')
  return { ok: true as const, fidelite }
}

// ─── Annuler une commande ────────────────────────────────────────────
// ─── Transition statut commande ONLINE ───────────────────────────────
// Utilisée par /emporter pour avancer manuellement les statuts :
//   en_attente → en_preparation → pret_pour_retrait → retire_par_client
const statutOnlineSchema = z.object({
  commande_id:     z.string().uuid(),
  nouveau_statut:  z.enum(['en_preparation', 'pret_pour_retrait', 'retire_par_client']),
})

export async function marquerStatutCommandeOnline(input: unknown) {
  const p = statutOnlineSchema.parse(input)
  const supabase = await createClient()
  const { data: cmd } = await supabase.from('commandes')
    .select('source, statut, numero, client_id, client_email, client_nom, creneau_retrait, montant_total_ttc')
    .eq('id', p.commande_id).maybeSingle()
  if (!cmd) throw new Error('Commande introuvable')
  if (cmd.source !== 'ONLINE') throw new Error('Cette action est réservée aux commandes ONLINE')
  if (cmd.statut === 'encaisse' || cmd.statut === 'annule') {
    throw new Error('Commande terminée — modification impossible')
  }
  const { error } = await supabase.from('commandes')
    .update({ statut: p.nouveau_statut })
    .eq('id', p.commande_id)
  if (error) throw new Error(error.message)

  // Déduction de stock quand la commande ONLINE est préparée/retirée
  // (sinon le stock ne bougerait jamais pour le canal en ligne).
  if (p.nouveau_statut === 'pret_pour_retrait' || p.nouveau_statut === 'retire_par_client') {
    await deduireStockCommande(supabase, p.commande_id)
  }

  // ─── Hook email client si commande prête à retirer ──────────────
  // Best-effort, jamais bloquant.
  if (p.nouveau_statut === 'pret_pour_retrait') {
    try {
      // Récupère email du client (lien client_id ou champ libre)
      let email: string | null = (cmd.client_email as string) ?? null
      let nom: string | null = (cmd.client_nom as string) ?? null
      if (!email && cmd.client_id) {
        const { data: cli } = await supabase.from('clients')
          .select('email, prenom, nom').eq('id', cmd.client_id).maybeSingle()
        if (cli) {
          email = (cli.email as string) ?? null
          nom = `${(cli.prenom as string) ?? ''} ${(cli.nom as string) ?? ''}`.trim() || null
        }
      }
      if (email) {
        const { sendEmail, emailLayout } = await import('@/lib/email')
        const numero = (cmd.numero as string) ?? p.commande_id.slice(-6)
        const heureRetrait = cmd.creneau_retrait
          ? new Date(cmd.creneau_retrait as string).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : null
        const body = `
          <p>Bonjour${nom ? ' ' + nom.split(' ')[0] : ''},</p>
          <p><strong>Votre commande #${numero} est prête à retirer ! 🎁</strong></p>
          ${heureRetrait ? `<p>Vous pouvez venir la chercher dès maintenant${heureRetrait ? ` (créneau prévu : ${heureRetrait})` : ''}.</p>` : '<p>Vous pouvez venir la chercher dès maintenant.</p>'}
          <p>À très vite,<br><strong>L'équipe</strong></p>
        `
        // Best-effort en arrière-plan, on n'attend pas
        sendEmail({
          to: email,
          subject: `🎁 Commande #${numero} prête à retirer`,
          html: emailLayout({ titre: 'Commande prête !', bodyHtml: body }),
        }).catch(e => console.error('[email] envoi prête échoué :', e))
      }
    } catch (e) {
      console.error('[hook-pret-retrait] erreur :', e)
    }
  }

  revalidatePath('/emporter')
  revalidatePath('/cuisine')
  revalidatePath('/pizza')
  revalidatePath('/bar')
  return { ok: true as const }
}

// Avance une commande COMPTOIR (typiquement prise depuis /emporter snack ou /bar)
// dans le flow : en_attente → en_preparation → pret → servi.
// Source ONLINE → utiliser marquerStatutCommandeOnline à la place.
const statutComptoirSchema = z.object({
  commande_id:    z.string().uuid(),
  nouveau_statut: z.enum(['en_preparation', 'pret', 'servi']),
})

export async function avancerCommandeComptoir(input: unknown) {
  const p = statutComptoirSchema.parse(input)
  const supabase = await createClient()
  const { data: cmd } = await supabase.from('commandes')
    .select('source, statut, mode_paiement').eq('id', p.commande_id).maybeSingle()
  if (!cmd) throw new Error('Commande introuvable')
  if (cmd.source === 'ONLINE') throw new Error('Utilisez marquerStatutCommandeOnline pour ONLINE')
  if (cmd.statut === 'encaisse' || cmd.statut === 'annule') {
    throw new Error('Commande terminée — modification impossible')
  }
  // CAS SPÉCIAL : commande pré-payée (BORNE/SNACK comptoir) qui passe à 'servi'
  // = "Donné au client". Pas besoin d'étape encaissement après → on clôt
  // directement en 'encaisse' pour faire disparaître la carte de l'agenda.
  const statutCible = (p.nouveau_statut === 'servi' && cmd.mode_paiement)
    ? 'encaisse'
    : p.nouveau_statut
  const { error } = await supabase.from('commandes')
    .update({ statut: statutCible })
    .eq('id', p.commande_id)
  if (error) throw new Error(error.message)
  // « Donné au client » (comptoir/snack/borne) = consommé → déduction stock.
  if (p.nouveau_statut === 'servi') {
    await deduireStockCommande(supabase, p.commande_id)
  }
  revalidatePath('/emporter')
  revalidatePath('/bar')
  revalidatePath('/caisse')
  return { ok: true as const }
}

// Construit un ISO UTC qui, affiché en Europe/Paris, donne HH:MM le jour `dateStr`.
// Indispensable côté Vercel (serveur en UTC) : sinon on stocke 14:30 UTC = 16:30 Paris.
function parisIsoFor(dateStr: string, hh: number, mm: number): string {
  const naive = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(naive)
  const parisH = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const parisM = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  const diffMin = (parisH * 60 + parisM) - (hh * 60 + mm)
  return new Date(naive.getTime() - diffMin * 60_000).toISOString()
}

// Liste les créneaux retrait dispo pour un tag (SNACKING/PIZZA/BAR) à une date donnée.
// Logique identique à /api/public/creneaux-retrait mais sans rate-limit (usage interne).
// Compte ONLINE + COMPTOIR pour ne pas saturer la cuisine.
//
// Utilise le client serveur classique (anon key) : la RLS est désactivée sur
// toutes les tables en single-tenant, donc pas besoin du service role.
export async function listerCreneauxDisponibles(
  tag: 'SNACKING' | 'PIZZA' | 'BAR',
  dateStr?: string,
): Promise<Array<{ heure: string; iso: string; disponible: boolean; count: number; max: number }>> {
  const date = dateStr ?? new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []

  const supabase = await createClient()
  // Utilise la date locale française (Europe/Paris) pour calculer le jour de la semaine,
  // pas l'UTC. Sinon à 23h FR un lundi (=21h UTC), getDay() de UTC peut renvoyer dimanche.
  const jourSemaine = new Date(date + 'T12:00:00').getDay()

  const { data: configs, error: errCfg } = await supabase.from('capacite_cuisine_par_creneau')
    .select('heure_debut, heure_fin, duree_creneau_min, max_commandes')
    .eq('jour_semaine', jourSemaine)
    .eq('tag_destination', tag)
    .eq('actif', true)

  // Logs serveur pour debug (visibles dans les logs Vercel — Settings > Logs)
  console.log(`[creneaux] tag=${tag} date=${date} jour_semaine=${jourSemaine} → ${configs?.length ?? 0} configs`,
    errCfg ? { error: errCfg.message } : '')

  if (!configs || configs.length === 0) return []

  const dayStart = new Date(date + 'T00:00:00').toISOString()
  const dayEnd = new Date(date + 'T23:59:59').toISOString()
  // On charge à la fois creneau_retrait (legacy) et creneaux_par_tag (multi-zones).
  // Une commande peut occuper le slot du tag concerné via :
  //   - creneaux_par_tag[tag] (multi-zones, depuis migration 0081)
  //   - creneau_retrait global + creneaux_par_tag vide (legacy, comptait pour SNACKING uniquement)
  const { data: cmds } = await supabase.from('commandes')
    .select('creneau_retrait, creneaux_par_tag')
    .in('source', ['ONLINE', 'COMPTOIR'])
    .not('statut', 'in', '(annule)')
    .gte('creneau_retrait', dayStart)
    .lte('creneau_retrait', dayEnd)

  const slots: Array<{ heure: string; iso: string; disponible: boolean; count: number; max: number }> = []
  const now = new Date()

  for (const cfg of configs) {
    const debut = (cfg.heure_debut as string).slice(0, 5)
    const fin = (cfg.heure_fin as string).slice(0, 5)
    const duree = Number(cfg.duree_creneau_min ?? 15)
    const max = Number(cfg.max_commandes ?? 5)
    const [hd, md] = debut.split(':').map(Number)
    const [hf, mf] = fin.split(':').map(Number)
    let curMin = hd * 60 + md
    const endMin = hf * 60 + mf

    while (curMin < endMin) {
      const h = Math.floor(curMin / 60)
      const m = curMin % 60
      const heureStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      // Construit slotStart en HEURE FRANÇAISE (pas UTC du serveur Vercel)
      const slotIso = parisIsoFor(date, h, m)
      const slotStartMs = new Date(slotIso).getTime()
      const slotEndMs = slotStartMs + duree * 60_000
      // Skip si déjà passé (marge 5 min)
      if (slotStartMs < now.getTime() + 5 * 60_000) {
        curMin += duree
        continue
      }
      const count = (cmds ?? []).filter(c => {
        // Priorité au champ multi-zones (creneaux_par_tag[tag])
        const parTag = (c.creneaux_par_tag as Record<string, string> | null) ?? {}
        if (parTag[tag]) {
          const t = new Date(parTag[tag]).getTime()
          return t >= slotStartMs && t < slotEndMs
        }
        // Sinon, fallback legacy : creneau_retrait global compte uniquement pour SNACKING
        // (le tag historiquement implicite avant la migration multi-créneaux).
        if (tag === 'SNACKING' && c.creneau_retrait && Object.keys(parTag).length === 0) {
          const t = new Date(c.creneau_retrait as string).getTime()
          return t >= slotStartMs && t < slotEndMs
        }
        return false
      }).length
      // Règle métier : 1 commande max par créneau, peu importe le max configuré.
      // Évite que plusieurs commandes (online + comptoir) atterrissent sur le même slot.
      slots.push({ heure: heureStr, iso: slotIso, disponible: count === 0, count, max })
      curMin += duree
    }
  }
  return slots
}

export async function annulerCommande(commande_id: string, motif: string) {
  if (!commande_id) throw new Error('commande_id manquant')
  const supabase = await createClient()
  const { error } = await supabase
    .from('commandes')
    .update({ statut: 'annule', notes: motif })
    .eq('id', commande_id)
  if (error) throw new Error(error.message)
  // Libère la table si applicable
  const { data: cmd } = await supabase.from('commandes').select('numero_table').eq('id', commande_id).single()
  if (cmd?.numero_table) {
    await supabase.from('tables_restaurant').update({ statut: 'libre', commande_active_id: null }).eq('numero', cmd.numero_table)
  }
  await logActivite({
    action: 'annulation',
    zone: 'Service',
    cible: cmd?.numero_table ? `Table ${cmd.numero_table}` : `Cmd ${commande_id.slice(-6)}`,
    details: { motif },
  })
  revalidatePath('/cuisine')
  revalidatePath('/bar')
  revalidatePath('/serveur')
  return { ok: true as const }
}

// ─── 86 : annuler UN SEUL article d'une commande (sans annuler la table) ──
// Supprime la ligne (commande_articles n'a pas de FK enfant), recalcule les
// totaux + ventilation TVA et re-synchronise le statut commande. N'autorise
// que les articles NON servis (le stock se déduit au passage 'servi' — un
// article déjà servi a déjà impacté le stock et ne doit pas être retiré ici).
const annulerArticleSchema = z.object({
  article_id: z.string().uuid(),
  motif: z.string().min(1).max(500),
})

export async function annulerArticle(input: unknown): Promise<{ ok: boolean; commandeAnnulee: boolean; error?: string }> {
  try {
    return await annulerArticleImpl(input)
  } catch (e) {
    return { ok: false, commandeAnnulee: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function annulerArticleImpl(input: unknown): Promise<{ ok: true; commandeAnnulee: boolean }> {
  const p = annulerArticleSchema.parse(input)
  const supabase = await createClient()

  const { data: art } = await supabase
    .from('commande_articles')
    .select('id, commande_id, statut, quantite, recette:recettes(nom)')
    .eq('id', p.article_id)
    .single()
  if (!art) throw new Error('Article introuvable')
  if (art.statut === 'servi') throw new Error('Article déjà servi — annulation impossible ici')
  const recJoin = art.recette as unknown as { nom?: string } | { nom?: string }[] | null
  const nomArticle = (Array.isArray(recJoin) ? recJoin[0]?.nom : recJoin?.nom) ?? 'article'

  const commande_id = art.commande_id as string
  const { data: cmd0 } = await supabase
    .from('commandes')
    .select('statut, consommation, numero_table')
    .eq('id', commande_id)
    .single()
  if (!cmd0) throw new Error('Commande introuvable')
  if (cmd0.statut === 'encaisse' || cmd0.statut === 'annule') throw new Error('Commande déjà clôturée')

  // Supprime la ligne (non servie → pas de stock à reverser)
  const { error: delErr } = await supabase.from('commande_articles').delete().eq('id', p.article_id)
  if (delErr) throw new Error(delErr.message)

  const { data: restants } = await supabase
    .from('commande_articles')
    .select('id, recette_id, quantite, prix_unitaire_ht, statut')
    .eq('commande_id', commande_id)

  const cibleLog = cmd0.numero_table ? `Table ${cmd0.numero_table}` : `Cmd ${commande_id.slice(-6)}`

  // Plus aucun article → annule la commande + libère la table
  if (!restants || restants.length === 0) {
    await supabase.from('commandes').update({ statut: 'annule', notes: `86 dernier article — ${p.motif}` }).eq('id', commande_id)
    if (cmd0.numero_table) {
      await supabase.from('tables_restaurant').update({ statut: 'libre', commande_active_id: null }).eq('numero', cmd0.numero_table)
    }
    await logActivite({ action: 'annulation', zone: 'Service', cible: cibleLog, details: { motif: p.motif, type: '86_article_dernier', article: nomArticle } })
    revalidatePath('/cuisine'); revalidatePath('/bar'); revalidatePath('/serveur'); revalidatePath('/caisse')
    return { ok: true as const, commandeAnnulee: true }
  }

  // Recalcule totaux + ventilation (même logique que setConsommationCommande)
  const consommation = (cmd0.consommation as 'sur_place' | 'emporter' | null) ?? 'sur_place'
  const recetteIds = Array.from(new Set(restants.map(a => a.recette_id as string)))
  const { data: recettes } = await supabase.from('recettes').select('id, contient_alcool').in('id', recetteIds)
  const alcoolMap = new Map<string, boolean>()
  for (const r of (recettes ?? [])) alcoolMap.set(r.id as string, !!r.contient_alcool)
  let total_ht = 0, total_ttc = 0, tva_total = 0
  const ventInput: Array<{ tva_taux: number; tva_eur: number }> = []
  for (const a of restants) {
    const alcool = alcoolMap.get(a.recette_id as string) ?? false
    const taux = tauxTvaArticle(alcool, consommation)
    const calc = calculerLigneTva(Number(a.quantite ?? 0), Number(a.prix_unitaire_ht ?? 0), taux)
    total_ht += calc.ht; total_ttc += calc.ttc; tva_total += calc.tva_eur
    ventInput.push({ tva_taux: taux, tva_eur: calc.tva_eur })
  }
  const ventilation = agregerVentilation(ventInput)

  // Re-synchronise le statut commande depuis l'agrégat restant
  const statuts = restants.map(a => a.statut as StatutArticle)
  let nouveauStatutCmd: StatutCommande = 'en_attente'
  if (statuts.every(s => s === 'servi'))                      nouveauStatutCmd = 'servi'
  else if (statuts.every(s => s === 'pret' || s === 'servi')) nouveauStatutCmd = 'pret'
  else if (statuts.some(s => s === 'en_preparation'))         nouveauStatutCmd = 'en_preparation'
  else                                                         nouveauStatutCmd = 'en_attente'

  await supabase.from('commandes').update({
    statut: nouveauStatutCmd,
    montant_total_ht:  Math.round(total_ht * 100) / 100,
    montant_total_ttc: Math.round(total_ttc * 100) / 100,
    tva_total:         Math.round(tva_total * 100) / 100,
    ventilation_tva:   ventilation,
  }).eq('id', commande_id)

  // Si l'agrégat restant est 'servi' → la table passe à 'a_encaisser'
  if (nouveauStatutCmd === 'servi' && cmd0.numero_table) {
    await supabase.from('tables_restaurant').update({ statut: 'a_encaisser' }).eq('numero', cmd0.numero_table)
  }

  await logActivite({ action: 'annulation', zone: 'Service', cible: cibleLog, details: { motif: p.motif, type: '86_article', article: nomArticle, quantite: art.quantite } })
  revalidatePath('/cuisine'); revalidatePath('/bar'); revalidatePath('/serveur'); revalidatePath('/caisse')
  return { ok: true as const, commandeAnnulee: false }
}

// ─── Caisse : ouvrir / clôturer / résumé Z ───────────────────────────

const ouvrirSessionSchema = z.object({
  fond_initial: z.number().min(0),
  ouverte_par: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

export async function ouvrirSessionCaisse(input: unknown) {
  const p = ouvrirSessionSchema.parse(input)
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)
  const { data: deja } = await supabase
    .from('sessions_caisse')
    .select('id, notes')
    .is('fermee_at', null)
    .eq('date_session', today)
    .maybeSingle()
  if (deja) {
    // Si la session ouverte a été créée AUTOMATIQUEMENT (1er encaissement avant
    // ouverture manuelle, fond 0), l'ouverture manuelle la RÉGULARISE avec le vrai
    // fond au lieu d'échouer. Sinon, c'est une vraie session déjà ouverte → refus.
    const estAuto = typeof deja.notes === 'string' && deja.notes.startsWith('Ouverture automatique')
    if (!estAuto) throw new Error('Une session est déjà ouverte aujourd\'hui')
    const { error: updErr } = await supabase
      .from('sessions_caisse')
      .update({ fond_initial: p.fond_initial, ouverte_par: p.ouverte_par || null, notes: p.notes || null })
      .eq('id', deja.id)
    if (updErr) throw new Error(updErr.message)
    await logActivite({ action: 'ouverture_caisse', zone: 'Caisse', cible: `Fond ${Number(p.fond_initial).toFixed(2)} € (session auto régularisée)` })
    revalidatePath('/caisse')
    return { id: deja.id as string }
  }

  const { data, error } = await supabase
    .from('sessions_caisse')
    .insert({
      date_session: today,
      fond_initial: p.fond_initial,
      ouverte_par: p.ouverte_par || null,
      notes: p.notes || null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur ouverture session')

  await logActivite({ action: 'ouverture_caisse', zone: 'Caisse', cible: `Fond ${Number(p.fond_initial).toFixed(2)} €` })

  revalidatePath('/caisse')
  return { id: data.id as string }
}

const fermerSessionSchema = z.object({
  session_id: z.string().uuid(),
  fond_final: z.number().min(0),
  ca_compte: z.number().min(0),
  fermee_par: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

export async function fermerSessionCaisse(input: unknown) {
  const p = fermerSessionSchema.parse(input)
  const supabase = await createClient()

  // Vérifie session encore ouverte
  const { data: sess, error: sErr } = await supabase
    .from('sessions_caisse')
    .select('id, fermee_at, fond_initial')
    .eq('id', p.session_id)
    .single()
  if (sErr || !sess) throw new Error('Session introuvable')
  if (sess.fermee_at) throw new Error('Session déjà clôturée')

  // Calcule ca_attendu = sum montants espèces de la session
  const { data: especes } = await supabase
    .from('paiements_caisse')
    .select('montant')
    .eq('session_caisse_id', p.session_id)
    .eq('methode', 'especes')
  const caAttendu = (especes ?? []).reduce((s, x) => s + Number(x.montant ?? 0), 0)
  // Mouvements d'espèces hors encaissement (sorties tiroir / apports).
  // Tolérant : si la table n'existe pas encore (migration 0107 non exécutée),
  // la requête renvoie data=null → sommes à 0, la clôture ne casse pas.
  const { data: mvts } = await supabase
    .from('mouvements_caisse')
    .select('type, montant')
    .eq('session_id', p.session_id)
  let sumSorties = 0, sumEntrees = 0
  for (const m of (mvts ?? [])) {
    if (m.type === 'sortie') sumSorties += Number(m.montant ?? 0)
    else                     sumEntrees += Number(m.montant ?? 0)
  }
  // Le "ca_compte" attendu en caisse = fond + espèces encaissées − sorties + apports
  const caisseAttendue = Number(sess.fond_initial ?? 0) + caAttendu - sumSorties + sumEntrees
  const ecart = Math.round((p.ca_compte - caisseAttendue) * 100) / 100

  const { error } = await supabase
    .from('sessions_caisse')
    .update({
      fermee_at: new Date().toISOString(),
      fond_final: p.fond_final,
      ca_attendu: caAttendu,
      ca_compte: p.ca_compte,
      ecart,
      fermee_par: p.fermee_par || null,
      notes: p.notes ?? null,
    })
    .eq('id', p.session_id)
  if (error) throw new Error(error.message)

  await logActivite({
    action: 'cloture_caisse', zone: 'Caisse',
    cible: `CA ${Number(p.ca_compte).toFixed(2)} €`,
    details: { ca_compte: p.ca_compte, ecart },
  })

  revalidatePath('/caisse')
  return { ok: true as const, ecart }
}

// ─── Mouvement d'espèces (sortie tiroir / apport) — nécessite migration 0107 ──
const mouvementCaisseSchema = z.object({
  type: z.enum(['sortie', 'entree']),
  montant: z.number().positive(),
  motif: z.string().min(1, 'Motif obligatoire').max(200),
  cree_par: z.string().uuid().optional().nullable(),
})

export async function enregistrerMouvementCaisse(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = mouvementCaisseSchema.parse(input)
    const supabase = await createClient()
    // Session de caisse ouverte (une seule par jour, fermee_at IS NULL)
    const { data: sess } = await supabase
      .from('sessions_caisse')
      .select('id')
      .is('fermee_at', null)
      .order('ouverte_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!sess) throw new Error('Aucune session de caisse ouverte — ouvre la caisse d\'abord')
    const { error } = await supabase.from('mouvements_caisse').insert({
      session_id: sess.id,
      type: p.type,
      montant: Math.round(p.montant * 100) / 100,
      motif: p.motif.trim(),
      created_by: p.cree_par || null,
    })
    if (error) throw new Error(error.message)
    await logActivite({
      action: p.type === 'sortie' ? 'sortie_caisse' : 'entree_caisse',
      zone: 'Caisse',
      cible: `${p.type === 'sortie' ? '−' : '+'}${p.montant.toFixed(2)} €`,
      details: { motif: p.motif.trim() },
    })
    revalidatePath('/caisse')
    return { ok: true as const }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Mouvements d'espèces d'une session (pour l'affichage caisse + rapport Z). */
export async function listMouvementsCaisse(session_id: string): Promise<Array<{ id: string; type: 'sortie' | 'entree'; montant: number; motif: string; created_at: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('mouvements_caisse')
    .select('id, type, montant, motif, created_at')
    .eq('session_id', session_id)
    .order('created_at', { ascending: false })
  return ((data ?? []) as Array<{ id: string; type: 'sortie' | 'entree'; montant: number; motif: string; created_at: string }>)
}

export type ResumeSession = {
  session: {
    id: string
    date_session: string
    ouverte_at: string
    fermee_at: string | null
    fond_initial: number
    fond_final: number | null
    ca_attendu: number | null
    ca_compte: number | null
    ecart: number | null
    notes: string | null
    ouverte_par_nom: string | null
    fermee_par_nom: string | null
  }
  paiements_par_methode: Array<{ methode: string; nb: number; montant: number; pourboire: number }>
  tips_par_serveur: Array<{ serveur_id: string | null; serveur_nom: string; nb: number; pourboire: number }>
  ventilation_tva: Array<{ taux: number; ht: number; tva: number; ttc: number }>
  nb_commandes_encaissees: number
  ca_total_ttc: number
  pourboires_total: number
  caisse_attendue: number  // fond_initial + espèces − sorties + apports
  mouvements: Array<{ id: string; type: 'sortie' | 'entree'; montant: number; motif: string; created_at: string }>
  sorties_total: number
  entrees_total: number
}

export async function getResumeSession(session_id?: string): Promise<ResumeSession | null> {
  const supabase = await createClient()

  let sessQuery = supabase
    .from('sessions_caisse')
    .select(`
      id, date_session, ouverte_at, fermee_at, fond_initial, fond_final,
      ca_attendu, ca_compte, ecart, notes,
      ouverte:employes!ouverte_par(prenom, nom),
      fermee:employes!fermee_par(prenom, nom)
    `)
  sessQuery = session_id
    ? sessQuery.eq('id', session_id)
    : sessQuery.is('fermee_at', null).eq('date_session', new Date().toISOString().slice(0, 10))

  const { data: sess } = await sessQuery.maybeSingle()
  if (!sess) return null

  // Paiements de la session avec serveur joint
  const { data: paiements } = await supabase
    .from('paiements_caisse')
    .select(`
      methode, montant, pourboire, serveur_id,
      serveur:employes!serveur_id(prenom, nom)
    `)
    .eq('session_caisse_id', sess.id)

  // Agrégat par méthode
  const mMethodes = new Map<string, { nb: number; montant: number; pourboire: number }>()
  // Agrégat tips par serveur
  const mTips = new Map<string, { serveur_id: string | null; serveur_nom: string; nb: number; pourboire: number }>()

  for (const p of paiements ?? []) {
    const meth = p.methode as string
    const cur = mMethodes.get(meth) ?? { nb: 0, montant: 0, pourboire: 0 }
    cur.nb += 1
    cur.montant += Number(p.montant ?? 0)
    cur.pourboire += Number(p.pourboire ?? 0)
    mMethodes.set(meth, cur)

    const tip = Number(p.pourboire ?? 0)
    if (tip > 0) {
      const sid = (p.serveur_id as string) ?? null
      const serv = p.serveur as { prenom?: string; nom?: string } | null
      const nom = serv ? `${serv.prenom ?? ''} ${serv.nom ?? ''}`.trim() : '— Non attribué —'
      const key = sid ?? '__none__'
      const c = mTips.get(key) ?? { serveur_id: sid, serveur_nom: nom, nb: 0, pourboire: 0 }
      c.nb += 1
      c.pourboire += tip
      mTips.set(key, c)
    }
  }

  // Nb commandes encaissées dans la session
  const { count: nbCmd } = await supabase
    .from('commandes')
    .select('id', { count: 'exact', head: true })
    .eq('session_caisse_id', sess.id)
    .eq('statut', 'encaisse')

  // Ventilation TVA agrégée sur les commandes encaissées de la session.
  // ventilation_tva stocke {taux: tva_eur}. On reconstruit HT et TTC par taux
  // (HT = tva / (taux/100) car tva = HT × taux/100 — exact).
  const { data: cmdsTva } = await supabase
    .from('commandes')
    .select('ventilation_tva')
    .eq('session_caisse_id', sess.id)
    .eq('statut', 'encaisse')

  const mTva = new Map<string, number>()
  for (const c of cmdsTva ?? []) {
    const v = (c.ventilation_tva ?? {}) as Record<string, number>
    for (const [taux, eur] of Object.entries(v)) {
      mTva.set(taux, (mTva.get(taux) ?? 0) + Number(eur ?? 0))
    }
  }
  const ventilationTva = Array.from(mTva.entries())
    .map(([taux, tva]) => {
      const t = Number(taux)
      const ht = t > 0 ? tva / (t / 100) : 0
      return {
        taux: t,
        ht:  Math.round(ht * 100) / 100,
        tva: Math.round(tva * 100) / 100,
        ttc: Math.round((ht + tva) * 100) / 100,
      }
    })
    .sort((a, b) => a.taux - b.taux)

  const especes = mMethodes.get('especes')?.montant ?? 0
  // Le CA exclut la « fidélité » : ce n'est pas un encaissement réel mais une
  // remise par points (sinon le CA et le ticket moyen seraient gonflés).
  const caTotal = Array.from(mMethodes.entries()).reduce((s, [meth, m]) => meth === 'fidelite' ? s : s + m.montant, 0)
  const tipsTotal = Array.from(mMethodes.values()).reduce((s, m) => s + m.pourboire, 0)

  const ouvR = sess.ouverte as { prenom?: string; nom?: string } | null
  const ferR = sess.fermee as { prenom?: string; nom?: string } | null

  // Mouvements d'espèces (tolérant : table absente → liste vide).
  const { data: mvtsRaw } = await supabase
    .from('mouvements_caisse')
    .select('id, type, montant, motif, created_at')
    .eq('session_id', sess.id)
    .order('created_at', { ascending: false })
  const mouvements = ((mvtsRaw ?? []) as Array<{ id: string; type: 'sortie' | 'entree'; montant: number; motif: string; created_at: string }>)
    .map(m => ({ ...m, montant: Number(m.montant ?? 0) }))
  const sortiesTotal = mouvements.filter(m => m.type === 'sortie').reduce((s, m) => s + m.montant, 0)
  const entreesTotal = mouvements.filter(m => m.type === 'entree').reduce((s, m) => s + m.montant, 0)

  return {
    session: {
      id: sess.id as string,
      date_session: sess.date_session as string,
      ouverte_at: sess.ouverte_at as string,
      fermee_at: (sess.fermee_at as string) ?? null,
      fond_initial: Number(sess.fond_initial ?? 0),
      fond_final: sess.fond_final !== null ? Number(sess.fond_final) : null,
      ca_attendu: sess.ca_attendu !== null ? Number(sess.ca_attendu) : null,
      ca_compte: sess.ca_compte !== null ? Number(sess.ca_compte) : null,
      ecart: sess.ecart !== null ? Number(sess.ecart) : null,
      notes: (sess.notes as string) ?? null,
      ouverte_par_nom: ouvR ? `${ouvR.prenom ?? ''} ${ouvR.nom ?? ''}`.trim() : null,
      fermee_par_nom: ferR ? `${ferR.prenom ?? ''} ${ferR.nom ?? ''}`.trim() : null,
    },
    paiements_par_methode: Array.from(mMethodes.entries())
      .map(([methode, v]) => ({ methode, ...v }))
      .sort((a, b) => b.montant - a.montant),
    tips_par_serveur: Array.from(mTips.values()).sort((a, b) => b.pourboire - a.pourboire),
    ventilation_tva: ventilationTva,
    nb_commandes_encaissees: nbCmd ?? 0,
    ca_total_ttc: caTotal,
    pourboires_total: tipsTotal,
    caisse_attendue: Math.round((Number(sess.fond_initial ?? 0) + especes - sortiesTotal + entreesTotal) * 100) / 100,
    mouvements,
    sorties_total: Math.round(sortiesTotal * 100) / 100,
    entrees_total: Math.round(entreesTotal * 100) / 100,
  }
}

export async function listSessionsFermees(limit = 30) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sessions_caisse')
    .select('id, date_session, ouverte_at, fermee_at, fond_initial, fond_final, ca_attendu, ca_compte, ecart')
    .not('fermee_at', 'is', null)
    .order('date_session', { ascending: false })
    .order('ouverte_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map(s => ({
    id: s.id as string,
    date_session: s.date_session as string,
    ouverte_at: s.ouverte_at as string,
    fermee_at: s.fermee_at as string,
    fond_initial: Number(s.fond_initial ?? 0),
    fond_final: s.fond_final !== null ? Number(s.fond_final) : null,
    ca_attendu: s.ca_attendu !== null ? Number(s.ca_attendu) : null,
    ca_compte: s.ca_compte !== null ? Number(s.ca_compte) : null,
    ecart: s.ecart !== null ? Number(s.ecart) : null,
  }))
}

// ─── Lectures partagées ──────────────────────────────────────────────

/**
 * Charge les commandes encore actives (non encaissées et non annulées)
 * avec leurs articles et infos serveur.
 */
export async function listCommandesActives() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commandes')
    .select(`
      id, numero, source, numero_table, ardoise_nom, statut, notes, created_at, creneau_retrait, creneaux_par_tag,
      montant_total_ttc, tva_total, consommation, mode_paiement,
      client_nom, client_telephone, adresse_livraison, mode_retrait,
      serveur:employes!serveur_id(prenom, nom),
      commande_articles(id, commande_id, recette_id, quantite, prix_unitaire_ht, prix_unitaire_ttc, tva_taux, tag_destination, commentaire, allergenes_a_eviter, statut, recette:recettes(nom))
    `)
    .not('statut', 'in', '(encaisse,annule,retire_par_client)')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => {
    const serv = r.serveur as { prenom?: string; nom?: string } | null
    const articles = (r.commande_articles ?? []) as Array<Record<string, unknown> & { recette?: { nom?: string } | null }>
    return {
      id: r.id as string,
      numero: r.numero as string,
      source: r.source as SourceCommande,
      numero_table: (r.numero_table as string) ?? null,
      ardoise_nom: (r.ardoise_nom as string) ?? null,
      statut: r.statut as StatutCommande,
      notes: (r.notes as string) ?? null,
      created_at: r.created_at as string,
      client_nom:        (r.client_nom as string) ?? null,
      client_telephone:  (r.client_telephone as string) ?? null,
      adresse_livraison: (r.adresse_livraison as string) ?? null,
      mode_retrait:      (r.mode_retrait as string) ?? null,
      serveur_nom: serv ? `${serv.prenom ?? ''} ${serv.nom ?? ''}`.trim() : null,
      montant_total_ttc: Number(r.montant_total_ttc ?? 0),
      tva_total:         Number(r.tva_total ?? 0),
      consommation:      ((r.consommation as string) === 'emporter' ? 'emporter' : 'sur_place') as 'sur_place' | 'emporter',
      creneau_retrait:   (r.creneau_retrait as string) ?? null,
      creneaux_par_tag:  (r.creneaux_par_tag as Partial<Record<'CUISINE'|'SNACKING'|'PIZZA'|'BAR', string>> | null) ?? {},
      mode_paiement:     (r.mode_paiement as string) ?? null,
      articles: articles.map(a => ({
        id: a.id as string,
        commande_id: a.commande_id as string,
        recette_id: (a.recette_id as string) ?? null,
        recette_nom: a.recette?.nom ?? '— recette supprimée —',
        quantite: Number(a.quantite ?? 1),
        prix_unitaire_ht: Number(a.prix_unitaire_ht ?? 0),
        prix_unitaire_ttc: Number(a.prix_unitaire_ttc ?? a.prix_unitaire_ht ?? 0),
        tva_taux: Number(a.tva_taux ?? 10),
        tag_destination: a.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
        commentaire: (a.commentaire as string) ?? null,
        allergenes_a_eviter: (a.allergenes_a_eviter as string[] | undefined) ?? [],
        statut: a.statut as StatutArticle,
      })),
    }
  })
}

/**
 * Charge UNE commande au format CommandeService (utile pour l'encaissement
 * d'une commande borne/snack via EncaissementModal partagé).
 */
export async function getCommandeServiceById(id: string) {
  const supabase = await createClient()
  const { data: r, error } = await supabase
    .from('commandes')
    .select(`
      id, numero, source, numero_table, ardoise_nom, statut, notes, created_at, creneau_retrait, creneaux_par_tag,
      montant_total_ttc, tva_total, consommation, client_nom,
      serveur:employes!serveur_id(prenom, nom),
      commande_articles(id, commande_id, recette_id, quantite, prix_unitaire_ht, prix_unitaire_ttc, tva_taux, tag_destination, commentaire, allergenes_a_eviter, statut, recette:recettes(nom))
    `)
    .eq('id', id)
    .single()
  if (error || !r) throw new Error(error?.message ?? 'Commande introuvable')
  const serv = r.serveur as { prenom?: string; nom?: string } | null
  const articles = (r.commande_articles ?? []) as Array<Record<string, unknown> & { recette?: { nom?: string } | null }>
  return {
    id: r.id as string,
    numero: r.numero as string,
    source: r.source as SourceCommande,
    numero_table: (r.numero_table as string) ?? null,
    ardoise_nom: (r.ardoise_nom as string) ?? null,
    statut: r.statut as StatutCommande,
    notes: (r.notes as string) ?? null,
    client_nom: (r.client_nom as string) ?? null,
    created_at: r.created_at as string,
    serveur_nom: serv ? `${serv.prenom ?? ''} ${serv.nom ?? ''}`.trim() : null,
    montant_total_ttc: Number(r.montant_total_ttc ?? 0),
    tva_total:         Number(r.tva_total ?? 0),
    consommation:      ((r.consommation as string) === 'emporter' ? 'emporter' : 'sur_place') as 'sur_place' | 'emporter',
    creneau_retrait:   (r.creneau_retrait as string) ?? null,
    creneaux_par_tag:  (r.creneaux_par_tag as Partial<Record<'CUISINE'|'SNACKING'|'PIZZA'|'BAR', string>> | null) ?? {},
    articles: articles.map(a => ({
      id: a.id as string,
      commande_id: a.commande_id as string,
      recette_id: (a.recette_id as string) ?? null,
      recette_nom: a.recette?.nom ?? '— recette supprimée —',
      quantite: Number(a.quantite ?? 1),
      prix_unitaire_ht: Number(a.prix_unitaire_ht ?? 0),
      tag_destination: a.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
      commentaire: (a.commentaire as string) ?? null,
      allergenes_a_eviter: (a.allergenes_a_eviter as string[] | undefined) ?? [],
      statut: a.statut as StatutArticle,
    })),
  }
}
