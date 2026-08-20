// Avertissement affiché sur les écrans que l'encaissement externe rend aveugles.
//
// Règle : ne jamais laisser un écran afficher un chiffre qu'il ne sait pas
// calculer. Un zéro se lit « on n'a rien vendu », un feu vert se lit « le stock
// va bien » — alors que la vraie réponse est « je ne sais pas ». Ce bandeau dit
// laquelle des deux on regarde.

import type { EtatEncaissement } from '@/lib/encaissement'

export default function BandeauCaisseExterne({
  etat,
  quoi,
}: {
  etat: EtatEncaissement
  /** Ce que cet écran ne peut pas savoir, formulé en clair. */
  quoi: string
}) {
  if (!etat.venteSansDetail) return null

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 mb-5">
      <p className="font-bold text-amber-900">⚠️ Données partielles</p>
      <p className="text-sm text-amber-800 mt-1 leading-relaxed">
        Les ventes encaissées sur <strong>{etat.nomCaisse}</strong> arrivent dans l’outil sous
        forme de montants, sans le détail des produits. {quoi}
      </p>
      <p className="text-xs text-amber-700 mt-2">
        {etat.detailProduits === 'attente'
          ? 'Se règle en branchant l’export ' + etat.nomCaisse + ' : les quantités par produit remonteront alors automatiquement.'
          : 'Cette caisse ne fournit pas le détail par produit — ces chiffres resteront incomplets.'}
      </p>
    </div>
  )
}
