// La plateforme d'achat — tout ce que nos fournisseurs proposent, en un écran.
//
// `/admin/tarifs-fournisseurs` répond à « qui est le moins cher sur ce que
// j'achète ». Celui-ci répond à l'autre question, qui n'avait pas d'écran :
// « est-ce que quelqu'un a ça, et à quel prix ? » — 3 300 références, toutes
// sources confondues.

import { createClient } from '@/lib/supabase/server'
import { lireTout } from '@/lib/supabase/pagine'
import type { ArticleAchat, OffreFournisseur } from '@/lib/catalogue-achats'
import { comparer, type LigneTarif } from '@/lib/tarifs-fournisseurs'
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
      .select('id, fournisseur_id, reference, designation, famille, unite, prix_ht, colis_quantite, colis_libelle, contenance_valeur, contenance_unite, cle_comparaison, remise_pct, tarif_negocie, achete, remise_demandee_le, date_tarif, nature')
      .eq('actif', true)
      .order('designation')),
    sb.from('fournisseurs').select('id, nom, email, actif').order('nom'),
  ])

  // Les offres conditionnelles et datées (0161) — un autre objet que les
  // remises du catalogue : l'avantage dépend d'une quantité achetée.
  const { data: brutesOffres } = await sb
    .from('promotions_fournisseur')
    .select('id, fournisseur_id, libelle, type, seuil_quantite, seuil_unite, avantage, date_debut, date_fin, releve_le')
    .eq('actif', true)
    .order('date_fin')

  const noms = new Map((fournisseurs ?? []).map(f => [f.id as string, f.nom as string]))

  // ⚠️ La comparaison est calculée SERVEUR, par `comparer()` — la même
  // fonction que /admin/tarifs-fournisseurs et que l'agent Stock. Une
  // troisième implémentation finirait par colorer en vert un fournisseur que
  // les deux autres écrans ne désignent pas.
  const pourComparer: LigneTarif[] = lignes.map(l => ({
    ...(l as unknown as LigneTarif),
    prix_ht: l.prix_ht === null ? null : Number(l.prix_ht),
    colis_quantite: l.colis_quantite === null ? null : Number(l.colis_quantite),
    contenance_valeur: l.contenance_valeur === null ? null : Number(l.contenance_valeur),
  }))
  const refParLigne = new Map<string, { prix: number; unite: string }>()
  const meilleurs = new Set<string>()
  for (const g of comparer(pourComparer)) {
    for (const l of g.lignes) if (l.ref) refParLigne.set(l.id, { prix: l.ref.prix, unite: l.ref.unite })
    // ⚠️ On ne désigne un « moins cher » QUE si le groupe est comparable :
    // sinon on couronnerait une poche de 600 g face à une d'un kilo.
    if (g.comparable && g.meilleur) meilleurs.add(g.meilleur)
  }

  const articles: ArticleAchat[] = lignes.map(l => ({
    id: l.id as string,
    fournisseur_id: l.fournisseur_id as string,
    fournisseur_nom: noms.get(l.fournisseur_id as string) ?? '—',
    reference: (l.reference as string) ?? '',
    designation: l.designation as string,
    famille: (l.famille as string) ?? null,
    cle: (l.cle_comparaison as string) ?? null,
    ref: refParLigne.get(l.id as string) ?? null,
    meilleur: meilleurs.has(l.id as string),
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

  const offres: OffreFournisseur[] = (brutesOffres ?? []).map(o => ({
    id: o.id as string,
    fournisseur_nom: noms.get(o.fournisseur_id as string) ?? '—',
    libelle: o.libelle as string,
    type: o.type as OffreFournisseur['type'],
    seuil_quantite: o.seuil_quantite === null ? null : Number(o.seuil_quantite),
    seuil_unite: (o.seuil_unite as string) ?? null,
    avantage: o.avantage === null ? null : Number(o.avantage),
    date_debut: (o.date_debut as string) ?? null,
    date_fin: (o.date_fin as string) ?? null,
    releve_le: o.releve_le as string,
  }))

  return (
    <AchatsClient
      articles={articles}
      offres={offres}
      fournisseurs={(fournisseurs ?? []).map(f => ({
        id: f.id as string, nom: f.nom as string,
        email: (f.email as string) ?? null, actif: Boolean(f.actif),
      }))}
    />
  )
}
