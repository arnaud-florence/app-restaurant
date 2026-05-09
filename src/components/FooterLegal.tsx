// Footer minimal avec liens légaux. À mettre sur les pages publiques.

import Link from 'next/link'

export default function FooterLegal() {
  return (
    <footer className="border-t bg-white py-3 px-4 text-center text-[11px] text-zinc-500">
      <nav className="inline-flex items-center gap-3 flex-wrap justify-center">
        <Link href="/legal/mentions-legales" className="hover:text-zinc-900">Mentions légales</Link>
        <span className="text-zinc-300">·</span>
        <Link href="/legal/cgu" className="hover:text-zinc-900">CGU</Link>
        <span className="text-zinc-300">·</span>
        <Link href="/legal/cgv" className="hover:text-zinc-900">CGV</Link>
        <span className="text-zinc-300">·</span>
        <Link href="/legal/rgpd" className="hover:text-zinc-900">RGPD</Link>
      </nav>
    </footer>
  )
}
