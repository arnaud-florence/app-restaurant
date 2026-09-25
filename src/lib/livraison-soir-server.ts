// Réglages de la tournée du SOIR — lecture serveur.
//
// La règle pure vit dans `./livraison-soir.ts`. Ici, uniquement la lecture
// des valeurs que le gérant peut changer.
//
// ⚠️ Même patron que la livraison du matin : les réglages vivent dans
// `parametres`, pas dans le code. Une heure de tournée écrite en dur se
// retrouve recopiée à quatre endroits, et le jour où le gérant la déplace,
// trois d'entre eux mentent.

import { createClient } from '@/lib/supabase/server'
import { LIVRAISON_SOIR_DEFAUT, type ConfigLivraisonSoir } from './livraison-soir'

const CLES = {
  communes:           'livraison_soir_communes',
  debut:              'livraison_soir_debut',
  fin:                'livraison_soir_fin',
  capaciteParCreneau: 'livraison_soir_capacite',
  minimumTtc:         'livraison_soir_minimum_ttc',
  fraisTtc:           'livraison_soir_frais_ttc',
} as const

/**
 * Les réglages, complétés par les valeurs par défaut.
 *
 * ⚠️ En cas de doute — table muette, valeur illisible — on retombe sur le
 * DÉFAUT, jamais sur « pas de limite ». Une capacité absente lue comme
 * illimitée ferait accepter quinze livraisons dans le même quart d'heure, et
 * c'est le livreur qui découvrirait le problème, seul, à 20 h.
 */
export async function getConfigLivraisonSoir(): Promise<ConfigLivraisonSoir> {
  const cfg: ConfigLivraisonSoir = { ...LIVRAISON_SOIR_DEFAUT }
  try {
    const sb = await createClient()
    const { data } = await sb
      .from('parametres')
      .select('cle, valeur')
      .in('cle', Object.values(CLES))

    const lu = new Map((data ?? []).map(r => [r.cle as string, r.valeur as string]))

    const communes = lu.get(CLES.communes)
    if (communes) {
      const liste = communes.split(',').map(c => c.trim()).filter(Boolean)
      // ⚠️ Une liste VIDE ne veut pas dire « partout » : elle veut dire que
      // quelqu'un a effacé le champ. On garde la zone par défaut plutôt que
      // d'ouvrir la livraison au département.
      if (liste.length > 0) cfg.communes = liste
    }

    const heure = (v: string | undefined) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null)
    cfg.debut = heure(lu.get(CLES.debut)) ?? cfg.debut
    cfg.fin   = heure(lu.get(CLES.fin))   ?? cfg.fin

    const nb = (v: string | undefined) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : null
    }
    // ⚠️ Zéro est une valeur VALIDE pour un minimum ou des frais (« pas de
    // minimum »), mais pas pour une capacité : zéro livraison par créneau
    // fermerait le service en silence. D'où le `> 0` sur celle-là seulement.
    const cap = nb(lu.get(CLES.capaciteParCreneau))
    if (cap !== null && cap > 0) cfg.capaciteParCreneau = cap
    cfg.minimumTtc = nb(lu.get(CLES.minimumTtc)) ?? cfg.minimumTtc
    cfg.fraisTtc   = nb(lu.get(CLES.fraisTtc))   ?? cfg.fraisTtc
  } catch {
    // La configuration par défaut est un repli sûr : elle livre la commune du
    // village, aux heures du service, avec une capacité prudente.
  }
  return cfg
}
