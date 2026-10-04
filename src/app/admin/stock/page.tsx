import StockClient from './StockClient'
import StockReelCard from './StockReelCard'
import { listMouvements } from './actions'
import { listIngredients } from '../ingredients/actions'
import { createClient } from '@/lib/supabase/server'
import { chargerLignesReassort } from '@/lib/reassort-donnees'
import { sansComptagePerime } from '@/lib/reassort'
import type { ProduitEnStock } from './types'

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
  // ⚠️⚠️ LE STOCK NE VIT PAS QUE DANS `ingredients` — ET CET ÉCRAN N'EN
  // MONTRAIT QUE 9 SUR 45. Signalé par le gérant le 04/10/2026 : « j'ai que
  // 9 ingrédients en stock ». C'était exact, et c'était le défaut : les
  // 36 autres références de la réserve — les bouteilles, les fûts et les
  // canettes du bar — vivent dans `recettes`, parce que la maison est en
  // ACHAT-REVENTE (0126). Le tableau du module 7 a été bâti pour un
  // restaurant qui transforme des ingrédients ; ici l'essentiel se revend
  // tel quel, donc la page était structurellement aveugle aux quatre
  // cinquièmes du stock.
  //
  // Les deux viennent de la MÊME construction (`chargerLignesReassort`), donc
  // il n'y a pas deux calculs qui pourraient diverger — seulement deux tables
  // d'origine.
  //
  // ⚠️ UN PRODUIT EST EN LECTURE SEULE ICI. Les trois gestes du module 7
  // (livraison, perte, −1) écrivent dans `mouvements_stock.ingredient_id` :
  // ils ne peuvent pas viser un produit vendu. Afficher les boutons mènerait
  // à un message d'erreur ; la ligne renvoie donc là où ce produit se compte
  // vraiment, `(ops)/inventaire`.
  const produits: ProduitEnStock[] = reel
    .filter(l => !l.cle.startsWith('ing:') && l.tenu !== null && l.tenu > 0)
    .map(l => ({
      id: l.cle,
      nom: l.nom,
      categorie: l.categorie ?? 'Produit revendu',
      unite: l.unite ?? 'pièce',
      prix_achat_ht: l.cout_unitaire_ht ?? 0,
      fournisseur_principal: l.fournisseur ?? null,
      fournisseur_secondaire: null,
      stock_actuel: l.tenu as number,
      stock_minimum: l.seuil ?? 0,
      stock_maximum: l.cible ?? 0,
      dlc_moyenne_jours: 0,
      allergenes: [],
      actif: true,
      created_at: '',
      updated_at: '',
      produit: true as const,
      poste: l.etablissement === 'Bar' ? 'bar' : 'fournil',
    }))
  const inconnus = new Set(jamais)
  const horsSuivi = tous.filter(i => !suivies.has(i.id)).length
  const ingredientsReels = tous.filter(
    i => suivies.has(i.id) && (Number(i.stock_actuel) > 0 || inconnus.has(i.id)),
  )
  // ⚠️ Les produits revendus à zéro sont comptés dans les masqués eux aussi :
  // sans ça le bandeau annoncerait « 101 matières » alors qu'il cache aussi
  // une centaine de produits, et un écran qui cache sans le dire est pire
  // qu'un écran long.
  const produitsAZero = reel.filter(
    l => !l.cle.startsWith('ing:') && (l.tenu === null || l.tenu <= 0),
  ).length
  const masques = tous.length - ingredientsReels.length - horsSuivi + produitsAZero
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
      <StockClient ingredients={ingredientsReels} produits={produits} mouvements={mouvements} jamaisComptes={jamais} masques={masques} horsSuivi={horsSuivi} />
    </>
  )
}
