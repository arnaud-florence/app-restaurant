// Comptoir générique — prise de commande au comptoir d'un point de vente.
// /comptoir/fournil · /comptoir/bar · /comptoir/snack-emporter
// Catalogue filtré sur le tag_destination du point de vente.
// L'ENCAISSEMENT FISCAL se fait sur la caisse agréée (pas dans l'app).

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getComptoir, listComptoirSlugs } from '@/lib/comptoir/config'
import ComptoirClient from '../ComptoirClient'
import { getActivation, getConfigLivraisonFournil } from '@/lib/activation/server'

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return listComptoirSlugs().map(slug => ({ slug }))
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const cfg = getComptoir(params.slug)
  return { title: cfg ? `${cfg.label} — Comptoir` : 'Comptoir' }
}

export type ProduitComptoir = {
  id: string
  nom: string
  categorie: string
  prix_unitaire_ht: number
  tva: number
  prix_ttc: number
}

export default async function ComptoirPage({ params }: { params: { slug: string } }) {
  const cfg = getComptoir(params.slug)
  if (!cfg) notFound()

  const supabase = await createClient()

  const { data } = await supabase
    .from('recettes')
    .select('id, nom, categorie, prix_vente_ht, tva')
    .eq('tag_destination', cfg.tag)
    .eq('actif', true)
    .order('categorie', { ascending: true })
    .order('nom', { ascending: true })

  const produits: ProduitComptoir[] = (data ?? []).map(r => {
    const ht = Number(r.prix_vente_ht ?? 0)
    const tva = Number(r.tva ?? (cfg.tag === 'BAR' ? 10 : 5.5))
    return {
      id: String(r.id),
      nom: String(r.nom),
      categorie: String(r.categorie ?? 'Autre'),
      prix_unitaire_ht: ht,
      tva,
      prix_ttc: Math.round(ht * (1 + tva / 100) * 100) / 100,
    }
  })

  // La saisie « à livrer » n'a de sens qu'au fournil, et seulement si le
  // module livraison est allumé. Ailleurs, le bloc n'est même pas rendu.
  const etat = await getActivation()
  const livraison = cfg.slug === 'fournil' && etat.fournil_livraison
    ? await getConfigLivraisonFournil().then(c => ({
        communes: c.communes, heureLimite: c.heureLimite, heureTournee: c.heureTournee,
      }))
    : null

  return <ComptoirClient config={cfg} produits={produits} livraison={livraison} />
}
