// Qui encaisse, et ce que l'outil sait des ventes qui en découlent.
//
// Au Fournil, SumUp encaisse. L'app ne reçoit alors qu'un montant et une
// heure : tout ce qui dérive du détail par produit (stock déduit à la vente,
// food cost réel, menu engineering) est aveugle tant que l'export SumUp n'est
// pas branché.
//
// Ce module existe pour que les écrans concernés le DISENT, au lieu d'afficher
// des zéros ou un « stock OK » qui se lisent comme une information.

import { createClient } from '@/lib/supabase/server'

export type ModeEncaissement = 'externe' | 'app'
export type DetailProduits = 'attente' | 'oui' | 'non'

export type EtatEncaissement = {
  mode: ModeEncaissement
  /** Nom affichable de la caisse agréée, quand mode = 'externe'. */
  nomCaisse: string
  /** L'outil reçoit-il le détail par produit des ventes encaissées dehors ? */
  detailProduits: DetailProduits
  /** Vrai quand le CA existe mais sans lignes : stock et marges sont aveugles. */
  venteSansDetail: boolean
}

/** Repli : l'app encaisse. C'est le comportement historique, et il n'affiche
 *  aucun avertissement — mieux vaut taire un avertissement que d'en inventer un
 *  si la table `parametres` est injoignable. */
const REPLI: EtatEncaissement = {
  mode: 'app',
  nomCaisse: '',
  detailProduits: 'oui',
  venteSansDetail: false,
}

export async function getEtatEncaissement(): Promise<EtatEncaissement> {
  try {
    const sb = await createClient()
    const { data } = await sb
      .from('parametres')
      .select('cle, valeur')
      .in('cle', ['caisse_encaissement', 'caisse_externe_nom', 'caisse_externe_detail_produits'])

    const p = new Map((data ?? []).map(r => [String(r.cle), String(r.valeur ?? '')]))
    const mode = (p.get('caisse_encaissement') === 'externe' ? 'externe' : 'app') as ModeEncaissement
    const detailProduits = (['attente', 'oui', 'non'].includes(p.get('caisse_externe_detail_produits') ?? '')
      ? p.get('caisse_externe_detail_produits')
      : 'oui') as DetailProduits

    return {
      mode,
      nomCaisse: p.get('caisse_externe_nom') || 'la caisse agréée',
      detailProduits,
      venteSansDetail: mode === 'externe' && detailProduits !== 'oui',
    }
  } catch {
    return REPLI
  }
}
