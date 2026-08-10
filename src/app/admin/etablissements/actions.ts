'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { MODULE_CLES, PDV_PAR_MODULE, type ModuleCle } from '@/lib/activation/config'

const TYPES = ['restaurant', 'fournil', 'autre'] as const

const CATEGORIES = ['restauration', 'boulangerie', 'tabac_presse', 'service_tiers', 'autre'] as const
const MODES_FISCAUX = ['rattache', 'autonome'] as const

const updateSchema = z.object({
  id: z.string().uuid(),
  nom: z.string().min(1).max(120),
  type: z.enum(TYPES),
  categorie: z.enum(CATEGORIES).nullable().optional(),
  inclus_ca_principal: z.boolean(),
  mode_fiscal: z.enum(MODES_FISCAUX).nullable().optional(),
  adresse: z.string().max(300).nullable().optional(),
  telephone: z.string().max(40).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  siret: z.string().max(20).nullable().optional(),
  tva_intra: z.string().max(20).nullable().optional(),
  actif: z.boolean(),
})

export async function updateEtablissement(input: z.infer<typeof updateSchema>) {
  const d = updateSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('etablissements').update({
    nom: d.nom,
    type: d.type,
    categorie: d.categorie ?? null,
    inclus_ca_principal: d.inclus_ca_principal,
    mode_fiscal: d.mode_fiscal ?? null,
    adresse: d.adresse || null,
    telephone: d.telephone || null,
    email: d.email || null,
    siret: d.siret || null,
    tva_intra: d.tva_intra || null,
    actif: d.actif,
  }).eq('id', d.id)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/admin/etablissements')
  return { ok: true as const }
}

// ═══════════════════════════════════════════════════════════════════
// ACTIVATION PAR ACTIVITÉ (migration 0110)
// ═══════════════════════════════════════════════════════════════════
// Un module allumé/éteint change la navigation, les permissions, les
// agents et ce que le site public affiche → on revalide toute l'app.

/** Aligne `etablissements.actif` sur l'état d'un module.
 *  C'est ce qui fait que /api/public/menu masque automatiquement les
 *  produits d'un point de vente fermé, sans code supplémentaire. */
async function syncPointsDeVente(
  sb: Awaited<ReturnType<typeof createClient>>,
  cle: ModuleCle,
  actif: boolean,
) {
  const slugs = PDV_PAR_MODULE[cle]
  if (!slugs || slugs.length === 0) return
  await sb.from('etablissements').update({ actif }).in('slug', slugs)
}

function revalidateTout() {
  // 'layout' → invalide l'arbre entier : nav, écrans ops, dashboard admin.
  revalidatePath('/', 'layout')
}

const moduleSchema = z.object({
  cle: z.string().refine((c): c is ModuleCle => MODULE_CLES.includes(c as ModuleCle), {
    message: 'Clé de module inconnue',
  }),
  actif: z.boolean(),
  teaser: z.boolean().optional(),
  teaser_texte: z.string().max(200).nullable().optional(),
  date_ouverture_prevue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export async function updateModule(input: z.infer<typeof moduleSchema>) {
  const d = moduleSchema.parse(input)
  const sb = await createClient()

  const patch: Record<string, unknown> = { actif: d.actif, updated_at: new Date().toISOString() }
  if (d.teaser !== undefined) patch.teaser = d.teaser
  if (d.teaser_texte !== undefined) patch.teaser_texte = d.teaser_texte || null
  if (d.date_ouverture_prevue !== undefined) patch.date_ouverture_prevue = d.date_ouverture_prevue || null

  const { error } = await sb.from('activites_modules').update(patch).eq('cle', d.cle)
  if (error) return { ok: false as const, error: error.message }

  await syncPointsDeVente(sb, d.cle, d.actif)
  revalidateTout()
  return { ok: true as const }
}

const activiteSchema = z.object({
  activite: z.enum(['restaurant', 'fournil']),
  actif: z.boolean(),
})

/** Bascule TOUTE une activité d'un coup — le bouton « Ouvrir le restaurant »
 *  prévu pour fin octobre 2026. */
export async function basculerActivite(input: z.infer<typeof activiteSchema>) {
  const d = activiteSchema.parse(input)
  const sb = await createClient()

  const { data: modules, error: errLecture } = await sb
    .from('activites_modules')
    .select('cle')
    .eq('activite', d.activite)
  if (errLecture) return { ok: false as const, error: errLecture.message }

  const { error } = await sb
    .from('activites_modules')
    .update({ actif: d.actif, updated_at: new Date().toISOString() })
    .eq('activite', d.activite)
  if (error) return { ok: false as const, error: error.message }

  for (const m of modules ?? []) {
    await syncPointsDeVente(sb, m.cle as ModuleCle, d.actif)
  }

  revalidateTout()
  return { ok: true as const, nb: (modules ?? []).length }
}

const livraisonSchema = z.object({
  communes: z.string().min(1).max(500),
  heureLimite:  z.string().regex(/^\d{2}:\d{2}$/, 'Format attendu HH:MM'),
  heureTournee: z.string().regex(/^\d{2}:\d{2}$/, 'Format attendu HH:MM'),
  minimumTtc: z.number().min(0).max(1000),
  fraisTtc:   z.number().min(0).max(1000),
})

export async function updateLivraisonFournil(input: z.infer<typeof livraisonSchema>) {
  const d = livraisonSchema.parse(input)
  const sb = await createClient()

  const rows = [
    { cle: 'fournil_livraison_communes',      valeur: d.communes },
    { cle: 'fournil_livraison_heure_limite',  valeur: d.heureLimite },
    { cle: 'fournil_livraison_heure_tournee', valeur: d.heureTournee },
    { cle: 'fournil_livraison_minimum_ttc',   valeur: String(d.minimumTtc) },
    { cle: 'fournil_livraison_frais_ttc',     valeur: String(d.fraisTtc) },
  ]

  const { error } = await sb.from('parametres').upsert(rows, { onConflict: 'cle' })
  if (error) return { ok: false as const, error: error.message }

  revalidateTout()
  return { ok: true as const }
}

const createSchema = z.object({
  nom: z.string().min(1).max(120),
  type: z.enum(TYPES),
})

function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return base || 'etablissement'
}

export async function createEtablissement(input: z.infer<typeof createSchema>) {
  const d = createSchema.parse(input)
  const sb = await createClient()
  let slug = slugify(d.nom)
  // Unicité du slug : si déjà pris, on suffixe.
  const { data: existing } = await sb.from('etablissements').select('slug').eq('slug', slug)
  if (existing && existing.length > 0) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`

  const { error } = await sb.from('etablissements').insert({
    nom: d.nom,
    slug,
    type: d.type,
    is_principal: false,
    actif: true,
  })
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/admin/etablissements')
  return { ok: true as const }
}
