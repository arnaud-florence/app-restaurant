// La plateforme d'achat — tout ce que nos fournisseurs proposent, en un écran.
//
// `/admin/tarifs-fournisseurs` répond à « qui est le moins cher sur ce que
// j'achète ». Celui-ci répond à l'autre question, qui n'avait pas d'écran :
// « est-ce que quelqu'un a ça, et à quel prix ? » — 3 300 références, toutes
// sources confondues.

import { createClient } from '@/lib/supabase/server'
import { lireTout } from '@/lib/supabase/pagine'
import {
  etatPlateforme, manques,
  type ArticleAchat, type OffreFournisseur, type GroupeComparaison,
  type ArticleAchete,
} from '@/lib/catalogue-achats'
import { chargerLignesReassort } from '@/lib/reassort-donnees'
import { comparer, prixReference, type LigneTarif } from '@/lib/tarifs-fournisseurs'
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
      .order('designation').order('id')),   // ⚠️ `id` en dernier : sans colonne UNIQUE au tri, la pagination saute des lignes
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
  // ⚠️⚠️ LE PRIX DE RÉFÉRENCE SE CALCULE POUR TOUTE LIGNE LISIBLE, pas
  // seulement pour celles qui portent déjà une `cle_comparaison`. Il ne
  // l'était que dans la boucle de `comparer()` ci-dessous — donc sur ~300
  // lignes du catalogue, 6 %. Les 94 % restantes arrivaient à l'écran avec
  // `ref: null`, c'est-à-dire INCOMPARABLES PAR CONSTRUCTION : taper un
  // produit ne pouvait rien confronter, même quand les deux unités étaient
  // parfaitement lisibles et que deux fournisseurs le vendaient.
  //
  // ⚠️ Ça ne crée AUCUNE comparaison validée. `prixReference()` lit une
  // unité, il ne décide pas que deux produits sont le même — c'est un
  // humain qui pose la clé (0151), et `meilleur` continue de ne sortir que
  // de `comparer()`. Un prix de référence rend la confrontation POSSIBLE ;
  // il ne la rend pas VRAIE.
  //
  // ⚠️ Le `format` est conservé : sans lui une boîte 4/4 se comparerait à
  // une 5/1, qui n'ont pas le même poids net.
  const refParLigne = new Map<string, { prix: number; unite: string; format?: string | null }>()
  for (const l of pourComparer) {
    const r = prixReference(l)
    if (r) refParLigne.set(l.id, { prix: r.prix, unite: r.unite, format: r.format ?? null })
  }
  const meilleurs = new Set<string>()
  const groupes: GroupeComparaison[] = []
  for (const g of comparer(pourComparer)) {
    // Le repli « même format de conserve » de `comparer()` peut chiffrer une
    // ligne que `prixReference()` seul laisse muette : on garde le sien.
    for (const l of g.lignes) if (l.ref) refParLigne.set(l.id, { prix: l.ref.prix, unite: l.ref.unite, format: l.ref.format ?? null })
    // ⚠️ On ne désigne un « moins cher » QUE si le groupe est comparable :
    // sinon on couronnerait une poche de 600 g face à une d'un kilo.
    if (g.comparable && g.meilleur) meilleurs.add(g.meilleur)

    // ⚠️ L'état de la plateforme se mesure sur CES groupes, jamais sur un
    // min/max brut des prix. Un comptage naïf annonçait « Serviettes
    // −97 % » en opposant notre colis de 3 000 au paquet de 200 de
    // Promocash : le compteur d'avancement aurait été le premier menteur.
    // `comparer()` porte DÉJÀ `fournisseurs` et `ecartPct` — les recalculer
    // ici serait la troisième implémentation, et elle finirait par
    // annoncer un chiffre que l'écran d'à côté ne montre pas.
    groupes.push({
      cle: g.cle,
      comparable: g.comparable,
      fournisseurs: g.fournisseurs,
      ecartPct: g.ecartPct,
    })
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

  // ⚠️ La couverture de NOS matières est la mesure qui compte vraiment :
  // un catalogue de 3 300 références ne sert à rien s'il ne croise pas ce
  // qu'on achète. Seules les matières réellement suivies au stock comptent
  // — les 100 lignes de démo fausseraient le ratio (leçon de Gel Var).
  const { data: matieres } = await sb.from('ingredients')
    .select('id').eq('actif', true).eq('stocke', true)
  const { data: liens } = await sb.from('catalogue_fournisseur')
    .select('ingredient_id').eq('actif', true).not('ingredient_id', 'is', null)
  const couverts = new Set((liens ?? []).map(l => l.ingredient_id as string))
  const matieresSansOffre = (matieres ?? []).filter(m => !couverts.has(m.id as string)).length

  const fourns = (fournisseurs ?? []).map(f => ({
    id: f.id as string, nom: f.nom as string,
    email: (f.email as string) ?? null, actif: Boolean(f.actif),
  }))
  const etat = etatPlateforme(articles, offres, fourns, groupes)

  // ⚠️ NOTRE catalogue d'achat, celui des 193 références qu'on achète
  // vraiment — à ne pas confondre avec les 3 392 que les fournisseurs
  // proposent. Il vient de `chargerLignesReassort()`, la même construction
  // que `/admin/reassort` et que l'agent Stock : une deuxième finirait par
  // afficher un autre prix, et c'est celui qu'on lit qui décide.
  const achetes: ArticleAchete[] = (await chargerLignesReassort(sb)).map(l => ({
    cle: l.cle,
    nom: l.nom,
    nom_vente: l.nom_vente ?? null,
    categorie: l.categorie,
    etablissement: l.etablissement,
    unite: l.unite,
    fournisseur: l.fournisseur,
    reference: l.reference ?? null,
    prix: l.cout_unitaire_ht,
    estime: Boolean(l.estime),
    dernier_achat: l.dernier_achat ?? null,
    ailleurs: l.ailleurs ? { fournisseur: l.ailleurs.fournisseur, ecartPct: l.ailleurs.ecartPct } : null,
    offres: l.offres ?? [],
  }))

  return (
    <AchatsClient
      etat={etat}
      achetes={achetes}
      manques={manques(etat, matieresSansOffre)}
      matieresSuivies={(matieres ?? []).length}
      matieresCouvertes={(matieres ?? []).length - matieresSansOffre}
      articles={articles}
      offres={offres}
      fournisseurs={fourns}
    />
  )
}
