// Activation par activité — LECTURE SERVEUR.
//
// Server-side uniquement (Server Components, server actions, routes API).
// Les types et constantes client-safe sont dans `./config.ts`.
//
// Mise en cache : `cache()` de React déduplique les appels au sein d'une même
// requête. Pas de TTL cross-requêtes volontairement — un basculement depuis
// l'admin doit prendre effet immédiatement côté outil. Le site public, lui,
// encaisse son propre TTL de 60 s via `fetch({ next: { revalidate } })`.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  REPLI_FOURNIL_SEUL,
  LIVRAISON_FOURNIL_DEFAUT,
  etatDepuisModules,
  type EtatActivation,
  type ModuleActivation,
  type ModuleCle,
  type ConfigLivraisonFournil,
} from './config'

/** Toutes les lignes de `activites_modules`, triées.
 *  Renvoie [] si la table n'existe pas encore (migration 0110 non passée). */
export const getModules = cache(async (): Promise<ModuleActivation[]> => {
  try {
    const sb = await createClient()
    const { data, error } = await sb
      .from('activites_modules')
      .select('cle, activite, libelle, emoji, description, actif, teaser, teaser_texte, date_ouverture_prevue, ordre')
      .order('ordre')

    if (error) {
      console.warn('[activation] lecture activites_modules impossible →', error.message)
      return []
    }
    return (data ?? []) as ModuleActivation[]
  } catch (e) {
    console.warn('[activation] lecture activites_modules impossible →', e)
    return []
  }
})

/** État d'activation résolu. Retombe sur « Fournil seul » si la base est muette. */
export const getActivation = cache(async (): Promise<EtatActivation> => {
  const modules = await getModules()
  if (modules.length === 0) return { ...REPLI_FOURNIL_SEUL }
  return etatDepuisModules(modules)
})

/** Raccourci : un module est-il allumé ? */
export async function estActif(cle: ModuleCle): Promise<boolean> {
  const etat = await getActivation()
  return etat[cle] === true
}

/** Modules éteints qui doivent afficher un teaser sur le site public. */
export async function getTeasers(): Promise<ModuleActivation[]> {
  const modules = await getModules()
  return modules.filter(m => !m.actif && m.teaser)
}

/** Configuration de la livraison Fournil, lue depuis `parametres`. */
export const getConfigLivraisonFournil = cache(async (): Promise<ConfigLivraisonFournil> => {
  try {
    const sb = await createClient()
    const { data } = await sb
      .from('parametres')
      .select('cle, valeur')
      .in('cle', [
        'fournil_livraison_communes',
        'fournil_livraison_heure_limite',
        'fournil_livraison_heure_tournee',
        'fournil_livraison_minimum_ttc',
        'fournil_livraison_frais_ttc',
      ])

    const p = new Map((data ?? []).map(r => [r.cle as string, r.valeur as string]))
    const nombre = (cle: string, defaut: number) => {
      const n = Number(p.get(cle))
      return Number.isFinite(n) ? n : defaut
    }

    const communes = (p.get('fournil_livraison_communes') ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)

    return {
      communes: communes.length > 0 ? communes : LIVRAISON_FOURNIL_DEFAUT.communes,
      heureLimite:  p.get('fournil_livraison_heure_limite')  || LIVRAISON_FOURNIL_DEFAUT.heureLimite,
      heureTournee: p.get('fournil_livraison_heure_tournee') || LIVRAISON_FOURNIL_DEFAUT.heureTournee,
      minimumTtc:   nombre('fournil_livraison_minimum_ttc', LIVRAISON_FOURNIL_DEFAUT.minimumTtc),
      fraisTtc:     nombre('fournil_livraison_frais_ttc',   LIVRAISON_FOURNIL_DEFAUT.fraisTtc),
    }
  } catch {
    return { ...LIVRAISON_FOURNIL_DEFAUT }
  }
})
