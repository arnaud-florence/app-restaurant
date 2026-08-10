import { createClient } from '@/lib/supabase/server'
import EquipesClient from './EquipesClient'
import StoriesNavServer from '@/components/StoriesNavServer'
import { getProfile } from '@/lib/auth'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'
import type {
  Canal, Employe, Message, InfoAffichage, CompteRendu, Materiel,
  Priorite, TypeMateriel, EtatMateriel,
} from './types'

export const metadata = { title: 'Équipes — Communication interne' }
export const dynamic = 'force-dynamic'

export default async function EquipesPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [employesRes, messagesRes, infosRes, crsRes, matsRes] = await Promise.all([
    supabase.from('employes')
      .select('id, prenom, nom, poste')
      .eq('actif', true)
      .order('prenom'),
    supabase.from('messages')
      .select(`id, canal, expediteur_id, contenu, lu_par, reactions, created_at,
               expediteur:employes!expediteur_id(prenom, nom)`)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('affichage_infos')
      .select(`id, titre, contenu, priorite, valable_du, valable_jusqu, ordre, created_at,
               cree:employes!cree_par(prenom, nom)`)
      .or(`valable_jusqu.is.null,valable_jusqu.gte.${today}`)
      .lte('valable_du', today)
      .order('ordre')
      .order('created_at', { ascending: false }),
    supabase.from('comptes_rendus')
      .select(`id, titre, date_reunion, contenu, participants, created_at,
               redacteur:employes!redacteur_id(prenom, nom)`)
      .order('date_reunion', { ascending: false })
      .limit(50),
    supabase.from('materiels')
      .select(`id, nom, type, numero_serie, etat, attribue_a, date_attribution, notes, actif, created_at,
               employe:employes!attribue_a(prenom, nom)`)
      .eq('actif', true)
      .order('type')
      .order('nom'),
  ])

  const employes: Employe[] = (employesRes.data ?? []).map(e => ({
    id: e.id as string, prenom: e.prenom as string, nom: e.nom as string, poste: e.poste as string,
  }))
  const empNomById = new Map(employes.map(e => [e.id, `${e.prenom} ${e.nom}`.trim()]))

  type MsgRow = { id: string; canal: string; expediteur_id: string | null; contenu: string;
    lu_par: string[] | null; created_at: string; expediteur?: { prenom?: string; nom?: string } | null }
  const messages: Message[] = ((messagesRes.data ?? []) as MsgRow[]).map(m => {
    const exp = m.expediteur
    return {
      id: m.id, canal: m.canal as Canal,
      expediteur_id: m.expediteur_id ?? null,
      expediteur_nom: exp ? `${exp.prenom ?? ''} ${exp.nom ?? ''}`.trim() : null,
      contenu: m.contenu, lu_par: m.lu_par ?? [],
      created_at: m.created_at,
    }
  }).reverse()  // chronologique pour l'affichage

  type InfoRow = { id: string; titre: string; contenu: string; priorite: string;
    valable_du: string; valable_jusqu: string | null; ordre: number; created_at: string;
    cree?: { prenom?: string; nom?: string } | null }
  const infos: InfoAffichage[] = ((infosRes.data ?? []) as InfoRow[]).map(i => {
    const c = i.cree
    return {
      id: i.id, titre: i.titre, contenu: i.contenu, priorite: i.priorite as Priorite,
      valable_du: i.valable_du, valable_jusqu: i.valable_jusqu,
      ordre: Number(i.ordre ?? 0),
      cree_par_nom: c ? `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() : null,
      created_at: i.created_at,
    }
  })

  type CRRow = { id: string; titre: string; date_reunion: string; contenu: string;
    participants: string[] | null; created_at: string;
    redacteur?: { prenom?: string; nom?: string } | null }
  const crs: CompteRendu[] = ((crsRes.data ?? []) as CRRow[]).map(c => {
    const r = c.redacteur
    const ids = c.participants ?? []
    return {
      id: c.id, titre: c.titre, date_reunion: c.date_reunion,
      contenu: c.contenu, participants: ids,
      participants_noms: ids.map(id => empNomById.get(id) ?? '— ?').filter(Boolean),
      redacteur_nom: r ? `${r.prenom ?? ''} ${r.nom ?? ''}`.trim() : null,
      created_at: c.created_at,
    }
  })

  type MatRow = { id: string; nom: string; type: string; numero_serie: string | null;
    etat: string; attribue_a: string | null; date_attribution: string | null;
    notes: string | null; actif: boolean; created_at: string;
    employe?: { prenom?: string; nom?: string } | null }
  const mats: Materiel[] = ((matsRes.data ?? []) as MatRow[]).map(m => {
    const e = m.employe
    return {
      id: m.id, nom: m.nom, type: m.type as TypeMateriel,
      numero_serie: m.numero_serie, etat: m.etat as EtatMateriel,
      attribue_a: m.attribue_a, date_attribution: m.date_attribution,
      notes: m.notes, actif: m.actif, created_at: m.created_at,
      attribue_a_nom: e ? `${e.prenom ?? ''} ${e.nom ?? ''}`.trim() : null,
    }
  })

  const profil = await getProfile()
  const navProfil: OpsBottomNavProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
        apercu: profil.apercu,
  } : null

  return (
    <EquipesClient
      employes={employes}
      initialMessages={messages}
      initialInfos={infos}
      initialCRs={crs}
      initialMateriels={mats}
      navProfil={navProfil}
      connectedEmployeId={profil?.employe_id ?? null}
      storiesSlot={<StoriesNavServer />}
    />
  )
}
