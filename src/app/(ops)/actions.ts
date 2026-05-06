'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { type StatutArticle, type StatutCommande, type SourceCommande } from '@/lib/service'

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
      .select('statut')
      .eq('commande_id', article.commande_id)

    const statuts = (tous ?? []).map(a => a.statut as StatutArticle)
    let nouveauStatutCmd: StatutCommande = 'en_attente'
    if (statuts.length > 0) {
      if (statuts.every(s => s === 'servi'))                                nouveauStatutCmd = 'servi'
      else if (statuts.every(s => s === 'pret' || s === 'servi'))           nouveauStatutCmd = 'pret'
      else if (statuts.some(s => s === 'en_preparation'))                   nouveauStatutCmd = 'en_preparation'
      else                                                                   nouveauStatutCmd = 'en_attente'
    }

    // Ne jamais downgrader depuis 'encaisse' ou 'annule'
    const { data: cmd } = await supabase
      .from('commandes')
      .select('statut')
      .eq('id', article.commande_id)
      .single()
    if (cmd && cmd.statut !== 'encaisse' && cmd.statut !== 'annule' && cmd.statut !== nouveauStatutCmd) {
      await supabase
        .from('commandes')
        .update({ statut: nouveauStatutCmd })
        .eq('id', article.commande_id)

      // Si on bascule à 'servi' → la table passe à 'a_encaisser'
      if (nouveauStatutCmd === 'servi') {
        const { data: cmdFull } = await supabase
          .from('commandes')
          .select('numero_table')
          .eq('id', article.commande_id)
          .single()
        if (cmdFull?.numero_table) {
          await supabase
            .from('tables_restaurant')
            .update({ statut: 'a_encaisser' })
            .eq('numero', cmdFull.numero_table)
        }
      }
    }
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
  tag_destination: z.enum(['CUISINE','PIZZA','BAR']),
  commentaire: z.string().max(500).optional().nullable(),
})

const creerCommandeSchema = z.object({
  source: z.enum(['ONLINE','TABLE','COMPTOIR']),
  numero_table: z.string().max(20).optional().nullable(),
  serveur_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  articles: z.array(articleInputSchema).min(1, 'Au moins un article'),
})

export async function creerCommande(input: unknown): Promise<{ id: string; numero: string }> {
  const p = creerCommandeSchema.parse(input)
  const supabase = await createClient()

  // Récupère la session caisse ouverte du jour (pour les paiements futurs)
  const { data: session } = await supabase
    .from('sessions_caisse')
    .select('id')
    .is('fermee_at', null)
    .eq('date_session', new Date().toISOString().slice(0, 10))
    .maybeSingle()

  const total = p.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)
  const total_ttc = total * 1.10  // approximation 10% — réelle TVA mixte calculée à l'encaissement

  // Génère un numéro lisible (TKT-YYMMDD-XXXX)
  const today = new Date()
  const yymmdd = `${String(today.getFullYear()).slice(2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`
  const random4 = Math.random().toString(36).slice(2, 6).toUpperCase()
  const numero = `TKT-${yymmdd}-${random4}`

  const { data: cmd, error } = await supabase.from('commandes').insert({
    numero,
    source: p.source,
    numero_table: p.numero_table || null,
    statut: 'en_attente',
    montant_total_ht: total,
    montant_total_ttc: total_ttc,
    notes: p.notes || null,
    serveur_id: p.serveur_id || null,
    session_caisse_id: session?.id ?? null,
  }).select('id, numero').single()
  if (error || !cmd) throw new Error(error?.message ?? 'Erreur création commande')

  // Articles
  const { error: aErr } = await supabase.from('commande_articles').insert(
    p.articles.map(a => ({
      commande_id: cmd.id,
      recette_id: a.recette_id,
      quantite: a.quantite,
      prix_unitaire_ht: a.prix_unitaire_ht,
      tag_destination: a.tag_destination,
      commentaire: a.commentaire || null,
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

  revalidatePath('/cuisine')
  revalidatePath('/bar')
  revalidatePath('/serveur')
  return { id: cmd.id as string, numero: cmd.numero as string }
}

// ─── Encaissement : Multi-paiements + tips + libère table ────────────
const paiementSchema = z.object({
  methode: z.enum(['especes','carte','ticket_resto','virement','autre']),
  montant: z.number().min(0),
  pourboire: z.number().min(0).default(0),
  reference: z.string().max(100).optional().nullable(),
})

const encaisserSchema = z.object({
  commande_id: z.string().uuid(),
  serveur_id: z.string().uuid().optional().nullable(),
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

  // Récupère la session caisse ouverte
  const { data: session } = await supabase
    .from('sessions_caisse')
    .select('id')
    .is('fermee_at', null)
    .eq('date_session', new Date().toISOString().slice(0, 10))
    .maybeSingle()

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
      session_caisse_id: session?.id ?? null,
      methode: x.methode,
      montant: x.montant,
      pourboire: x.pourboire,
      serveur_id: p.serveur_id || null,
      reference: x.reference || null,
    }))
  )
  if (pErr) throw new Error(`Erreur paiements : ${pErr.message}`)

  // 2. Marque commande encaisse + tip total
  const { error: uErr } = await supabase
    .from('commandes')
    .update({ statut: 'encaisse', mode_paiement: p.paiements.map(x => x.methode).join('+'), pourboire_total: totalTips })
    .eq('id', p.commande_id)
  if (uErr) throw new Error(`Erreur maj commande : ${uErr.message}`)

  // 3. Libère la table
  if (cmd.numero_table) {
    await supabase
      .from('tables_restaurant')
      .update({ statut: 'libre', commande_active_id: null })
      .eq('numero', cmd.numero_table)
  }

  revalidatePath('/cuisine')
  revalidatePath('/bar')
  revalidatePath('/serveur')
  revalidatePath('/admin')
  return { ok: true as const }
}

// ─── Annuler une commande ────────────────────────────────────────────
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
  revalidatePath('/cuisine')
  revalidatePath('/bar')
  revalidatePath('/serveur')
  return { ok: true as const }
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
      id, numero, source, numero_table, statut, notes, created_at,
      serveur:employes!serveur_id(prenom, nom),
      commande_articles(id, commande_id, recette_id, quantite, prix_unitaire_ht, tag_destination, commentaire, statut, recette:recettes(nom))
    `)
    .not('statut', 'in', '(encaisse,annule)')
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
      statut: r.statut as StatutCommande,
      notes: (r.notes as string) ?? null,
      created_at: r.created_at as string,
      serveur_nom: serv ? `${serv.prenom ?? ''} ${serv.nom ?? ''}`.trim() : null,
      articles: articles.map(a => ({
        id: a.id as string,
        commande_id: a.commande_id as string,
        recette_id: (a.recette_id as string) ?? null,
        recette_nom: a.recette?.nom ?? '— recette supprimée —',
        quantite: Number(a.quantite ?? 1),
        prix_unitaire_ht: Number(a.prix_unitaire_ht ?? 0),
        tag_destination: a.tag_destination as 'CUISINE' | 'PIZZA' | 'BAR',
        commentaire: (a.commentaire as string) ?? null,
        statut: a.statut as StatutArticle,
      })),
    }
  })
}
