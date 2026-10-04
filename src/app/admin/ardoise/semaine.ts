/**
 * LES BORNES DE LA SEMAINE.
 *
 * ⚠️⚠️ ELLES VIVENT ICI ET PAS DANS `page.tsx` : Next 14 n'autorise qu'une
 * liste fermée d'exports dans un fichier de page (`default`, `metadata`,
 * `dynamic`…). Exporter une fonction ordinaire fait échouer la vérification
 * de types par « Page does not match the required types of a Next.js Page »
 * — un message qui ne nomme ni l'export fautif ni la règle, et qui n'apparaît
 * qu'APRÈS le « Compiled successfully » de webpack. Vécu le 04/10/2026.
 */

/** Le lundi de la semaine qui contient `d`. */
export function lundi(d = new Date()): string {
  const x = new Date(d)
  // ⚠️ `getDay()` rend 0 pour DIMANCHE : sans ce décalage, l'ardoise posée le
  // dimanche soir tomberait sur la semaine suivante — et c'est justement le
  // moment où le gérant la compose.
  const j = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - j)
  return x.toISOString().slice(0, 10)
}

export function dimanche(lundiISO: string): string {
  // ⚠️ Midi UTC, pas minuit : à minuit, le passage à l'heure d'hiver fait
  // reculer la date d'un jour et la semaine se termine le samedi.
  const x = new Date(`${lundiISO}T12:00:00Z`)
  x.setDate(x.getDate() + 6)
  return x.toISOString().slice(0, 10)
}
