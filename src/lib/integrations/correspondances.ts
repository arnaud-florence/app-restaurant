// Correspondance catalogue caisse ↔ outil (migration 0137).
//
// Le rattachement d'un ticket à un produit se faisait par le LIBELLÉ. Ça tient
// tant que personne ne renomme rien : le jour où « Croissant » devient
// « Croissant beurre » côté caisse, l'outil crée un second produit et coupe la
// série statistique en deux, sans erreur et sans alerte.
//
// L'identifiant de la caisse, lui, survit au renommage. C'est donc lui qui
// fait foi dès qu'il existe ; le libellé n'est plus qu'une aide au diagnostic.
//
// Server-only (accès base).

import { createClient } from '@/lib/supabase/server'

/** Index des correspondances d'un système : identifiant externe → recette. */
export async function chargerCorrespondances(
  systeme: string,
): Promise<Map<string, string>> {
  const sb = await createClient()
  const { data } = await sb
    .from('correspondances_catalogue')
    .select('identifiant_externe, recette_id')
    .eq('systeme', systeme)
  const m = new Map<string, string>()
  for (const c of data ?? []) m.set(String(c.identifiant_externe), String(c.recette_id))
  return m
}

/**
 * Enregistre (ou rafraîchit) le lien entre un produit de caisse et une fiche.
 *
 * Appelée à chaque rattachement réussi, y compris quand il s'est fait par le
 * nom : c'est ainsi que la correspondance se constitue toute seule, et que le
 * rattachement suivant n'aura plus besoin du libellé.
 *
 * Ne lève jamais — une correspondance manquée dégrade le diagnostic, elle ne
 * doit pas faire échouer un import de ventes.
 */
export async function noterCorrespondance(p: {
  systeme: string
  identifiant_externe: string
  recette_id: string
  libelle_externe?: string | null
}): Promise<void> {
  try {
    const sb = await createClient()
    await sb.from('correspondances_catalogue').upsert({
      systeme: p.systeme,
      identifiant_externe: p.identifiant_externe,
      recette_id: p.recette_id,
      libelle_externe: p.libelle_externe ?? null,
      vu_le: new Date().toISOString(),
    }, { onConflict: 'systeme,identifiant_externe' })
  } catch (e) {
    console.error('[correspondances] écriture impossible', e)
  }
}
