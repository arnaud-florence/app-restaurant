# Données externes / imports fournisseurs

## Workflow Carigel

1. **Demande de devis envoyée** : `docs/demande-devis-carigel.md`
   - 146 références listées dans `data/devis-carigel.csv` (colonne `prix_ht_eur` vide)

2. **Réception du devis Carigel** :
   - Ouvre `data/devis-carigel.csv` dans Excel ou LibreOffice
   - Pour chaque ligne, remplis la colonne **`prix_ht_eur`** avec le tarif HT du devis
   - Mets aussi à jour `marque_souhaitee` et `code_fournisseur` si Carigel les a précisés
   - Enregistre en CSV (UTF-8, séparateur virgule)

3. **Import en base** :
   ```sh
   node scripts/import-carigel.mjs            # dry-run, montre ce qui va se passer
   node scripts/import-carigel.mjs --apply    # exécute réellement
   ```
   - Crée le fournisseur "Carigel" dans `fournisseurs` (avec adresse + email)
   - Pour chaque produit avec prix > 0 :
     - Si nom matche un ingrédient existant → met à jour `prix_achat_ht` + `fournisseur_principal`
     - Sinon → crée un nouvel ingrédient avec catégorie, unité, allergènes, DLC

4. **Vérification dans le logiciel** :
   - `/admin/fournisseurs` → tu vois Carigel dans la liste
   - `/admin/ingredients` → tu vois tous les nouveaux produits + prix à jour

## Notes

- Le matching par nom est **insensible à la casse** mais doit être exact (espaces, accents, etc.)
- Les lignes sans prix sont **skippées silencieusement** (utile pour tester progressivement)
- Si tu veux régénérer un ingrédient existant : passe son nom en CSV avec le nouveau prix → ça fait un UPDATE
- Le script utilise `SUPABASE_SERVICE_ROLE_KEY` si dispo (fallback ANON_KEY car RLS désactivée)

## Schémas concernés

- `fournisseurs(id, nom, contact, telephone, email, adresse, conditions_tarifaires, ...)`
- `ingredients(id, nom, categorie, unite, prix_achat_ht, fournisseur_principal, stock_actuel, stock_minimum, allergenes[], dlc_moyenne_jours, ...)`

## Pour d'autres fournisseurs

Pattern réutilisable :
1. Document `docs/demande-devis-<fournisseur>.md`
2. CSV `data/devis-<fournisseur>.csv`
3. Script `scripts/import-<fournisseur>.mjs` adapté du modèle Carigel
