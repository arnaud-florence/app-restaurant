'use server'

// Envoyer un bon de commande au fournisseur — pour de vrai.
//
// ⚠️ AVANT CE FICHIER, RIEN NE PARTAIT. `changerStatutBon(id, 'envoye')`
// ne faisait que changer une étiquette : le fournisseur ne recevait rien,
// et l'outil affichait « envoyé ». Un bon marqué envoyé que personne n'a
// reçu est pire qu'un brouillon — on croit la commande passée, et on s'en
// aperçoit le matin où la marchandise n'arrive pas.
//
// ⚠️ L'ENVOI EST TOUJOURS UN GESTE HUMAIN. Aucune tâche planifiée
// n'appelle cette action. Un bon de commande engage de l'argent : le jour
// où on l'automatisera, ce sera une décision du gérant, pas un effet de
// bord d'un agent qui tourne toutes les deux heures.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import {
  verifierEnvoi, messageBonCommande, referenceBon, totaux, type LigneBon,
} from '@/lib/bon-commande'

const Schema = z.object({
  bon_id: z.string().uuid(),
  /** Renvoi assumé après un échec ou une correction. */
  forcer: z.boolean().optional(),
})

export type ResultatEnvoi = {
  ok: boolean
  message: string
  brouillon?: { destinataire: string | null; objet: string; texte: string }
}

export async function envoyerBonAuFournisseur(input: z.infer<typeof Schema>): Promise<ResultatEnvoi> {
  await requireManager()
  const { bon_id, forcer } = Schema.parse(input)
  const sb = await createClient()

  const { data: bon } = await sb.from('bons_commande')
    .select('id, reference, statut, envoye_le, date_livraison_prevue, notes, fournisseur_id')
    .eq('id', bon_id).single()
  if (!bon) return { ok: false, message: 'Bon de commande introuvable.' }

  const { data: four } = await sb.from('fournisseurs')
    .select('nom, email').eq('id', bon.fournisseur_id as string).single()
  if (!four) return { ok: false, message: 'Fournisseur introuvable.' }

  const { data: brutes } = await sb.from('bon_commande_lignes')
    .select('quantite_commandee, prix_unitaire_ht, unite, libelle, ingredient:ingredients(nom, unite, reference_fournisseur), recette:recettes(nom, reference_fournisseur)')
    .eq('bon_commande_id', bon_id)

  const lignes: LigneBon[] = (brutes ?? []).map(l => {
    const ing = l.ingredient as { nom?: string; unite?: string; reference_fournisseur?: string } | null
    const rec = l.recette as { nom?: string; reference_fournisseur?: string } | null
    return {
      libelle: (l.libelle as string) ?? rec?.nom ?? ing?.nom ?? '(sans libellé)',
      quantite: Number(l.quantite_commandee ?? 0),
      unite: (l.unite as string) ?? ing?.unite ?? null,
      // ⚠️ `Number(null)` vaut ZÉRO : un prix inconnu deviendrait « gratuit »
      // et le total annoncé serait faux à la baisse.
      prix_unitaire_ht: l.prix_unitaire_ht == null ? null : Number(l.prix_unitaire_ht),
      reference: rec?.reference_fournisseur ?? ing?.reference_fournisseur ?? null,
    }
  })

  const controle = verifierEnvoi({
    lignes,
    email: (four.email as string) ?? null,
    dejaEnvoyeLe: (bon.envoye_le as string) ?? null,
    forcer,
  })

  const reference = (bon.reference as string) ?? referenceBon(new Date(), bon_id)
  const { data: param } = await sb.from('parametres')
    .select('cle, valeur').in('cle', ['adresse', 'nom_etablissement'])
  const lu = new Map((param ?? []).map(p => [p.cle as string, p.valeur as string]))

  // ⚠️ L'ADRESSE DE LIVRAISON NE SE MET PAS EN DUR. Le repli écrit ici disait
  // « Parking des Ferrages » alors que l'établissement est au 23 rue Notre
  // Dame — et le paramètre `adresse` n'existait pas, donc c'est le repli qui
  // s'imprimait. Un repli FAUX est pire que pas de repli : il ne lève aucune
  // erreur, il envoie simplement le camion ailleurs, et personne ne le voit
  // avant la livraison. La source de vérité est `etablissements`.
  const { data: etab } = await sb.from('etablissements')
    .select('nom, adresse').eq('is_principal', true).not('adresse', 'is', null).limit(1).maybeSingle()
  const adresse = lu.get('adresse') ?? (etab?.adresse as string | undefined)
  if (!adresse) {
    // Plutôt que d'inventer, on refuse — en rendant le brouillon pour qu'il
    // soit complété à la main, comme pour un fournisseur sans e-mail.
    return { ok: false, message: 'Aucune adresse de livraison : renseignez-la dans /admin/etablissements avant d’envoyer un bon.' }
  }

  const { objet, texte } = messageBonCommande({
    fournisseur: four.nom as string,
    reference,
    lignes,
    dateLivraison: (bon.date_livraison_prevue as string) ?? null,
    notes: (bon.notes as string) ?? null,
    etablissement: lu.get('nom_etablissement') ?? (etab?.nom as string) ?? 'CASATASIA',
    adresse,
  })
  const brouillon = { destinataire: (four.email as string) ?? null, objet, texte }

  // ⚠️ On rend TOUJOURS le brouillon, même sur refus : sans adresse e-mail,
  // le gérant doit pouvoir le copier et l'envoyer lui-même. Refuser sans
  // rien montrer l'obligerait à tout retaper.
  if (!controle.ok) return { ok: false, message: controle.message, brouillon }

  const envoi = await sendEmail({
    to: four.email as string,
    subject: objet,
    text: texte,
    html: `<pre style="font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap">${
      texte.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</pre>`,
  })

  if (!envoi.ok) {
    // ⚠️ On ne marque RIEN. Un échec d'envoi qui laisserait le bon en
    // « envoyé » est exactement le défaut qu'on corrige ici.
    return { ok: false, message: `L'envoi a échoué (${envoi.reason ?? 'inconnu'}). Le message est prêt à copier.`, brouillon }
  }

  const t = totaux(lignes)
  await sb.from('bons_commande').update({
    statut: 'envoye',
    envoye_le: new Date().toISOString(),
    envoye_a: four.email as string,
    reference,
    montant_total_ht: t.ht,
  }).eq('id', bon_id)

  revalidatePath('/admin/fournisseurs')
  return {
    ok: true,
    message: `Commande ${reference} envoyée à ${four.nom} (${lignes.length} référence(s), ${t.ht.toFixed(2)} € HT indicatif).`,
    brouillon,
  }
}
