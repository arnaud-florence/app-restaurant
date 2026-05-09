import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Mentions légales' }
export const dynamic = 'force-dynamic'

export default async function MentionsLegalesPage() {
  const sb = await createClient()
  const { data } = await sb.from('parametres').select('cle, valeur').in('cle', [
    'etablissement_nom', 'etablissement_adresse', 'etablissement_telephone',
    'etablissement_email', 'etablissement_siret', 'etablissement_tva_intra',
    'etablissement_representant_nom', 'etablissement_representant_fonction',
    'etablissement_code_naf',
  ])
  const p = Object.fromEntries((data ?? []).map(r => [r.cle as string, (r.valeur as string) ?? '']))

  return (
    <article className="prose prose-zinc max-w-none">
      <h1>Mentions légales</h1>

      <h2>1. Éditeur du site</h2>
      <p>
        Le présent site est édité par : <strong>{p.etablissement_nom || '__________'}</strong>
      </p>
      <ul>
        <li><strong>Forme juridique</strong> : SARL / SAS / EURL / EI (à préciser dans /admin/setup)</li>
        <li><strong>Siège social</strong> : {p.etablissement_adresse || '__________'}</li>
        <li><strong>Téléphone</strong> : {p.etablissement_telephone || '__________'}</li>
        <li><strong>Email</strong> : {p.etablissement_email || '__________'}</li>
        <li><strong>SIRET</strong> : {p.etablissement_siret || '__________'}</li>
        <li><strong>N° TVA intracommunautaire</strong> : {p.etablissement_tva_intra || '__________'}</li>
        <li><strong>Code NAF</strong> : {p.etablissement_code_naf || '5610A — Restauration traditionnelle'}</li>
        <li><strong>Représentant légal</strong> : {p.etablissement_representant_nom || '__________'} ({p.etablissement_representant_fonction || 'Gérant'})</li>
      </ul>

      <h2>2. Hébergeur</h2>
      <p>
        Le site est hébergé par <strong>Vercel Inc.</strong> — 440 N Barranca Ave #4133, Covina, CA 91723, USA.
        La base de données est hébergée par <strong>Supabase Inc.</strong> dans des data centers de l&apos;Union européenne (région Frankfurt, Allemagne).
      </p>

      <h2>3. Directeur de la publication</h2>
      <p>
        Le directeur de la publication est <strong>{p.etablissement_representant_nom || '__________'}</strong>,
        en sa qualité de {p.etablissement_representant_fonction || 'gérant'} de {p.etablissement_nom || '__________'}.
      </p>

      <h2>4. Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des éléments présents sur ce site (textes, images, logos, marques, etc.) est la propriété
        exclusive de {p.etablissement_nom || '__________'} ou de ses partenaires. Toute reproduction, distribution,
        modification ou utilisation, totale ou partielle, sans autorisation écrite préalable est strictement interdite
        et constitue un acte de contrefaçon (article L.335-2 du Code de la propriété intellectuelle).
      </p>

      <h2>5. Données personnelles</h2>
      <p>
        Pour toute information sur le traitement de vos données personnelles, merci de consulter notre{' '}
        <a href="/legal/rgpd">politique de confidentialité (RGPD)</a>.
      </p>

      <h2>6. Cookies</h2>
      <p>
        Le site utilise uniquement des cookies techniques strictement nécessaires à son fonctionnement
        (session de connexion, préférences UI). Aucun cookie de tracking ou publicitaire n&apos;est déposé.
        Conformément à l&apos;article 82 de la loi Informatique et Libertés, ces cookies ne nécessitent pas de consentement préalable.
      </p>

      <h2>7. Responsabilité</h2>
      <p>
        {p.etablissement_nom || '__________'} s&apos;efforce de maintenir le site accessible et à jour.
        Toutefois, l&apos;éditeur ne peut être tenu responsable des erreurs, dysfonctionnements, indisponibilités
        temporaires ou pertes de données.
      </p>

      <h2>8. Droit applicable</h2>
      <p>
        Les présentes mentions sont régies par le droit français. Tout litige sera porté devant les tribunaux compétents
        du ressort du siège social de l&apos;éditeur.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question : <strong>{p.etablissement_email || '__________'}</strong> ou par courrier au siège.
      </p>

      <hr />
      <p className="text-xs text-zinc-500 italic">
        Document généré automatiquement à partir des paramètres de l&apos;établissement (configurables dans
        <code>/admin/setup</code>). Pensez à le faire valider par votre conseil juridique avant publication.
      </p>
    </article>
  )
}
