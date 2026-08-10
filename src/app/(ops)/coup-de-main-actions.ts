'use server'

// « Le coup de main d'Arnaud » — nudges live sur l'écran de poste, calculés
// en direct depuis les commandes en cours (mêmes seuils que les agents RT).
// Lecture seule, non sensible (aucun prix). Accessible sans login (mode kiosk).

import { createClient } from '@/lib/supabase/server'

export type CoupDeMain = { id: string; emoji: string; texte: string; urgence: 'rouge' | 'orange' | 'info' }

type ArtRow = { id: string; tag_destination: string | null; statut: string | null; allergenes_a_eviter: string[] | null }
type CmdRow = { id: string; numero_table: string | null; statut: string; source: string | null; created_at: string; commande_articles: ArtRow[] | null }

export async function coupDeMainPoste(poste: string): Promise<CoupDeMain[]> {
  const sb = await createClient()
  const now = Date.now()
  const ageMin = (iso: string) => (now - new Date(iso).getTime()) / 60000
  const out: CoupDeMain[] = []

  const { data } = await sb.from('commandes')
    .select('id, numero_table, statut, source, created_at, commande_articles(id, tag_destination, statut, allergenes_a_eviter)')
    .not('statut', 'in', '(encaisse,annule)')
    .order('created_at', { ascending: true })
    .limit(200)
  const cmds = (data ?? []) as unknown as CmdRow[]

  // ── Cuisine / Pizza ──────────────────────────────────────────────
  if (poste === 'cuisine' || poste === 'pizza') {
    const tags = poste === 'pizza' ? ['PIZZA'] : ['CUISINE', 'PIZZA']
    let enRetard = 0
    for (const c of cmds) {
      if (ageMin(c.created_at) <= 20) continue
      const arts = (c.commande_articles ?? []).filter(a => tags.includes(String(a.tag_destination)) && (a.statut === 'en_preparation' || a.statut === 'en_attente'))
      if (arts.length) enRetard += 1
    }
    if (enRetard) out.push({ id: 'cuis-retard', emoji: '🔥', texte: `${enRetard} commande(s) en cuisine depuis +20 min — passe-les en priorité.`, urgence: 'rouge' })

    const allerg = new Set<string>()
    const tables = new Set<string>()
    for (const c of cmds) {
      const arts = (c.commande_articles ?? []).filter(a => tags.includes(String(a.tag_destination)) && a.statut !== 'servi' && (a.allergenes_a_eviter?.length ?? 0) > 0)
      if (arts.length) {
        if (c.numero_table) tables.add(c.numero_table)
        for (const a of arts) for (const al of (a.allergenes_a_eviter ?? [])) allerg.add(al)
      }
    }
    if (allerg.size) out.push({ id: 'cuis-allerg', emoji: '⚠️', texte: `Allergie à éviter${tables.size ? ' (table ' + [...tables].join(', ') + ')' : ''} : ${[...allerg].join(', ')}. Vérifie bien.`, urgence: 'rouge' })
  }

  // ── Bar ──────────────────────────────────────────────────────────
  if (poste === 'bar') {
    let n = 0
    for (const c of cmds) {
      if (ageMin(c.created_at) <= 5) continue
      const arts = (c.commande_articles ?? []).filter(a => String(a.tag_destination) === 'BAR' && (a.statut === 'en_attente' || a.statut === 'en_preparation'))
      n += arts.length
    }
    if (n) out.push({ id: 'bar-att', emoji: '🍷', texte: `${n} boisson(s) en attente depuis +5 min — sers-les.`, urgence: 'rouge' })
  }

  // ── Serveur ──────────────────────────────────────────────────────
  if (poste === 'serveur') {
    const tablesPret = new Set<string>()
    for (const c of cmds) {
      const arts = (c.commande_articles ?? []).filter(a => a.statut === 'pret')
      if (arts.length && c.numero_table) tablesPret.add(c.numero_table)
    }
    if (tablesPret.size) out.push({ id: 'srv-pret', emoji: '🍽️', texte: `Plat(s) prêt(s) à passer — table ${[...tablesPret].join(', ')}.`, urgence: 'rouge' })

    try {
      const { data: tbl } = await sb.from('tables_restaurant').select('numero, statut, commande_active_id').eq('statut', 'occupee').is('commande_active_id', null)
      const sans = (tbl ?? []).map(t => t.numero as string).filter(Boolean)
      if (sans.length) out.push({ id: 'srv-sanscmd', emoji: '🪑', texte: `Table ${sans.join(', ')} installée sans commande — va prendre la commande.`, urgence: 'orange' })
    } catch { /* colonne absente : on ignore */ }
  }

  // ── Snack / Emporter ─────────────────────────────────────────────
  if (poste === 'emporter' || poste === 'snack') {
    let n = 0
    for (const c of cmds) {
      if (c.source === 'ONLINE' && c.statut === 'en_attente' && ageMin(c.created_at) > 5) n += 1
    }
    if (n) out.push({ id: 'snack-online', emoji: '🛒', texte: `${n} commande(s) en ligne à prendre en charge (+5 min).`, urgence: 'rouge' })
  }

  // ── Stock + HACCP : alertes agents repliées dans le coup de main ──
  // (remplace l'ancien bloc « ALERTES DES AGENTS » retiré de l'opérationnel)
  // NB : le serveur est volontairement ABSENT — il ne gère ni le stock ingrédients
  // ni l'HACCP. Ses nudges (plats prêts, table sans commande) sont gérés plus haut.
  // Les postes qui PRÉPARENT (cuisine/pizza/bar/snack) reçoivent stock + HACCP.
  const AGENTS_PAR_POSTE: Record<string, string[]> = {
    cuisine:  ['stock', 'haccp'],
    pizza:    ['stock', 'haccp'],
    bar:      ['stock', 'haccp'],
    emporter: ['stock', 'haccp'],
    snack:    ['stock', 'haccp'],
  }
  const agents = AGENTS_PAR_POSTE[poste]
  if (agents) {
    try {
      const { data: finds } = await sb.from('agent_findings')
        .select('id, agent_id, urgence, titre')
        .eq('resolu', false).in('agent_id', agents).in('urgence', ['rouge', 'jaune'])
        .order('urgence', { ascending: true }).order('created_at', { ascending: false }).limit(12)
      const seenTitres = new Set<string>()
      let ajoutes = 0
      for (const f of finds ?? []) {
        if (ajoutes >= 3) break
        const titre = String(f.titre ?? '')
        // Les « bons de commande à valider » = tâche GÉRANT (fournisseurs/pilotage),
        // pas l'équipe en service. On ne garde que ce qui est actionnable au poste
        // (ruptures, DLC, températures, checklists HACCP…).
        if (/bon de commande|à valider|commande fournisseur/i.test(titre)) continue
        // Évite les findings en double (même intitulé répété par l'agent sur plusieurs runs).
        if (seenTitres.has(titre)) continue
        seenTitres.add(titre)
        out.push({
          id: `find-${f.id}`,
          emoji: f.agent_id === 'haccp' ? '🌡️' : '📦',
          texte: titre,
          urgence: f.urgence === 'rouge' ? 'rouge' : 'orange',
        })
        ajoutes++
      }
    } catch { /* findings best-effort */ }
  }

  // Dédup final par texte (filet de sécurité : jamais deux lignes identiques affichées).
  const vus = new Set<string>()
  return out.filter(o => (vus.has(o.texte) ? false : (vus.add(o.texte), true)))
}
