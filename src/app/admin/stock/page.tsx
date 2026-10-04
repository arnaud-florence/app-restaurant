import StockClient from './StockClient'
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
  // ⚠️⚠️ UNE MATIÈRE QUE PERSONNE NE COMPTE N'A RIEN À AFFICHER ICI.
  // `ingredients.stocke` (0133) marque les matières réellement suivies à
  // l'inventaire. Les autres — les six rescapées du jeu de démonstration
  // (miel, pommes, sel fin, poivre, saumon fumé) et les ingrédients de
  // fiches techniques jamais achetés (baguette sandwich, huile de friture) —
  // ne figurent dans AUCUN inventaire : rien ne peut leur donner un stock,
  // donc elles s'affichaient éternellement « — jamais compté », sur l'écran
  // qui est censé dire ce qu'on a en réserve.
  //
  // ⚠️ La distinction « jamais compté » ≠ « zéro » (0163) n'est PAS abandonnée :
  // elle vaut pour une matière SUIVIE que personne n'a encore comptée, et
  // cette mention reste. Ce qui disparaît, c'est la matière qu'aucun
  // inventaire ne regarde — là il n'y a pas d'information manquante, il n'y a
  // rien à mesurer.
  const suivies = new Set(
    ((await sb.from('ingredients').select('id').eq('stocke', true)).data ?? []).map(r => r.id as string),
  )
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
  const horsSuivi = tous.filter(i => !suivies.has(i.id)).length
  const ingredientsReels = tous.filter(
    i => suivies.has(i.id) && (Number(i.stock_actuel) > 0 || inconnus.has(i.id)),
  )
  const masques = tous.length - ingredientsReels.length - horsSuivi
  return (
    <>
      <div className="max-w-7xl mx-auto px-4 pt-4 space-y-3">
        {/* ⚠️⚠️ `AlertesStockCard` A ÉTÉ RETIRÉE D'ICI — 04/10/2026.
            Elle affichait « 115 ingrédients sous seuil minimum » et proposait
            de créer les bons de commande en un clic. Trois raisons, et
            chacune suffirait :

            1. ELLE LISAIT `ingredients.stock_actuel`, le compteur que le
               projet n'alimente plus depuis la 0135. Après l'incendie il vaut
               zéro partout : les 115 « alertes » n'étaient que le catalogue
               entier, et les quantités à commander sortaient à 0,00 kg pour
               0,00 € — un écran qui crie sur tout ne protège de rien.
            2. ELLE CRÉAIT DES BONS DE COMMANDE, ce que le gérant vient
               d'interdire deux fois. L'agent a été coupé le même jour ; laisser
               le bouton l'aurait contredit.
            3. ELLE PRENAIT `fournisseur_principal` POUR UN FOURNISSEUR. C'est
               un champ de TEXTE LIBRE : il affichait « ESTIMATION 21/09/2026 —
               à remplacer par la première facture » et « Metro France » (du jeu
               de démonstration purgé en septembre) comme des destinataires de
               commande. Et il annonçait 191,43 € de poivre et 210,04 € de
               saumon sur des stocks nuls.

            Ce qu'il faut commander se lit sur `/admin/reassort`, qui part des
            COMPTAGES et non d'un compteur mort. Le composant reste dans le
            dépôt : il n'est plus monté nulle part. */}
        <StockReelCard />
      </div>
      <StockClient ingredients={ingredientsReels} mouvements={mouvements} jamaisComptes={jamais} masques={masques} horsSuivi={horsSuivi} />
    </>
  )
}
