import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Conditions Générales de Vente' }
export const dynamic = 'force-dynamic'

export default async function CgvPage() {
  const sb = await createClient()
  const { data } = await sb.from('parametres').select('cle, valeur').in('cle', [
    'etablissement_nom', 'etablissement_adresse', 'etablissement_email', 'etablissement_telephone',
    'etablissement_siret',
  ])
  const p = Object.fromEntries((data ?? []).map(r => [r.cle as string, (r.valeur as string) ?? '']))
  const nom = p.etablissement_nom || '__________'

  return (
    <article className="prose prose-zinc max-w-none">
      <h1>Conditions Générales de Vente (CGV)</h1>
      <p className="text-sm text-zinc-600">
        Les présentes CGV régissent l&apos;ensemble des prestations de restauration assurées par {nom}.
      </p>

      <h2>1. Identification du prestataire</h2>
      <ul>
        <li><strong>{nom}</strong></li>
        <li>{p.etablissement_adresse || '__________'}</li>
        <li>SIRET : {p.etablissement_siret || '__________'}</li>
        <li>Tel : {p.etablissement_telephone || '__________'} · Email : {p.etablissement_email || '__________'}</li>
      </ul>

      <h2>2. Prestations</h2>
      <p>
        {nom} propose des prestations de restauration (consommation sur place et/ou à emporter). Les plats et
        boissons sont préparés selon les règles d&apos;hygiène HACCP en vigueur.
      </p>

      <h2>3. Tarifs</h2>
      <p>
        Les prix sont affichés en TTC sur le menu et sur les supports de communication. Ils peuvent être modifiés
        à tout moment sans préavis. Les tarifs applicables sont ceux affichés au moment de la commande.
      </p>
      <p>
        TVA appliquée selon la réglementation en vigueur :
      </p>
      <ul>
        <li><strong>10 %</strong> — restauration sur place (plats et boissons non alcoolisées)</li>
        <li><strong>5,5 %</strong> — vente à emporter (plats et boissons non alcoolisées)</li>
        <li><strong>20 %</strong> — boissons alcoolisées (sur place ou à emporter)</li>
      </ul>

      <h2>4. Réservations</h2>
      <p>
        Les réservations peuvent être effectuées par téléphone, email ou via un formulaire en ligne. Pour les
        réservations de groupe (≥ 8 personnes), un acompte peut être demandé. En cas de no-show, l&apos;acompte
        sera conservé.
      </p>
      <p>
        Une réservation peut être annulée gratuitement jusqu&apos;à 24h avant. Au-delà, des frais peuvent être
        appliqués pour les réservations de groupe.
      </p>

      <h2>5. Allergies et régimes spécifiques</h2>
      <p>
        Le client est tenu de signaler toute allergie ou intolérance alimentaire au moment de la commande. {nom}
        s&apos;efforce de respecter ces contraintes mais ne peut garantir une absence totale de contamination
        croisée dans ses cuisines (en particulier pour le gluten, fruits à coque, lait).
      </p>

      <h2>6. Paiement</h2>
      <p>
        Le paiement s&apos;effectue à la fin du repas (sur place) ou à la commande (emporter). Modes de paiement
        acceptés : espèces, carte bancaire, tickets restaurant, virement (groupes), Apple Pay/Google Pay.
      </p>
      <p>
        Un ticket détaillé est remis à chaque client à sa demande, conformément à l&apos;article 290 quinquies du CGI.
      </p>

      <h2>7. Pourboires</h2>
      <p>
        Les pourboires sont entièrement laissés à l&apos;appréciation du client. Ils sont collectés via la caisse
        et redistribués mensuellement à l&apos;équipe selon des règles transparentes (pondération heures travaillées).
      </p>

      <h2>8. Droit de rétractation</h2>
      <p>
        Conformément à l&apos;article L.221-28 du Code de la consommation, les services de restauration ne sont
        pas soumis au droit de rétractation. Toutefois, en cas de problème (plat non conforme à la commande,
        défaut de qualité), le client est invité à le signaler immédiatement au service afin qu&apos;une solution
        amiable soit trouvée.
      </p>

      <h2>9. Réclamations</h2>
      <p>
        Toute réclamation doit être adressée à : <strong>{p.etablissement_email || '__________'}</strong> dans un
        délai de 7 jours suivant la prestation. Une réponse sera apportée dans les 48h ouvrées.
      </p>

      <h2>10. Médiation de la consommation</h2>
      <p>
        Conformément à l&apos;article L.616-1 du Code de la consommation, le client peut recourir gratuitement à
        un médiateur de la consommation en cas de litige non résolu. Coordonnées du médiateur sectoriel disponibles
        sur demande.
      </p>

      <h2>11. Droit applicable</h2>
      <p>
        Les présentes CGV sont régies par le droit français. En cas de litige, les tribunaux français du ressort
        du siège social de {nom} seront seuls compétents.
      </p>
    </article>
  )
}
