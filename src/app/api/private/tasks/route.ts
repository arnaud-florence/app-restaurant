// POST /api/private/tasks
// Endpoint REST classique pour cocher / décocher / saisir une tâche.
//
// Pourquoi un endpoint REST plutôt qu'une server action ?
// Les server actions de Next.js déclenchent un re-render RSC automatique côté
// serveur après chaque appel. Dans certains cas, ce re-render fait crash un
// Server Component dans l'arbre courant (force-dynamic + tâches complétées).
// Le fetch HTTP classique bypasse ce mécanisme : on garde la pure mutation DB
// + optimistic update côté client, sans toucher au cache RSC.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const payloadSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cocher'),
    employe_id:  z.string().uuid(),
    tache_id:    z.string().min(1).max(80),
    poste:       z.string().min(1).max(50),
    moment:      z.enum(['matin', 'service', 'fin']),
    obligatoire: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('decocher'),
    employe_id: z.string().uuid(),
    tache_id:   z.string().min(1).max(80),
  }),
  z.object({
    action: z.literal('saisir'),
    employe_id:   z.string().uuid(),
    tache_id:     z.string().min(1).max(80),
    poste:        z.string().min(1).max(50),
    moment:       z.enum(['matin', 'service', 'fin']),
    type_saisie:  z.enum(['temperature', 'montant', 'nombre', 'texte']),
    valeur_num:   z.number().nullable().optional(),
    valeur_texte: z.string().max(500).nullable().optional(),
    unite:        z.string().max(20).nullable().optional(),
    commentaire:  z.string().max(500).nullable().optional(),
  }),
])

export async function POST(req: Request) {
  let body
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Payload invalide', details: parsed.error.format() }, { status: 400 })
  }
  const p = parsed.data

  // Autorisation : un employé non-manager ne peut agir QUE pour son propre profil
  const profil = await getProfile()
  if (profil && profil.role !== 'manager' && profil.employe_id !== p.employe_id) {
    return Response.json({ error: 'Action refusée pour un autre profil' }, { status: 403 })
  }

  // createAdminClient (service role) — bypass RLS sur `taches_completees`
  // et `valeurs_saisies_taches`. La sécurité est applicative : autorisation
  // déjà vérifiée plus haut (profil.employe_id === p.employe_id ou manager).
  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  try {
    if (p.action === 'cocher') {
      const { error } = await supabase.from('taches_completees').upsert({
        employe_id:  p.employe_id,
        tache_id:    p.tache_id,
        poste:       p.poste,
        moment:      p.moment,
        obligatoire: p.obligatoire ?? false,
        date:        today,
      }, { onConflict: 'employe_id,tache_id,date' })
      if (error) {
        console.error('[tasks/cocher] DB error:', error, p)
        return Response.json({ error: `DB : ${error.message}` }, { status: 500 })
      }
    } else if (p.action === 'decocher') {
      const { error } = await supabase.from('taches_completees').delete()
        .eq('employe_id', p.employe_id)
        .eq('tache_id', p.tache_id)
        .eq('date', today)
      if (error) {
        console.error('[tasks/decocher] DB error:', error, p)
        return Response.json({ error: `DB : ${error.message}` }, { status: 500 })
      }
    } else if (p.action === 'saisir') {
      const { error } = await supabase.from('valeurs_saisies_taches').insert({
        tache_id:     p.tache_id,
        employe_id:   p.employe_id,
        poste:        p.poste,
        moment:       p.moment,
        type_saisie:  p.type_saisie,
        valeur_num:   p.valeur_num ?? null,
        valeur_texte: p.valeur_texte ?? null,
        unite:        p.unite ?? null,
        commentaire:  p.commentaire ?? null,
      })
      if (error) {
        console.error('[tasks/saisir] DB error:', error, p)
        return Response.json({ error: `DB : ${error.message}` }, { status: 500 })
      }
    }
    // Invalide le cache des pages qui affichent les compteurs de tâches
    // (sans toucher /admin/pilotage ou /admin/hygiene qui ont causé un crash auparavant).
    try { revalidatePath('/mon-espace') } catch { /* ignore */ }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('[tasks] unexpected error:', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
