// Transition de page : un fondu doux rejoué à chaque navigation dans /admin/*
// (template.tsx se re-monte à chaque changement de route → l'animation CSS
// `animate-in fade-in` rejoue). Fade SEUL (pas de transform) pour ne pas
// perturber les éléments fixed/sticky pendant l'animation.

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in duration-300">{children}</div>
}
