'use server'

// Prise de commande COMPTOIR générique — vente au comptoir d'un point de vente
// (Fournil, Bar, Snack…), attribuée à l'établissement (etablissement_id).
// Action dédiée et robuste. L'ENCAISSEMENT FISCAL se fait sur la caisse agréée.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getComptoir } from '@/lib/comptoir/config'
import { getConfigLivraisonFournil } from '@/lib/activation/server'
import { tourneePour, communeLivrable } from '@/lib/activation/config'

const schema = z.object({
  slug: z.string().min(1),
  articles: z.array(z.object({
    recette_id: z.string().uuid(),
    quantite: z.number().int().min(1).max(99),
    prix_unitaire_ht: z.number().min(0),
    tva: z.number().min(0),
  })).min(1),
  // ─── Commande téléphonique à livrer ─────────────────────────────
  // Le client appelle, l'employé saisit la commande au comptoir et coche
  // « à livrer ». Elle rejoint la tournée du jour (ou du lendemain si
  // l'heure limite est passée) et apparaît sur l'écran /livreur.
  livraison: z.object({
    nom: z.string().min(1).max(160),
    telephone: z.string().min(1).max(40),
    adresse: z.string().min(5).max(500),
    commune: z.string().min(1).max(120),
  }).nullable().optional(),
})

export async function creerCommandeComptoir(input: z.infer<typeof schema>) {
  try {
    const d = schema.parse(input)
    const cfg = getComptoir(d.slug)
    if (!cfg) return { ok: false as const, error: `Comptoir « ${d.slug} » inconnu.` }

    const sb = await createClient()

    const { data: etab } = await sb.from('etablissements').select('id').eq('slug', cfg.slug).maybeSingle()
    if (!etab) return { ok: false as const, error: `Point de vente « ${cfg.label} » introuvable.` }

    let total_ht = 0, total_ttc = 0, tva_total = 0
    const ventilation: Record<string, number> = {}
    const lignes = d.articles.map(a => {
      const ht = Math.round(a.prix_unitaire_ht * a.quantite * 100) / 100
      const tva_eur = Math.round(ht * (a.tva / 100) * 100) / 100
      const ttc = Math.round((ht + tva_eur) * 100) / 100
      const prix_unitaire_ttc = Math.round(a.prix_unitaire_ht * (1 + a.tva / 100) * 100) / 100
      total_ht += ht; tva_total += tva_eur; total_ttc += ttc
      const key = String(a.tva)
      ventilation[key] = Math.round(((ventilation[key] ?? 0) + tva_eur) * 100) / 100
      return {
        recette_id: a.recette_id, quantite: a.quantite,
        prix_unitaire_ht: a.prix_unitaire_ht, prix_unitaire_ttc,
        tva_taux: a.tva, tva_eur,
      }
    })
    total_ht = Math.round(total_ht * 100) / 100
    total_ttc = Math.round(total_ttc * 100) / 100
    tva_total = Math.round(tva_total * 100) / 100

    const t = new Date()
    const yymmdd = `${String(t.getFullYear()).slice(2)}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`
    const numero = `${cfg.prefix}-${yymmdd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    // ─── Livraison éventuelle (commande passée par téléphone) ────────
    // La zone et la tournée sont recalculées ici, jamais reprises telles
    // quelles : c'est la même règle que pour les commandes du site.
    let livraisonPatch: Record<string, unknown> = {}
    if (d.livraison) {
      const cfgLiv = await getConfigLivraisonFournil()
      if (!communeLivrable(d.livraison.commune, cfgLiv)) {
        return {
          ok: false as const,
          error: `Hors zone de livraison. Communes livrées : ${cfgLiv.communes.join(', ')}.`,
        }
      }
      const tournee = tourneePour(new Date(), cfgLiv)
      livraisonPatch = {
        // `source: 'ONLINE'` — c'est ce que filtre l'écran /livreur. Une
        // commande téléphonique est fonctionnellement une commande à
        // distance : elle doit apparaître dans la tournée comme les autres.
        source: 'ONLINE',
        mode_retrait: 'livraison',
        adresse_livraison: `${d.livraison.adresse.trim()}, ${d.livraison.commune.trim()}`,
        creneau_retrait: tournee.creneau,
        client_nom: d.livraison.nom.trim(),
        client_telephone: d.livraison.telephone.trim(),
        notes: `Commande par téléphone — tournée du ${tournee.date}`,
      }
    }

    const { data: cmd, error } = await sb.from('commandes').insert({
      numero,
      source: 'COMPTOIR',
      statut: 'en_attente',
      montant_total_ht: total_ht,
      montant_total_ttc: total_ttc,
      tva_total,
      ventilation_tva: ventilation,
      consommation: 'emporter',
      etablissement_id: etab.id,
      ...livraisonPatch,
    }).select('id, numero').single()
    if (error || !cmd) return { ok: false as const, error: error?.message ?? 'Erreur création commande' }

    const { error: aErr } = await sb.from('commande_articles').insert(
      lignes.map(l => ({
        commande_id: cmd.id,
        recette_id: l.recette_id,
        quantite: l.quantite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        prix_unitaire_ttc: l.prix_unitaire_ttc,
        tva_taux: l.tva_taux,
        tva_eur: l.tva_eur,
        tag_destination: cfg.tag,
        statut: 'en_attente',
      }))
    )
    if (aErr) {
      await sb.from('commandes').delete().eq('id', cmd.id)
      return { ok: false as const, error: aErr.message }
    }

    revalidatePath(`/comptoir/${cfg.slug}`)
    revalidatePath('/service')
    if (d.livraison) revalidatePath('/livreur')
    return { ok: true as const, numero: cmd.numero, total: total_ttc }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
  }
}
