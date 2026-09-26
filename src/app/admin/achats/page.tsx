// La plateforme d'achat — tout ce que nos fournisseurs proposent, en un écran.
//
// `/admin/tarifs-fournisseurs` répond à « qui est le moins cher sur ce que
// j'achète ». Celui-ci répond à l'autre question, qui n'avait pas d'écran :
// « est-ce que quelqu'un a ça, et à quel prix ? » — 3 300 références, toutes
// sources confondues.

import { createClient } from '@/lib/supabase/server'
import { lireTout } from '@/lib/supabase/pagine'
import type { ArticleAchat } from '@/lib/catalogue-achats'
import AchatsClient from './AchatsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: "Plateforme d'achat" }

export default async function AchatsPage() {
  const sb = await createClient()

  // ⚠️ PostgREST plafonne à 1 000 lignes SANS le dire : le catalogue en
  // compte plus de 3 300 depuis l'import du portail Gineys, et un `.limit()`
  // plus large n'y change rien. Une lecture tronquée en silence ferait
  // chercher un produit qui est pourtant au catalogue.
  const [lignes, { data: fournisseurs }] = await Promise.all([
    lireTout<Record<string, unknown>>(() => sb.from('catalogue_fournisseur')
      .select('id, fournisseur_id, reference, designation, unite, prix_ht, remise_pct, tarif_negocie, achete, remise_demandee_le, date_tarif, nature')
      .eq('actif', true)
      .order('designation')),
    sb.from('fournisseurs').select('id, nom, email, actif').order('nom'),
  ])

  const noms = new Map((fournisseurs ?? []).map(f => [f.id as string, f.nom as string]))

  const articles: ArticleAchat[] = lignes.map(l => ({
    id: l.id as string,
    fournisseur_id: l.fournisseur_id as string,
    fournisseur_nom: noms.get(l.fournisseur_id as string) ?? '—',
    reference: (l.reference as string) ?? '',
    designation: l.designation as string,
    unite: l.unite as string,
    // ⚠️ `Number(null)` vaut ZÉRO : un « prix sur demande » passerait pour
    // gratuit et sortirait en tête de tri. L'absence reste une absence.
    prix_ht: l.prix_ht === null ? null : Number(l.prix_ht),
    remise_pct: l.remise_pct === null ? null : Number(l.remise_pct),
    tarif_negocie: l.tarif_negocie as boolean | null,
    achete: Boolean(l.achete),
    remise_demandee_le: (l.remise_demandee_le as string) ?? null,
    date_tarif: l.date_tarif as string,
    nature: l.nature as string,
  }))

  return (
    <AchatsClient
      articles={articles}
      fournisseurs={(fournisseurs ?? []).map(f => ({
        id: f.id as string, nom: f.nom as string,
        email: (f.email as string) ?? null, actif: Boolean(f.actif),
      }))}
    />
  )
}
