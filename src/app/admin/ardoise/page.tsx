// L'ARDOISE DE LA SEMAINE — composer la carte, et voir ce qu'elle coûte.
//
// ⚠️⚠️ POURQUOI CET ÉCRAN EXISTE. Le réassort lit `plats_du_jour` depuis le
// 04/10/2026 : sans ardoise posée il retombe sur la carte ENTIÈRE, c'est-à-
// dire 62 ingrédients et 231 € de périssable jeté par semaine, contre 133 €
// sur une ardoise de quatre plats. Il n'existait aucun endroit pour la poser.
//
// ⚠️ ET SURTOUT : le gain ne vient PAS de raccourcir l'ardoise. 230 couverts
// mangent 230 plats, que la carte en propose trente ou dix — la commande ne
// bouge presque pas (780 → 748 €). Il vient de QUELS PLATS ON MET ENSEMBLE :
// dix plats qui puisent dans le socle gaspillent deux fois moins que dix
// plats réclamant chacun leur référence. C'est pour ça que cet écran affiche
// le COÛT MARGINAL de chaque plat au moment où on le choisit, et pas un
// simple compteur de plats cochés.

import { createClient } from '@/lib/supabase/server'
import { lireTout } from '@/lib/supabase/pagine'
import { VOLUME_CASATASIA } from '@/lib/ardoise'
import ArdoiseClient from './ArdoiseClient'
import type { PlatCandidat, MatiereVue, OccurrenceVue } from './types'
import { lundi, dimanche } from './semaine'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ardoise de la semaine' }

export default async function ArdoisePage({
  searchParams,
}: { searchParams?: { semaine?: string } }) {
  const sb = await createClient()
  const debut = searchParams?.semaine ?? lundi()
  const fin = dimanche(debut)

  const [rec, ing, ri, pdj, pdji, etabs] = await Promise.all([
    lireTout<Record<string, unknown>>(() => sb.from('recettes')
      .select('id, nom, categorie, tag_destination, etablissement_id, prix_vente_ht, tva, actif')
      .eq('actif', true).order('nom').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('ingredients')
      .select('id, nom, unite, prix_achat_ht, prix_estime').eq('actif', true).order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('recette_ingredients')
      .select('recette_id, ingredient_id, quantite, unite').order('recette_id').order('ingredient_id')),
    // ⚠️⚠️ `date_fin` PEUT ÊTRE NULLE — l'ancien écran `/admin/plats-du-jour`
    // l'autorise (`p.date_fin || null`), et une ligne sans fin veut dire
    // « jusqu'à nouvel ordre ». Un `.gte('date_fin', …)` l'EXCLUT : elle
    // ferait commander par le réassort — qui, lui, traite la nulle comme
    // ouverte — sans jamais s'afficher ici. Deux lecteurs de la même table
    // qui ne disent pas la même chose, et rien pour le signaler.
    sb.from('plats_du_jour')
      .select('id, recette_id, titre, date_debut, date_fin, actif')
      .eq('actif', true)
      .or(`date_fin.is.null,date_fin.gte.${debut}`)
      .lte('date_debut', fin),
    lireTout<Record<string, unknown>>(() => sb.from('plat_du_jour_ingredients')
      .select('id, plat_du_jour_id, ingredient_id, quantite, unite').order('id')),
    sb.from('etablissements').select('id, nom'),
  ])

  const nomE = new Map((etabs.data ?? []).map(e => [e.id as string, e.nom as string]))
  const compo = new Map<string, Array<{ ingredient_id: string; quantite: number; unite: string }>>()
  for (const l of ri) {
    const k = l.recette_id as string
    if (!compo.has(k)) compo.set(k, [])
    compo.get(k)!.push({
      ingredient_id: l.ingredient_id as string,
      quantite: Number(l.quantite ?? 0),
      unite: (l.unite as string) ?? '',
    })
  }

  // ⚠️ Seuls les plats à COMPOSITION CHIFFRÉE sont proposés : sans fiche, on
  // ne sait pas ce qu'ils consomment, donc les cocher ne changerait rien au
  // réassort — et l'écran mentirait sur ce qu'il calcule.
  const candidats: PlatCandidat[] = rec
    .filter(r => nomE.get(r.etablissement_id as string) === 'Restauration')
    .filter(r => (compo.get(r.id as string)?.length ?? 0) > 0)
    .map(r => ({
      id: r.id as string,
      nom: r.nom as string,
      categorie: (r.categorie as string) ?? '—',
      carte: r.tag_destination === 'PIZZA' ? 'PIZZA' : 'CUISINE',
      prixTTC: r.prix_vente_ht == null ? null
        : Math.round(Number(r.prix_vente_ht) * (1 + Number(r.tva ?? 10) / 100) * 100) / 100,
      composition: compo.get(r.id as string)!,
    }))

  const matieres: MatiereVue[] = ing.map(m => ({
    id: m.id as string,
    nom: m.nom as string,
    unite: (m.unite as string) ?? '',
    prix_achat_ht: m.prix_achat_ht == null ? null : Number(m.prix_achat_ht),
    prix_estime: m.prix_estime !== false,
  }))

  const parOcc = new Map<string, Array<{ ingredient_id: string; quantite: number; unite: string }>>()
  for (const l of pdji) {
    const k = l.plat_du_jour_id as string
    if (!parOcc.has(k)) parOcc.set(k, [])
    parOcc.get(k)!.push({
      ingredient_id: l.ingredient_id as string,
      quantite: Number(l.quantite ?? 0),
      unite: (l.unite as string) ?? '',
    })
  }
  const occurrences: OccurrenceVue[] = (pdj.data ?? []).map(o => ({
    id: o.id as string,
    recette_id: o.recette_id as string,
    titre: (o.titre as string) ?? null,
    date_debut: o.date_debut as string,
    date_fin: (o.date_fin as string) ?? null,
    composition: parOcc.get(o.id as string) ?? [],
  }))

  const [platDuJour] = rec.filter(r => r.nom === 'Plat du jour')

  return (
    <ArdoiseClient
      debut={debut} fin={fin}
      candidats={candidats}
      matieres={matieres}
      occurrences={occurrences}
      platDuJourId={(platDuJour?.id as string) ?? null}
      volume={VOLUME_CASATASIA}
    />
  )
}
