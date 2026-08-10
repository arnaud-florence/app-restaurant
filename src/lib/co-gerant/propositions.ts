// Co-gérant « Arnaud » — couche d'accès données pour la boucle de propositions.
// Côté serveur uniquement (utilise le client Supabase serveur).

import { createClient } from '@/lib/supabase/server'
import {
  type Proposition, type PropositionStatut, type PropositionEchange,
  type ContexteResto, CONTEXTE_CLES,
} from './types'

const COLS =
  'id, domaine, type, titre, resume, details, options, action_type, action_payload, statut, urgence, source, cible_url, echanges, resultat, validee_par, validee_at, faite_at, created_at, updated_at'

/** Crée une proposition (Arnaud te soumet une idée). */
export async function creerProposition(p: {
  domaine: string
  type: Proposition['type']
  titre: string
  resume?: string | null
  details?: string | null
  options?: Proposition['options']
  action_type?: string | null
  action_payload?: unknown
  urgence?: Proposition['urgence']
  source?: string
  cible_url?: string | null
}): Promise<{ id: string }> {
  const sb = await createClient()
  const { data, error } = await sb.from('propositions').insert({
    domaine: p.domaine,
    type: p.type,
    titre: p.titre,
    resume: p.resume ?? null,
    details: p.details ?? null,
    options: p.options ?? [],
    action_type: p.action_type ?? null,
    action_payload: p.action_payload ?? null,
    urgence: p.urgence ?? 'info',
    source: p.source ?? 'co_gerant',
    cible_url: p.cible_url ?? null,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data!.id as string }
}

/** Liste les propositions, filtrable par statut / domaine. */
export async function listPropositions(opts?: {
  statut?: PropositionStatut | PropositionStatut[]
  domaine?: string
  limit?: number
}): Promise<Proposition[]> {
  const sb = await createClient()
  let q = sb.from('propositions').select(COLS).order('created_at', { ascending: false })
  if (opts?.statut) q = Array.isArray(opts.statut) ? q.in('statut', opts.statut) : q.eq('statut', opts.statut)
  if (opts?.domaine) q = q.eq('domaine', opts.domaine)
  if (opts?.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Proposition[]
}

/** Les chantiers ouverts (tout SAUF la carte) — ce qu'Arnaud propose d'initier. */
export async function listChantiers(limit = 40): Promise<Proposition[]> {
  const sb = await createClient()
  const { data, error } = await sb.from('propositions').select(COLS)
    .in('statut', ['proposee', 'en_discussion'])
    .neq('domaine', 'carte')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Proposition[]
}

export async function getProposition(id: string): Promise<Proposition | null> {
  const sb = await createClient()
  const { data, error } = await sb.from('propositions').select(COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as Proposition) ?? null
}

/** Change le statut (accepte / rejette / fait…). */
export async function changerStatut(id: string, statut: PropositionStatut, valideePar?: string): Promise<void> {
  const sb = await createClient()
  const patch: Record<string, unknown> = { statut, updated_at: new Date().toISOString() }
  if (statut === 'acceptee' || statut === 'rejetee') {
    patch.validee_par = valideePar ?? null
    patch.validee_at = new Date().toISOString()
  }
  if (statut === 'faite') patch.faite_at = new Date().toISOString()
  const { error } = await sb.from('propositions').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Ajoute un échange (le peaufinage : Arnaud ↔ gérant). */
export async function ajouterEchange(id: string, echange: Omit<PropositionEchange, 'at'>): Promise<void> {
  const sb = await createClient()
  const { data, error } = await sb.from('propositions').select('echanges').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  const echanges = ((data?.echanges as PropositionEchange[]) ?? [])
  echanges.push({ ...echange, at: new Date().toISOString() })
  const { error: e2 } = await sb.from('propositions')
    .update({ echanges, statut: 'en_discussion', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (e2) throw new Error(e2.message)
}

/** Marque une proposition comme faite + note le résultat (la mémoire). */
export async function marquerFaite(id: string, resultat?: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('propositions')
    .update({ statut: 'faite', resultat: resultat ?? null, faite_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Contexte établissement (l'ADN du resto, dans `parametres`) ──

export async function getContexteResto(): Promise<ContexteResto> {
  const sb = await createClient()
  const { data, error } = await sb.from('parametres').select('cle, valeur').in('cle', CONTEXTE_CLES as unknown as string[])
  if (error) throw new Error(error.message)
  const ctx: ContexteResto = {}
  for (const row of data ?? []) ctx[row.cle as keyof ContexteResto] = (row.valeur as string | null) ?? null
  return ctx
}

export async function setContexteParam(cle: string, valeur: string | null): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('parametres')
    .upsert({ cle, valeur, updated_at: new Date().toISOString() }, { onConflict: 'cle' })
  if (error) throw new Error(error.message)
}
