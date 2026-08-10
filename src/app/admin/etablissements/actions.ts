'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
