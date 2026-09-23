// Qui est le moins cher — et sur quoi exactement.
//
// L'outil savait ce qu'on PAIE (les factures scannées alimentent
// `ingredients.prix_achat_ht`). Il ne savait pas ce que les autres
// PROPOSENT : un devis reçu par mail se lisait une fois et se rangeait.
//
// Cet écran met les deux côte à côte, à l'unité, et refuse de classer ce
// qui n'est pas comparable.

import { createClient } from '@/lib/supabase/server'
import { comparer, prixReference, prixReferenceMatiere, memeBase, score, type LigneTarif } from '@/lib/tarifs-fournisseurs'
import TarifsClient from './TarifsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarifs fournisseurs' }

export default async function TarifsFournisseursPage() {
  const sb = await createClient()

  const [{ data: tarifs }, { data: fournisseurs }, { data: matieres }] = await Promise.all([
    sb.from('catalogue_fournisseur')
      .select('id, fournisseur_id, reference, designation, famille, unite, prix_ht, colis_quantite, colis_libelle, contenance_valeur, contenance_unite, cle_comparaison, ingredient_id, recette_id, date_tarif, source, nature')
      .eq('actif', true).order('famille').order('designation'),
    sb.from('fournisseurs').select('id, nom').order('nom'),
    // Nos matières réellement comptées : ce sont elles qu'on rachète, donc
    // les seules pour lesquelles un tarif concurrent a un sens.
    sb.from('ingredients').select('id, nom, unite, prix_achat_ht, fournisseur_principal')
      .eq('actif', true).eq('stocke', true).order('nom'),
  ])

  const noms = new Map((fournisseurs ?? []).map(f => [f.id as string, f.nom as string]))
  const lignes: LigneTarif[] = (tarifs ?? []).map(t => ({
    ...(t as unknown as LigneTarif),
    prix_ht: Number(t.prix_ht),
    colis_quantite: t.colis_quantite === null ? null : Number(t.colis_quantite),
    contenance_valeur: t.contenance_valeur === null ? null : Number(t.contenance_valeur),
    fournisseur_nom: noms.get(t.fournisseur_id as string) ?? '—',
  }))

  // ─── Le tarif face à ce qu'on paie déjà ────────────────────────
  //
  // C'est la comparaison qui a de la valeur aujourd'hui : un seul catalogue
  // est chargé, mais nos 41 matières portent un prix payé venu des factures.
  // Elle ne s'affiche QUE sur un rapprochement posé à la main.
  const nosMatieres = (matieres ?? []).map(m => ({
    id: m.id as string, nom: m.nom as string, unite: (m.unite as string) ?? '',
    prix: Number(m.prix_achat_ht), fournisseur: (m.fournisseur_principal as string) ?? null,
  }))
  const parMatiere = new Map(nosMatieres.map(m => [m.id, m]))

  // ⚠️ Seuls les DEVIS sont mis face à ce qu'on paie. Une ligne de nature
  // « facture » EST ce qu'on paie : la comparer à elle-même afficherait une
  // colonne d'écarts à zéro, qui noierait les vraies alternatives.
  const faceAFace = lignes
    .filter(l => l.nature === 'devis' && l.ingredient_id && parMatiere.has(l.ingredient_id))
    .map(l => {
      const nous = parMatiere.get(l.ingredient_id!)!
      const ref = prixReference(l)
      // Nos unités portent souvent leur contenance (« poche 1 kg »,
      // « barquette 1 kg ») : les lire remet les deux prix sur la même base.
      const notre = prixReferenceMatiere(nous.unite, nous.prix)
      // ⚠️ Rien n'est classé tant que la base n'est pas la même — ni l'unité,
      // ni le format de conserve. Un « €/barquette » face à un « €/kg »
      // désignerait un gagnant au hasard.
      const memeUnite = memeBase(ref, notre)
      return { ligne: l, nous, ref, notre, memeUnite,
        ecart: ref && notre && memeUnite && notre.prix > 0
          ? ((ref.prix - notre.prix) / notre.prix) * 100 : null }
    })
    .sort((a, b) => (a.ecart ?? 999) - (b.ecart ?? 999))

  // ─── Suggestions de matière, pour les lignes non rapprochées ───
  // Elles PROPOSENT. Aucune n'est présélectionnée : une suggestion trop
  // sûre d'elle se valide en bloc, et un faux rapprochement se voit encore
  // moins qu'une absence.
  const aRapprocher = lignes.filter(l => !l.ingredient_id).map(l => ({
    ...l,
    suggestions: nosMatieres
      .map(m => ({ id: m.id, nom: m.nom, unite: m.unite, prix: m.prix, note: score(l.designation, m.nom) }))
      .filter(s => s.note >= 100)     // tous les mots de la matière retrouvés
      .sort((a, b) => b.note - a.note).slice(0, 3),
  }))

  const groupes = comparer(lignes)
  const sansReference = lignes.filter(l => !prixReference(l)).length

  return (
    <TarifsClient
      lignes={lignes}
      groupes={groupes}
      faceAFace={faceAFace}
      aRapprocher={aRapprocher}
      matieres={nosMatieres}
      fournisseurs={(fournisseurs ?? []).map(f => ({ id: f.id as string, nom: f.nom as string }))}
      sansReference={sansReference}
    />
  )
}
