import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Politique de confidentialité (RGPD)' }
export const dynamic = 'force-dynamic'

export default async function RgpdPage() {
  const sb = await createClient()
  const { data } = await sb.from('parametres').select('cle, valeur').in('cle', [
    'etablissement_nom', 'etablissement_email', 'etablissement_adresse',
  ])
  const p = Object.fromEntries((data ?? []).map(r => [r.cle as string, (r.valeur as string) ?? '']))
  const nom = p.etablissement_nom || '__________'
  const email = p.etablissement_email || '__________'

  return (
    <article className="prose prose-zinc max-w-none">
      <h1>Politique de confidentialité (RGPD)</h1>
      <p className="text-sm text-zinc-600">
        Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement des données personnelles est <strong>{nom}</strong>,
        {p.etablissement_adresse && <> dont le siège est situé au {p.etablissement_adresse},</>}
        {' '}joignable à : <strong>{email}</strong>.
      </p>

      <h2>2. Données collectées</h2>

      <h3>Pour les clients</h3>
      <ul>
        <li><strong>Réservations</strong> : nom, prénom, téléphone, email, nombre de couverts, date/heure</li>
        <li><strong>Allergies / régimes spécifiques</strong> : pour adapter le service</li>
        <li><strong>Historique de commandes</strong> : pour améliorer le service récurrent</li>
        <li><strong>Notes / préférences</strong> : pour personnaliser l&apos;accueil</li>
      </ul>

      <h3>Pour les employés</h3>
      <ul>
        <li><strong>Données contractuelles</strong> : nom, prénom, adresse, date de naissance, n° SS, IBAN, type de contrat, salaire</li>
        <li><strong>Données opérationnelles</strong> : pointage, congés, certifications, performances</li>
        <li><strong>Données de connexion</strong> : adresse email, IP, user-agent, dates de connexion</li>
      </ul>

      <h2>3. Finalités du traitement</h2>
      <ul>
        <li>Gestion des réservations et de la relation clientèle</li>
        <li>Respect des obligations légales (HACCP, allergènes, comptabilité)</li>
        <li>Gestion administrative et payroll des employés</li>
        <li>Pilotage opérationnel de l&apos;établissement</li>
        <li>Amélioration continue du service (analyses statistiques anonymisées)</li>
      </ul>

      <h2>4. Bases légales</h2>
      <ul>
        <li><strong>Exécution d&apos;un contrat</strong> (réservation, contrat de travail)</li>
        <li><strong>Obligation légale</strong> (comptabilité, HACCP, allergènes, déclarations sociales)</li>
        <li><strong>Intérêt légitime</strong> (sécurité, prévention de la fraude, qualité de service)</li>
        <li><strong>Consentement</strong> (newsletter, opérations marketing)</li>
      </ul>

      <h2>5. Destinataires des données</h2>
      <p>Les données sont accessibles uniquement aux personnes habilitées :</p>
      <ul>
        <li><strong>Direction</strong> : accès complet (manager)</li>
        <li><strong>Employés</strong> : accès limité aux données nécessaires à leur poste (RBAC)</li>
        <li><strong>Expert-comptable</strong> : exports comptables mensuels (TVA, salaires)</li>
        <li><strong>Hébergeurs techniques</strong> : Supabase (UE) et Vercel (USA, garanties par Standard Contractual Clauses)</li>
      </ul>

      <h2>6. Durée de conservation</h2>
      <table>
        <thead>
          <tr><th>Type de donnée</th><th>Durée</th></tr>
        </thead>
        <tbody>
          <tr><td>Réservations</td><td>3 ans après la dernière prestation</td></tr>
          <tr><td>Données comptables (factures, Z-reports)</td><td>10 ans (obligation légale)</td></tr>
          <tr><td>Documents RH (contrats, fiches de paie)</td><td>5 ans après fin de contrat</td></tr>
          <tr><td>Données salariés (pointage, NC)</td><td>5 ans</td></tr>
          <tr><td>Logs d&apos;audit / connexions</td><td>1 an</td></tr>
          <tr><td>Sauvegardes</td><td>30 jours glissants</td></tr>
        </tbody>
      </table>

      <h2>7. Vos droits</h2>
      <p>Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d&apos;accès</strong> à vos données</li>
        <li><strong>Droit de rectification</strong> en cas d&apos;erreur</li>
        <li><strong>Droit à l&apos;effacement</strong> (sous réserve des obligations légales)</li>
        <li><strong>Droit à la limitation</strong> du traitement</li>
        <li><strong>Droit à la portabilité</strong> de vos données</li>
        <li><strong>Droit d&apos;opposition</strong> au traitement</li>
        <li><strong>Droit de retirer votre consentement</strong> à tout moment</li>
      </ul>
      <p>
        Pour exercer vos droits, contactez : <strong>{email}</strong>. Une réponse sera apportée sous 30 jours
        maximum.
      </p>

      <h2>8. Cookies</h2>
      <p>
        L&apos;application utilise uniquement des cookies <strong>strictement nécessaires</strong> à son fonctionnement :
      </p>
      <ul>
        <li><code>sb-*-auth-token</code> : session de connexion (Supabase Auth)</li>
        <li>Préférences UI stockées en localStorage (favoris, layout, etc.)</li>
      </ul>
      <p>
        <strong>Aucun cookie publicitaire ou de tracking tiers</strong> n&apos;est déposé.
        Aucun consentement préalable n&apos;est donc requis (article 82 LIL).
      </p>

      <h2>9. Sécurité</h2>
      <p>Les mesures techniques et organisationnelles mises en œuvre incluent :</p>
      <ul>
        <li>Chiffrement HTTPS (TLS 1.2+) en transit</li>
        <li>Chiffrement AES-256 au repos (Supabase Postgres)</li>
        <li>Authentification forte (Magic Link + option 2FA TOTP)</li>
        <li>Contrôle d&apos;accès basé sur le rôle (RBAC)</li>
        <li>Journal d&apos;audit des actions sensibles</li>
        <li>Sauvegardes quotidiennes</li>
      </ul>

      <h2>10. Transferts hors UE</h2>
      <p>
        Les données sont stockées principalement en Europe (Supabase région Frankfurt).
        L&apos;hébergement applicatif est assuré par Vercel (États-Unis) avec un transfert encadré par les Clauses
        Contractuelles Types (SCC) approuvées par la Commission européenne.
      </p>

      <h2>11. Réclamation auprès de la CNIL</h2>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL :
      </p>
      <ul>
        <li>3 Place de Fontenoy — TSA 80715 — 75334 Paris Cedex 07</li>
        <li><a href="https://www.cnil.fr" target="_blank" rel="noreferrer">www.cnil.fr</a></li>
        <li>Tel : 01 53 73 22 22</li>
      </ul>

      <hr />
      <p className="text-xs text-zinc-500 italic">
        Politique de confidentialité — version générée automatiquement.
        Pour les traitements complexes (newsletter, vidéosurveillance, géolocalisation), consultez votre DPO.
      </p>
    </article>
  )
}
