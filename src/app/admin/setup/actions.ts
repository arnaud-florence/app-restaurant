'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  type Etablissement, type Horaires, type Exception, type TableRow, type TVA,
  type Livraison, type Employe, type SetupData, defaultSetup, isNewId,
} from './types'

// ─── Helpers parametres ───────────────────────────────────────────────
async function setParam(cle: string, valeur: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('parametres')
    .upsert({ cle, valeur, updated_at: new Date().toISOString() }, { onConflict: 'cle' })
  if (error) throw new Error(`parametres.${cle}: ${error.message}`)
}

async function setParams(entries: Record<string, string>) {
  const supabase = await createClient()
  const rows = Object.entries(entries).map(([cle, valeur]) => ({
    cle, valeur, updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('parametres').upsert(rows, { onConflict: 'cle' })
  if (error) throw new Error(`parametres bulk: ${error.message}`)
}

// ─── Section 1 — Établissement ────────────────────────────────────────
export async function saveEtablissement(data: Etablissement) {
  await setParams({
    etablissement_nom:       data.nom,
    etablissement_adresse:   data.adresse,
    etablissement_telephone: data.telephone,
    etablissement_email:     data.email,
    etablissement_site_web:  data.site_web,
    etablissement_siret:     data.siret,
    etablissement_tva_intra: data.tva_intra,
    etablissement_logo_url:  data.logo_url,
  })
  revalidatePath('/admin/setup')
  return { ok: true as const }
}

// ─── Section 2 — Horaires + exceptions ────────────────────────────────
export async function saveHoraires(horaires: Horaires, exceptions: Exception[]) {
  await setParams({
    horaires:            JSON.stringify(horaires),
    horaires_exceptions: JSON.stringify(exceptions),
  })
  revalidatePath('/admin/setup')
  return { ok: true as const }
}

// ─── Section 3 — Zones + tables ───────────────────────────────────────
// Stratégie : on persiste la liste de zones dans parametres, puis on
// fait un diff pour tables_restaurant (insert/update/delete par UUID).
export async function saveZonesTables(zones: string[], tables: TableRow[]) {
  const supabase = await createClient()

  // Validations basiques (numero non vide, unicité)
  const numeros = new Set<string>()
  for (const t of tables) {
    const num = t.numero.trim()
    if (!num) throw new Error('Toutes les tables doivent avoir un numéro.')
    if (numeros.has(num)) throw new Error(`Deux tables portent le même numéro : "${num}".`)
    numeros.add(num)
  }

  await setParam('zones', JSON.stringify(zones))

  // Diff : récupère les ids actuellement en DB
  const { data: existantes, error: eErr } = await supabase
    .from('tables_restaurant')
    .select('id')
  if (eErr) throw new Error(`lecture tables_restaurant: ${eErr.message}`)

  const idsEnDB = new Set((existantes ?? []).map(r => r.id as string))
  const idsEnFront = new Set(tables.filter(t => !isNewId(t.id)).map(t => t.id))
  const aSupprimer = [...idsEnDB].filter(id => !idsEnFront.has(id))

  if (aSupprimer.length > 0) {
    const { error } = await supabase.from('tables_restaurant').delete().in('id', aSupprimer)
    if (error) throw new Error(`suppression tables_restaurant: ${error.message}`)
  }

  const aInserer = tables.filter(t => isNewId(t.id))
  if (aInserer.length > 0) {
    const { error } = await supabase.from('tables_restaurant').insert(
      aInserer.map(t => ({
        numero:   t.numero.trim(),
        capacite: t.capacite,
        zone:     t.zone,
      }))
    )
    if (error) throw new Error(`insertion tables_restaurant: ${error.message}`)
  }

  const aMettreAJour = tables.filter(t => !isNewId(t.id))
  for (const t of aMettreAJour) {
    const { error } = await supabase
      .from('tables_restaurant')
      .update({ numero: t.numero.trim(), capacite: t.capacite, zone: t.zone })
      .eq('id', t.id)
    if (error) throw new Error(`maj table ${t.numero}: ${error.message}`)
  }

  revalidatePath('/admin/setup')
  return { ok: true as const }
}

// ─── Section 4 — TVA ──────────────────────────────────────────────────
export async function saveTVA(tva: TVA) {
  await setParams({
    tva_sur_place: String(tva.sur_place),
    tva_emporter:  String(tva.emporter),
    tva_alcool:    String(tva.alcool),
  })
  revalidatePath('/admin/setup')
  return { ok: true as const }
}

// ─── Section 5 — Livraison ────────────────────────────────────────────
export async function saveLivraison(livraison: Livraison) {
  await setParams({
    livraison_active:      String(livraison.active),
    livraison_rayon_km:    String(livraison.rayon_km),
    livraison_minimum:     String(livraison.minimum),
    livraison_delai_min:   String(livraison.delai_min),
    livraison_frais_zones: JSON.stringify(livraison.zones),
  })
  revalidatePath('/admin/setup')
  return { ok: true as const }
}

// ─── Section 6 — Employés ─────────────────────────────────────────────
// Diff : insert / update / delete par id. Pas de création de compte
// auth pour l'instant (step ultérieur).
export async function saveEmployes(employes: Employe[]) {
  const supabase = await createClient()

  // Validations
  const emails = new Set<string>()
  for (const e of employes) {
    if (!e.prenom.trim() || !e.nom.trim()) throw new Error('Prénom et nom obligatoires pour chaque employé.')
    const email = e.email.trim().toLowerCase()
    if (email && emails.has(email)) throw new Error(`Deux employés ont le même email : "${email}".`)
    if (email) emails.add(email)
  }

  const { data: existants, error: eErr } = await supabase
    .from('employes')
    .select('id')
  if (eErr) throw new Error(`lecture employes: ${eErr.message}`)

  const idsEnDB = new Set((existants ?? []).map(r => r.id as string))
  const idsEnFront = new Set(employes.filter(e => !isNewId(e.id)).map(e => e.id))
  const aSupprimer = [...idsEnDB].filter(id => !idsEnFront.has(id))

  if (aSupprimer.length > 0) {
    const { error } = await supabase.from('employes').delete().in('id', aSupprimer)
    if (error) throw new Error(`suppression employes: ${error.message}`)
  }

  const aInserer = employes.filter(e => isNewId(e.id))
  if (aInserer.length > 0) {
    const { error } = await supabase.from('employes').insert(
      aInserer.map(e => ({
        prenom:   e.prenom.trim(),
        nom:      e.nom.trim(),
        email:    e.email.trim() || null,
        poste:    e.poste,
        actif:    true,
      }))
    )
    if (error) throw new Error(`insertion employes: ${error.message}`)
  }

  const aMettreAJour = employes.filter(e => !isNewId(e.id))
  for (const e of aMettreAJour) {
    const { error } = await supabase
      .from('employes')
      .update({
        prenom: e.prenom.trim(),
        nom:    e.nom.trim(),
        email:  e.email.trim() || null,
        poste:  e.poste,
      })
      .eq('id', e.id)
    if (error) throw new Error(`maj employe ${e.nom}: ${error.message}`)
  }

  revalidatePath('/admin/setup')
  return { ok: true as const }
}

// ─── Validation finale ────────────────────────────────────────────────
export async function finaliserSetup() {
  await setParam('setup_completed',    'true')
  await setParam('setup_completed_at', new Date().toISOString())
  revalidatePath('/admin/setup')
  return { ok: true as const }
}

// ─── Chargement initial pour pré-remplir le wizard ────────────────────
export async function loadSetupData(): Promise<SetupData> {
  const supabase = await createClient()

  const [paramsRes, tablesRes, employesRes] = await Promise.all([
    supabase.from('parametres').select('cle, valeur'),
    supabase.from('tables_restaurant').select('id, numero, capacite, zone').order('numero'),
    supabase.from('employes').select('id, prenom, nom, email, poste').eq('actif', true).order('nom'),
  ])

  const data = defaultSetup()
  const params = new Map<string, string>()
  for (const p of (paramsRes.data ?? [])) params.set(p.cle as string, (p.valeur ?? '') as string)

  // Section 1
  data.etablissement = {
    nom:       params.get('etablissement_nom')       ?? '',
    adresse:   params.get('etablissement_adresse')   ?? '',
    telephone: params.get('etablissement_telephone') ?? '',
    email:     params.get('etablissement_email')     ?? '',
    site_web:  params.get('etablissement_site_web')  ?? '',
    siret:     params.get('etablissement_siret')     ?? '',
    tva_intra: params.get('etablissement_tva_intra') ?? '',
    logo_url:  params.get('etablissement_logo_url')  ?? '',
  }

  // Section 2
  try {
    const h = params.get('horaires')
    if (h) data.horaires = { ...data.horaires, ...JSON.parse(h) }
  } catch { /* fallback default */ }
  try {
    const ex = params.get('horaires_exceptions')
    if (ex) data.exceptions = JSON.parse(ex)
  } catch { /* fallback */ }

  // Section 3
  try {
    const z = params.get('zones')
    if (z) data.zones = JSON.parse(z)
  } catch { /* fallback */ }
  data.tables = (tablesRes.data ?? []).map(t => ({
    id: t.id as string,
    numero: t.numero as string,
    capacite: Number(t.capacite ?? 2),
    zone: (t.zone as string) ?? 'Salle',
  }))

  // Section 4
  data.tva = {
    sur_place: Number(params.get('tva_sur_place') ?? 10),
    emporter:  Number(params.get('tva_emporter')  ?? 5.5),
    alcool:    Number(params.get('tva_alcool')    ?? 20),
  }

  // Section 5
  data.livraison = {
    active:    params.get('livraison_active') === 'true',
    rayon_km:  Number(params.get('livraison_rayon_km')  ?? 5),
    minimum:   Number(params.get('livraison_minimum')   ?? 15),
    delai_min: Number(params.get('livraison_delai_min') ?? 30),
    zones: (() => {
      try { return JSON.parse(params.get('livraison_frais_zones') ?? '[]') }
      catch { return [] }
    })(),
  }

  // Section 6
  data.employes = (employesRes.data ?? []).map(e => ({
    id: e.id as string,
    prenom: (e.prenom as string) ?? '',
    nom:    (e.nom as string) ?? '',
    email:  (e.email as string) ?? '',
    poste:  ((e.poste as string) ?? 'serveur') as Employe['poste'],
  }))

  data.setup_completed = params.get('setup_completed') === 'true'

  return data
}
