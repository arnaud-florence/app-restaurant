import Link from 'next/link'
import StockClient from './StockClient'
import AlertesStockCard from './AlertesStockCard'
import StockReelCard from './StockReelCard'
import { listMouvements } from './actions'
import { listIngredients } from '../ingredients/actions'
import { createClient } from '@/lib/supabase/server'
import { chargerLignesReassort } from '@/lib/reassort-donnees'
import { sansComptagePerime } from '@/lib/reassort'

export const metadata = { title: 'Stocks — Admin' }
export const dynamic = 'force-dynamic'

export default async function StockPage() {
  const [ingredients, mouvements, sb] = await Promise.all([
    listIngredients(),
    listMouvements(200),
    createClient(),
  ])
  // ⚠️⚠️ DEUX CHIFFRES POUR LE MÊME STOCK, SUR LA MÊME PAGE. Le tableau du
  // module 7 lisait `ingredients.stock_actuel` — le compteur que le projet
  // n'alimente plus depuis la 0135 — pendant que la carte du haut affichait
  // le stock calculé. Le bar sortait à 0 juste sous une carte qui annonçait
  // 801 unités livrées. Deux chiffres qui se contredisent, c'est pire qu'un
  // seul chiffre faux : on ne sait plus lequel croire, donc on ne croit
  // aucun des deux.
  //
  // On substitue donc le stock CALCULÉ (comptage + livraisons) partout où il
  // existe. `stock_actuel` reste écrit par les mouvements manuels — ce n'est
  // simplement plus lui qu'on affiche.
  const reel = sansComptagePerime(await chargerLignesReassort(sb))
  const parCle = new Map(reel.map(l => [l.cle, l]))
  const jamais: string[] = []
  const tous = ingredients.map(i => {
    const l = parCle.get(`ing:${i.id}`)
    // ⚠️ « Jamais compté » n'est pas « zéro » : personne n'a regardé. On le
    // marque au lieu d'afficher un 0 qui se lirait « il n'en reste plus ».
    if (!l || l.tenu === null) { jamais.push(i.id); return i }
    return { ...i, stock_actuel: l.tenu }
  })
  // ⚠️⚠️ ON N'AFFICHE QUE CE QU'ON A — demande du gérant, 04/10/2026 : « seul
  // le stock doit apparaître, il s'alimentera au fur et à mesure des
  // commandes ». Après l'incendie, 108 matières sont à zéro : une liste de
  // cent lignes vides fait passer pour un inventaire ce qui est une réserve
  // vide, et noie les quelques références réellement présentes.
  //
  // ⚠️ RIEN N'EST SUPPRIMÉ, c'est un filtre d'AFFICHAGE : la matière reste en
  // base, garde son fournisseur, son prix et sa cible, et réapparaît dès
  // qu'une livraison la fait entrer. Le nombre de masquées est DIT — une
  // liste qui cache sans le dire est pire qu'une liste longue.
  const inconnus = new Set(jamais)
  const ingredientsReels = tous.filter(i => Number(i.stock_actuel) > 0 || inconnus.has(i.id))
  const masques = tous.length - ingredientsReels.length
  return (
    <>
      <div className="max-w-7xl mx-auto px-4 pt-4 space-y-3">
        {/* Le stock du FOURNIL (produits finis, achat-revente) se compte sur
            /inventaire — cette page-ci est le stock INGRÉDIENTS du restaurant
            (Module 7, composition des recettes). Le gérant a cherché son
            comptage hebdo ici : ce pont est la réponse. */}
        <Link href="/inventaire"
          className="block rounded-xl border-2 border-emerald-600 bg-emerald-50 px-5 py-4 hover:bg-emerald-100 transition-colors">
          <p className="text-base font-black text-emerald-900">
            📦 Inventaire du Fournil — compter le stock de la semaine →
          </p>
          <p className="text-sm text-emerald-800 mt-0.5">
            Croissants, pains, boissons… produit par produit, avec la valeur du
            stock en euros. C&apos;est là que se fait le comptage hebdomadaire.
          </p>
          <p className="text-xs text-emerald-700/80 mt-1.5">
            La page ci-dessous est le stock <b>ingrédients</b> (farine, beurre…),
            utile au restaurant à partir d&apos;octobre.
          </p>
        </Link>
        {/* Le stock RÉEL, calculé — c'est lui qu'on vient chercher après une
            livraison. Le tableau du module 7, plus bas, lit encore
            `ingredients.stock_actuel` : un compteur que le projet n'alimente
            plus depuis la 0135. Il garde son utilité pour les MOUVEMENTS
            (entrées manuelles, pertes, inventaires ponctuels), pas pour dire
            ce qu'il y a en réserve. */}
        <StockReelCard />
        <AlertesStockCard />
      </div>
      <StockClient ingredients={ingredientsReels} mouvements={mouvements} jamaisComptes={jamais} masques={masques} />
    </>
  )
}
