// Co-gérant « Arnaud » · audit de complétude.
// Vérifie en continu si l'app/le resto est bien rempli et cohérent, et liste
// les manques (chacun avec un CTA). Sert la jauge « ton resto est prêt à X % ».
// Côté serveur uniquement.

import { createClient } from '@/lib/supabase/server'
import { getContexteResto } from './propositions'

export type Manque = {
  id: string
  domaine: string
  label: string
  detail: string
  cta_url: string
  /** Si défini, Arnaud peut s'en occuper directement (ex: 'carte' → générer des plats). */
  auto?: 'carte'
}
export type Completude = { score: number; ok: number; total: number; manques: Manque[] }

export async function auditerCompletude(): Promise<Completude> {
  const sb = await createClient()

  const [
    nomP, ctx, recCnt, riRows, recRows, ingPrixCnt, boisCnt, fourCnt, empCnt, empSalCnt,
  ] = await Promise.all([
    sb.from('parametres').select('valeur').eq('cle', 'etablissement_nom').maybeSingle(),
    getContexteResto(),
    sb.from('recettes').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('recette_ingredients').select('recette_id'),
    sb.from('recettes').select('id').eq('actif', true),
    sb.from('ingredients').select('id', { count: 'exact', head: true }).eq('actif', true).eq('prix_achat_ht', 0),
    sb.from('boissons').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('fournisseurs').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true).or('salaire_horaire.is.null,salaire_horaire.eq.0'),
  ])

  const nbRec = recCnt.count ?? 0
  const ingSansPrix = ingPrixCnt.count ?? 0
  const nbBois = boisCnt.count ?? 0
  const nbFour = fourCnt.count ?? 0
  const nbEmp = empCnt.count ?? 0
  const empSansSal = empSalCnt.count ?? 0

  const avecIng = new Set((riRows.data ?? []).map(r => r.recette_id))
  const sansIng = (recRows.data ?? []).filter(r => !avecIng.has(r.id)).length
  const etabOk = !!(nomP.data?.valeur && String(nomP.data.valeur).trim())

  const checks: Array<{ ok: boolean } & Manque> = [
    { ok: etabOk, id: 'etab', domaine: 'Système', label: 'Infos établissement', detail: "Nom de l'établissement à renseigner", cta_url: '/admin/setup' },
    { ok: !!ctx.cg_concept, id: 'ctx', domaine: 'Pilotage', label: 'Profil resto (pour Arnaud)', detail: 'Dis à Arnaud ton concept', cta_url: '/admin/co-gerant' },
    { ok: nbRec >= 10, id: 'carte', domaine: 'Cuisine', label: 'Carte garnie (≥ 10 plats)', detail: `${nbRec} plat(s) actif(s)`, cta_url: '/admin/co-gerant', auto: 'carte' },
    { ok: sansIng === 0, id: 'fc', domaine: 'Cuisine', label: 'Food cost calculable partout', detail: `${sansIng} plat(s) sans ingrédient`, cta_url: '/admin/recettes' },
    { ok: ingSansPrix === 0, id: 'prixing', domaine: 'Stock', label: 'Ingrédients avec prix', detail: `${ingSansPrix} ingrédient(s) sans prix`, cta_url: '/admin/ingredients' },
    { ok: nbBois >= 5, id: 'bois', domaine: 'Cuisine', label: 'Carte des boissons', detail: `${nbBois} boisson(s)`, cta_url: '/admin/boissons' },
    { ok: nbFour >= 1, id: 'four', domaine: 'Stock', label: 'Au moins un fournisseur', detail: `${nbFour} fournisseur(s)`, cta_url: '/admin/fournisseurs' },
    { ok: nbEmp >= 1, id: 'equipe', domaine: 'Équipe', label: 'Équipe renseignée', detail: `${nbEmp} employé(s)`, cta_url: '/admin/rh' },
    { ok: empSansSal === 0, id: 'sal', domaine: 'Équipe', label: 'Salaires renseignés', detail: `${empSansSal} sans salaire`, cta_url: '/admin/rh' },
  ]

  const total = checks.length
  const ok = checks.filter(c => c.ok).length
  const manques: Manque[] = checks
    .filter(c => !c.ok)
    .map(c => ({ id: c.id, domaine: c.domaine, label: c.label, detail: c.detail, cta_url: c.cta_url, auto: c.auto }))
  return { score: Math.round((ok / total) * 100), ok, total, manques }
}
