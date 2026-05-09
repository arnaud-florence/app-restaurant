import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Conditions Générales d\'Utilisation' }
export const dynamic = 'force-dynamic'

export default async function CguPage() {
  const sb = await createClient()
  const { data } = await sb.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom', 'etablissement_email'])
  const p = Object.fromEntries((data ?? []).map(r => [r.cle as string, (r.valeur as string) ?? '']))
  const nom = p.etablissement_nom || '__________'

  return (
    <article className="prose prose-zinc max-w-none">
      <h1>Conditions Générales d&apos;Utilisation (CGU)</h1>
      <p className="text-sm text-zinc-600">
        Les présentes CGU régissent l&apos;utilisation de l&apos;application interne de gestion utilisée par {nom} et son équipe.
      </p>

      <h2>1. Objet</h2>
      <p>
        L&apos;application est un outil professionnel destiné à la gestion opérationnelle et stratégique du restaurant
        {' '}{nom}. Elle est utilisée par les employés (saisie commandes, pointage, formation) et la direction
        (pilotage, finances, RH).
      </p>

      <h2>2. Accès et création de compte</h2>
      <p>
        L&apos;accès est strictement réservé aux personnes autorisées par {nom}. Chaque utilisateur reçoit un accès
        nominatif via un lien d&apos;invitation envoyé par email. Le partage de compte est interdit.
      </p>

      <h2>3. Engagements de l&apos;utilisateur</h2>
      <p>L&apos;utilisateur s&apos;engage à :</p>
      <ul>
        <li>Saisir des données exactes et à jour</li>
        <li>Respecter la confidentialité des données auxquelles il/elle a accès (clientèle, recettes, finances)</li>
        <li>Ne pas tenter de contourner les contrôles d&apos;accès (RBAC)</li>
        <li>Signaler immédiatement à la direction toute anomalie ou tentative d&apos;accès non autorisé</li>
        <li>Respecter les procédures HACCP et les obligations légales lors de la saisie d&apos;informations sanitaires</li>
      </ul>

      <h2>4. Disponibilité</h2>
      <p>
        Le service est fourni « en l&apos;état » et « selon disponibilité ». Bien que la direction s&apos;efforce
        d&apos;assurer une disponibilité maximale, des interruptions peuvent survenir pour maintenance, mise à jour
        ou raisons techniques indépendantes de sa volonté.
      </p>

      <h2>5. Sécurité</h2>
      <ul>
        <li>Authentification par email + lien magique sécurisé</li>
        <li>Option 2FA (TOTP) disponible pour les comptes sensibles</li>
        <li>Données chiffrées en transit (HTTPS) et au repos</li>
        <li>Sauvegardes quotidiennes</li>
        <li>Journal d&apos;audit des actions sensibles</li>
      </ul>

      <h2>6. Propriété des données</h2>
      <p>
        Toutes les données saisies dans l&apos;application restent la propriété exclusive de {nom}. Les utilisateurs
        ne peuvent en aucun cas exporter, copier ou diffuser ces données à des fins personnelles ou pour une utilisation
        en dehors de leur cadre professionnel.
      </p>

      <h2>7. Responsabilités</h2>
      <p>
        {nom} est responsable des données déclarées par ses employés. Chaque employé reste responsable de l&apos;exactitude
        de ses propres saisies (pointage, tâches, NC).
      </p>

      <h2>8. Durée et résiliation</h2>
      <p>
        L&apos;accès à l&apos;application est lié au contrat de travail de l&apos;utilisateur avec {nom}. En cas de fin
        de contrat (démission, licenciement, fin CDD), l&apos;accès est immédiatement révoqué et les données personnelles
        sont conservées conformément aux durées légales.
      </p>

      <h2>9. Modification des CGU</h2>
      <p>
        Les présentes CGU peuvent être modifiées à tout moment. Les utilisateurs en seront informés par notification
        dans l&apos;application.
      </p>

      <h2>10. Contact</h2>
      <p>
        Pour toute question : <strong>{p.etablissement_email || '__________'}</strong>.
      </p>
    </article>
  )
}
