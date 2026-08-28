'use server'

// Déclenchement manuel de la synchro de caisse depuis l'admin.
//
// Pourquoi passer par une server action plutôt que d'appeler la route cron
// depuis le navigateur : la route est protégée par CRON_SECRET. Le secret ne
// doit ni transiter par le client, ni être recopié à la main par le gérant.
// Ici il reste sur le serveur, lu depuis les variables d'environnement Vercel.
//
// ⚠️ Visait SumUp jusqu'au 28/08/2026. SumUp est abandonné — un seul logiciel
// Zelty et deux caisses couvrant toutes les activités. Le bouton reste utile :
// le cron passe à HH:20, et quand on regarde le chiffre du jour à 11 h on ne
// veut pas attendre l'heure suivante.

import { revalidatePath } from 'next/cache'

export type ResultatSync = {
  ok: boolean
  message: string
  detail?: string
}

export async function synchroniserCaisse(jours: number): Promise<ResultatSync> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return { ok: false, message: 'CRON_SECRET absent des variables d’environnement Vercel.' }
  }
  if (!process.env.ZELTY_API_KEY) {
    return {
      ok: false,
      message: 'Clé Zelty non configurée.',
      detail: 'Ajouter ZELTY_API_KEY et ZELTY_MONTANTS_EN_CENTIMES dans Vercel → Settings → Environment Variables, puis redéployer.',
    }
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://app-restaurant-livid.vercel.app'
  const n = Math.min(Math.max(Number.isFinite(jours) ? jours : 7, 1), 60)

  try {
    const r = await fetch(`${base}/api/cron/caisse/zelty?jours=${n}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    const j = await r.json().catch(() => ({}))
    revalidatePath('/admin/caisse-agreee')

    if (!r.ok) {
      return { ok: false, message: `La caisse a refusé la demande (${r.status}).`, detail: JSON.stringify(j).slice(0, 500) }
    }
    const recues = Number(j?.recues ?? 0)
    const creees = Number(j?.connecteur?.commandes_creees ?? 0)
    // Le mapper signale lui-même ce qui l'inquiète : `expand[]=items` oublié,
    // panier moyen absurde, quantité muette. Le taire ici les rendrait
    // invisibles pour la seule personne qui regarde cet écran.
    const alertes: string[] = Array.isArray(j?.avertissements) ? j.avertissements : []

    return {
      ok: true,
      message: recues === 0
        ? `Aucun ticket sur les ${n} derniers jours.`
        : `${recues} ticket(s) récupéré(s), ${creees} entrée(s) dans le chiffre d’affaires.`
          + (alertes.length ? ` — ${alertes.length} avertissement(s).` : ''),
      detail: JSON.stringify(j).slice(0, 900),
    }
  } catch (e) {
    return { ok: false, message: 'Appel impossible.', detail: e instanceof Error ? e.message : String(e) }
  }
}
