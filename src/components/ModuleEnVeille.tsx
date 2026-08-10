// Écran affiché à la place d'un poste dont l'activité n'a pas encore ouvert.
//
// Le filtrage de navigation (lib/navigation.ts) suffit pour qu'un employé ne
// TOMBE pas dessus. Cette garde couvre l'autre cas : les tablettes de service
// ont des favoris et des onglets épinglés vers /serveur, /cuisine, /bar. Sans
// elle, l'employé arrive sur un écran vide et fonctionnel en apparence — et
// appelle le gérant. Ici, il lit une phrase claire et repart au bon endroit.

import Link from 'next/link'

export default function ModuleEnVeille({
  emoji = '💤',
  titre,
  raison,
  theme = 'dark',
}: {
  emoji?: string
  titre: string
  raison?: string
  /** 'dark' pour les écrans (ops), 'light' pour l'admin. */
  theme?: 'dark' | 'light'
}) {
  const sombre = theme === 'dark'

  return (
    <div className={`min-h-screen flex items-center justify-center px-6 py-20 ${
      sombre ? 'bg-[#0D0D0D] text-zinc-100' : 'bg-stone-50 text-zinc-900'
    }`}>
      <div className="max-w-lg text-center">
        <p className="text-6xl mb-6">{emoji}</p>

        <p className={`text-[10px] uppercase tracking-[0.3em] mb-3 ${sombre ? 'text-zinc-500' : 'text-zinc-400'}`}>
          Module en veille
        </p>

        <h1 className="text-3xl md:text-4xl font-black mb-4">{titre}</h1>

        <p className={`leading-relaxed mb-10 ${sombre ? 'text-zinc-400' : 'text-zinc-600'}`}>
          {raison ?? 'Cette activité n’a pas encore ouvert.'}{' '}
          Rien n’est perdu : les données, les réglages et l’historique sont intacts.
          Le gérant rallume ce module depuis{' '}
          <b className={sombre ? 'text-zinc-200' : 'text-zinc-900'}>Système → Activités &amp; ouverture</b>.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/comptoir/fournil"
            className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black transition-colors"
          >
            🥖 Comptoir Fournil
          </Link>
          <Link
            href={sombre ? '/service' : '/admin/etablissements'}
            className={`inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl border font-bold transition-colors ${
              sombre
                ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-900'
                : 'border-zinc-300 text-zinc-700 hover:bg-white'
            }`}
          >
            {sombre ? 'Centre opérationnel' : 'Activités & ouverture'}
          </Link>
          <Link
            href={sombre ? '/mon-espace' : '/admin/cat'}
            className={`inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl border font-bold transition-colors ${
              sombre
                ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-900'
                : 'border-zinc-300 text-zinc-700 hover:bg-white'
            }`}
          >
            {sombre ? 'Mon espace' : 'Tableau de bord'}
          </Link>
        </div>
      </div>
    </div>
  )
}
