import StockClient from './StockClient'
import { listMouvements } from './actions'
import { listIngredients } from '../ingredients/actions'
import { createClient } from '@/lib/supabase/server'
import { chargerLignesReassort } from '@/lib/reassort-donnees'
import { sansComptagePerime } from '@/lib/reassort'
import type { ProduitEnStock, Origine } from './types'

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
  // D'où vient chaque chiffre : le comptage, les entrées depuis, et la date.
  const origines: Record<string, Origine> = {}
  for (const l of reel) {
    const id = l.cle.startsWith('ing:') ? l.cle.slice(4) : l.cle
    origines[id] = {
      compte: l.compte, entrees: l.entrees, compte_le: l.compte_le,
      // ⚠️ `ingredients` n'a pas de colonne d'activité : une matière n'a donc
      // pas d'établissement. Son poste se lit sur sa catégorie, comme le fait
      // déjà `(ops)/inventaire`.
      poste: l.etablissement ?? (l.categorie === 'Bar' ? 'Bar' : 'Matières premières'),
    }
  }
  // ⚠️ Les dates de comptage par poste, et la règle des 30 jours : un stock
  // calculé sur un comptage périmé est un chiffre auquel personne ne doit
  // croire (0163). La carte retirée le 04/10/2026 les portait ; sans elles,
  // l'écran afficherait un stock sans dire sur quoi il repose.
  const comptages: Array<{ poste: string; le: string }> = []
  const parPoste = new Map<string, string>()
  for (const l of reel) {
    if (!l.compte_le) continue
    const k = l.etablissement ?? 'Matières premières'
    const d = parPoste.get(k)
    if (!d || l.compte_le > d) parPoste.set(k, l.compte_le)
  }
  for (const [poste, le] of parPoste) comptages.push({ poste, le })
  comptages.sort((a, b) => a.poste.localeCompare(b.poste, 'fr'))
  const sansPrix = reel.filter(l => l.tenu !== null && l.tenu > 0 && l.cout_unitaire_ht == null).length
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
  // ⚠️⚠️ DEUX CARTES ONT ÉTÉ RETIRÉES DU HAUT DE CETTE PAGE le 04/10/2026,
  // et les deux pour la même raison de fond : elles s'interposaient entre le
  // gérant et son stock.
  //
  // `StockReelCard` listait les 45 références par poste au-dessus d'un
  // tableau qui, depuis ce même jour, les liste TOUTES — deux fois la même
  // liste, précédées d'un paragraphe d'explications. Demande du gérant :
  // « quand je rentre sur la page stock je veux voir mon stock direct ».
  // ⚠️ Ce qu'elle portait EN PLUS n'est pas perdu, et c'eût été le vrai
  // défaut : la décomposition « comptage + livraisons » est passée sur chaque
  // ligne, les dates de comptage par poste en UNE ligne au-dessus du tableau,
  // et le nombre de références sans prix à côté de la valeur.
  //
  // `AlertesStockCard` annonçait « 115 ingrédients sous seuil minimum » et
  // proposait de créer les bons en un clic. Elle lisait `stock_actuel`, le
  // compteur abandonné depuis la 0135 — après l'incendie il vaut zéro
  // partout, donc les 115 « alertes » n'étaient que le catalogue entier, à
  // commander pour 0,00 €. Elle prenait aussi `fournisseur_principal`, un
  // champ de TEXTE LIBRE, pour un destinataire de commande (« ESTIMATION
  // 21/09/2026 », « Metro France »). Ce qu'il faut commander se lit sur
  // `/admin/reassort`, qui part des COMPTAGES.
  //
  // Les deux composants restent dans le dépôt, montés nulle part.
  return (
    <>
      <StockClient
        ingredients={ingredientsReels}
        produits={produits}
        origines={origines}
        comptages={comptages}
        sansPrix={sansPrix}
        mouvements={mouvements}
        jamaisComptes={jamais}
        masques={masques}
        horsSuivi={horsSuivi}
      />
    </>
  )
}
