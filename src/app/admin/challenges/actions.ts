'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { suggererCible } from '@/lib/challenges-cibles'
import type { Metrique } from '@/lib/challenges-metrics'

const challengeSchema = z.object({
  id:                  z.string().uuid().optional().nullable(),
  titre:               z.string().min(2).max(200),
  description:         z.string().max(1000).optional().nullable(),
  type:                z.enum(['individuel', 'equipe', 'restaurant']),
  poste_concerne:      z.string().max(50).optional().nullable(),
  metrique:            z.string(),
  cible_operateur:     z.enum(['>=', '<=', '=']),
  cible_valeur:        z.number(),
  cible_unite:         z.string().max(20),
  recompense_type:     z.enum(['fixe', 'pct_surplus']),
  recompense_montant:  z.number(),
  periode:             z.enum(['jour', 'semaine', 'mois']),
  date_debut:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  leaderboard_public:  z.boolean(),
  actif:               z.boolean(),
})

export async function upsertChallenge(input: unknown) {
  await requireManager()
  const p = challengeSchema.parse(input)
  const supabase = await createClient()
  const { id, ...data } = p
  const payload = {
    titre:               data.titre,
    description:         data.description ?? null,
    type:                data.type,
    poste_concerne:      data.poste_concerne ?? null,
    metrique:            data.metrique,
    cible_operateur:     data.cible_operateur,
    cible_valeur:        data.cible_valeur,
    cible_unite:         data.cible_unite,
    recompense_type:     data.recompense_type,
    recompense_montant:  data.recompense_montant,
    periode:             data.periode,
    date_debut:          data.date_debut,
    date_fin:            data.date_fin ?? null,
    leaderboard_public:  data.leaderboard_public,
    actif:               data.actif,
  }
  if (id) {
    const { error } = await supabase.from('challenges').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('challenges').insert(payload)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/challenges')
  revalidatePath('/mon-espace')
  return { ok: true as const }
}

export async function toggleActifChallenge(input: { id: string; actif: boolean }) {
  await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('challenges').update({ actif: input.actif }).eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/challenges')
  revalidatePath('/mon-espace')
  return { ok: true as const }
}

export async function supprimerChallenge(input: { id: string }) {
  await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('challenges').delete().eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/challenges')
  return { ok: true as const }
}

// ─── Pack démarrage : crée 8 challenges types en 1-click ────────
type Template = {
  titre: string
  description: string
  type: 'individuel' | 'equipe' | 'restaurant'
  poste_concerne: string | null
  metrique: Metrique
  cible_operateur: '>=' | '<=' | '='
  recompense_type: 'fixe' | 'pct_surplus'
  recompense_montant: number
  periode: 'jour' | 'semaine' | 'mois'
  leaderboard_public: boolean
}

const TEMPLATES_PACK: Template[] = [
  // ─── Individuels ────────────────────────────────────────
  {
    titre: 'CA personnel serveur — mensuel',
    description: 'Atteindre un objectif de chiffre d\'affaires mensuel personnel.',
    type: 'individuel', poste_concerne: 'serveur',
    metrique: 'ca_personnel_serveur', cible_operateur: '>=',
    recompense_type: 'fixe', recompense_montant: 80,
    periode: 'mois', leaderboard_public: true,
  },
  {
    titre: 'Tables servies — mensuel',
    description: 'Cumul de tables servies sur le mois (volume).',
    type: 'individuel', poste_concerne: 'serveur',
    metrique: 'tables_servies_personnelles', cible_operateur: '>=',
    recompense_type: 'fixe', recompense_montant: 40,
    periode: 'mois', leaderboard_public: true,
  },
  {
    titre: 'Pourboires perçus — mensuel',
    description: 'Indicateur qualité de service perçue par le client.',
    type: 'individuel', poste_concerne: 'serveur',
    metrique: 'pourboires_personnels', cible_operateur: '>=',
    recompense_type: 'fixe', recompense_montant: 30,
    periode: 'mois', leaderboard_public: false,
  },

  // ─── Équipe ──────────────────────────────────────────────
  {
    titre: 'Zéro NC critique — mensuel',
    description: 'Aucune non-conformité critique sur le mois entier.',
    type: 'equipe', poste_concerne: 'cuisine',
    metrique: 'nc_critiques_count', cible_operateur: '<=',
    recompense_type: 'fixe', recompense_montant: 30,
    periode: 'mois', leaderboard_public: false,
  },
  {
    titre: 'Plats cuisine — mensuel',
    description: 'Volume de plats préparés en cuisine sur le mois.',
    type: 'equipe', poste_concerne: 'cuisine',
    metrique: 'plats_prepares_equipe_cuisine', cible_operateur: '>=',
    recompense_type: 'fixe', recompense_montant: 25,
    periode: 'mois', leaderboard_public: false,
  },
  {
    titre: 'Pizzas servies — mensuel',
    description: 'Volume de pizzas préparées sur le mois.',
    type: 'equipe', poste_concerne: 'pizzaiolo',
    metrique: 'plats_prepares_equipe_pizza', cible_operateur: '>=',
    recompense_type: 'fixe', recompense_montant: 25,
    periode: 'mois', leaderboard_public: false,
  },
  {
    titre: 'Taux no-show < 5% — mensuel',
    description: 'Réservations honorées (suivi clients + relances efficaces).',
    type: 'equipe', poste_concerne: 'receptionniste',
    metrique: 'no_shows_pct', cible_operateur: '<=',
    recompense_type: 'fixe', recompense_montant: 50,
    periode: 'mois', leaderboard_public: false,
  },

  // ─── Tous postes ─────────────────────────────────────────
  {
    titre: 'Discipline tâches obligatoires',
    description: 'Cocher les tâches obligatoires de ton poste chaque jour.',
    type: 'individuel', poste_concerne: null,
    metrique: 'taches_obligatoires_pct', cible_operateur: '>=',
    recompense_type: 'fixe', recompense_montant: 20,
    periode: 'mois', leaderboard_public: false,
  },
]

export async function creerPackDemarrage(): Promise<{ ok: true; nb_crees: number; nb_skipped: number; details: string[] }> {
  await requireManager()
  const supabase = await createClient()

  let nb_crees = 0
  let nb_skipped = 0
  const details: string[] = []

  for (const t of TEMPLATES_PACK) {
    // Skip s'il existe déjà un challenge actif avec même métrique + poste + type
    const q = supabase.from('challenges')
      .select('id', { count: 'exact', head: true })
      .eq('metrique', t.metrique)
      .eq('type', t.type)
      .eq('actif', true)
    const { count } = t.poste_concerne
      ? await q.eq('poste_concerne', t.poste_concerne)
      : await q.is('poste_concerne', null)
    if ((count ?? 0) > 0) {
      nb_skipped++
      details.push(`⏭ ${t.titre} (déjà actif)`)
      continue
    }

    // Suggère une cible adaptée aux données réelles
    let cibleValeur = 0
    let cibleUnite  = '€'
    try {
      const sugg = await suggererCible(t.metrique)
      cibleValeur = sugg.valeur
      cibleUnite  = sugg.unite
    } catch {
      // Fallback : utilise des valeurs sûres
      cibleValeur = t.cible_operateur === '<=' ? 5 : 100
      cibleUnite  = t.metrique.includes('pct') ? '%' : '€'
    }

    const { error } = await supabase.from('challenges').insert({
      titre:                t.titre,
      description:          t.description,
      type:                 t.type,
      poste_concerne:       t.poste_concerne,
      metrique:             t.metrique,
      cible_operateur:      t.cible_operateur,
      cible_valeur:         cibleValeur,
      cible_unite:          cibleUnite,
      recompense_type:      t.recompense_type,
      recompense_montant:   t.recompense_montant,
      periode:              t.periode,
      date_debut:           new Date().toISOString().slice(0, 10),
      leaderboard_public:   t.leaderboard_public,
      actif:                true,
    })
    if (error) {
      details.push(`❌ ${t.titre} : ${error.message}`)
    } else {
      nb_crees++
      details.push(`✓ ${t.titre} — cible ${t.cible_operateur} ${cibleValeur} ${cibleUnite} → +${t.recompense_montant} €`)
    }
  }

  revalidatePath('/admin/challenges')
  revalidatePath('/mon-espace')
  return { ok: true as const, nb_crees, nb_skipped, details }
}
