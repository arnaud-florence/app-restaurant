'use server'

// Demander ses conditions à un fournisseur.
//
// ⚠️ L'ENVOI EST UN GESTE HUMAIN. Rien ici ne part tout seul : l'action
// n'est appelée que sur un clic, article par article sélectionné. Un
// commercial relancé automatiquement chaque nuit cesse de répondre.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { messageDemandeRemise } from '@/lib/catalogue-achats'

const Schema = z.object({
  fournisseur_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(200),
})

export type ResultatDemande = {
  ok: boolean
  message: string
  /** Le texte préparé — toujours rendu, même si l'envoi n'a pas eu lieu. */
  brouillon?: { destinataire: string | null; objet: string; texte: string }
}

export async function demanderRemises(input: z.infer<typeof Schema>): Promise<ResultatDemande> {
  await requireManager()
  const { fournisseur_id, ids } = Schema.parse(input)
  const sb = await createClient()

  const { data: f } = await sb.from('fournisseurs')
    .select('nom, email').eq('id', fournisseur_id).single()
  if (!f) return { ok: false, message: 'Fournisseur introuvable.' }

  const { data: lignes } = await sb.from('catalogue_fournisseur')
    .select('id, reference, designation, prix_ht, unite')
    .in('id', ids).eq('fournisseur_id', fournisseur_id)
  if (!lignes?.length) return { ok: false, message: 'Aucun article sélectionné.' }

  const { objet, texte } = messageDemandeRemise({
    fournisseur: f.nom as string,
    articles: lignes.map(l => ({
      reference: (l.reference as string) ?? '',
      designation: l.designation as string,
      prix_ht: l.prix_ht === null ? null : Number(l.prix_ht),
      unite: l.unite as string,
    })),
  })
  const brouillon = { destinataire: (f.email as string) ?? null, objet, texte }

  // ⚠️ Sans adresse, on ne prétend PAS avoir envoyé — et on ne date pas la
  // demande. Le message est rendu pour être copié ; l'article reste « à
  // demander », ce qui est la vérité.
  if (!f.email) {
    return {
      ok: false,
      message: `${f.nom} n'a pas d'adresse e-mail enregistrée. Le message est prêt à copier.`,
      brouillon,
    }
  }

  const envoi = await sendEmail({
    to: f.email as string,
    subject: objet,
    text: texte,
    html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${
      texte.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</pre>`,
  })

  if (!envoi.ok) {
    return { ok: false, message: `L'envoi a échoué (${envoi.reason ?? 'inconnu'}). Le message est prêt à copier.`, brouillon }
  }

  // ⚠️ La date est posée APRÈS un envoi réussi, jamais avant : une demande
  // préparée puis abandonnée doit rester à faire (0159). Et elle ne vaut pas
  // réponse — `tarif_negocie` reste NULL jusqu'à celle du fournisseur.
  await sb.from('catalogue_fournisseur')
    .update({ remise_demandee_le: new Date().toISOString() })
    .in('id', lignes.map(l => l.id))

  revalidatePath('/admin/achats')
  return { ok: true, message: `Demande envoyée à ${f.nom} pour ${lignes.length} référence(s).`, brouillon }
}
