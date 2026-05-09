// Page imprimable contrat de travail (CDI / CDD / extra / stage / apprentissage).
// Pré-rempli avec données employé + données établissement.
// Manager only. Imprimable via window.print().

import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import ContratClient from './ContratClient'

export const metadata = { title: 'Contrat de travail' }
export const dynamic = 'force-dynamic'

type Props = {
  params: { employeId: string }
  searchParams: { type?: string; debut?: string; fin?: string; periode_essai?: string }
}

export default async function ContratPage({ params, searchParams }: Props) {
  await requireManager()
  const sb = await createClient()
  const typeContrat = (searchParams.type ?? 'CDI').toUpperCase()

  const [empRes, paramsRes, ecoRes] = await Promise.all([
    sb.from('employes')
      .select('id, prenom, nom, poste, type_contrat, email, telephone, salaire_horaire, heures_contrat, date_embauche, coef_charges_patronales, avantages_mensuel_eur')
      .eq('id', params.employeId).maybeSingle(),
    sb.from('parametres').select('cle, valeur').in('cle', [
      'etablissement_nom', 'etablissement_adresse', 'etablissement_siret', 'etablissement_tva_intra',
      'etablissement_telephone', 'etablissement_email', 'etablissement_code_naf', 'etablissement_convention_collective',
      'etablissement_representant_nom', 'etablissement_representant_fonction',
    ]),
    sb.from('config_economique').select('smic_horaire_brut').limit(1).maybeSingle(),
  ])

  if (!empRes.data) {
    return <div className="p-8 text-red-700">Employé introuvable.</div>
  }

  const emp = empRes.data as Record<string, unknown>
  const config = Object.fromEntries((paramsRes.data ?? []).map(p => [p.cle as string, (p.valeur as string) ?? '']))
  const smic = Number(ecoRes.data?.smic_horaire_brut ?? 11.65)

  return (
    <ContratClient
      employe={{
        id: emp.id as string,
        prenom: emp.prenom as string,
        nom: emp.nom as string,
        poste: emp.poste as string,
        email: (emp.email as string) ?? null,
        telephone: (emp.telephone as string) ?? null,
        salaire_horaire: Number(emp.salaire_horaire ?? 0),
        heures_contrat: Number(emp.heures_contrat ?? 35),
        date_embauche: (emp.date_embauche as string) ?? null,
      }}
      etablissement={{
        nom:           config.etablissement_nom        ?? 'Mon restaurant',
        adresse:       config.etablissement_adresse    ?? '',
        siret:         config.etablissement_siret      ?? '',
        tva_intra:     config.etablissement_tva_intra  ?? '',
        telephone:     config.etablissement_telephone  ?? '',
        email:         config.etablissement_email      ?? '',
        code_naf:      config.etablissement_code_naf   ?? '',
        convention:    config.etablissement_convention_collective ?? 'HCR (Hôtels Cafés Restaurants) — IDCC 1979',
        representant:  config.etablissement_representant_nom ?? '',
        rep_fonction:  config.etablissement_representant_fonction ?? 'Gérant',
      }}
      typeContrat={typeContrat as 'CDI' | 'CDD' | 'EXTRA' | 'STAGE' | 'APPRENTISSAGE'}
      dateDebut={searchParams.debut ?? new Date().toISOString().slice(0, 10)}
      dateFin={searchParams.fin ?? ''}
      periodeEssaiJours={Number(searchParams.periode_essai ?? '0') || 0}
      smic={smic}
    />
  )
}
