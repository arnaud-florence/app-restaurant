// Affiche un manuel de formation (lecture .md + rendu marked).

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { notFound } from 'next/navigation'
import { marked } from 'marked'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import PrintButton from './PrintButton'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `Manuel ${params.slug} — Formation` }
}

async function readDoc(slug: string): Promise<string | null> {
  if (!/^[\w-]+$/.test(slug)) return null
  const filePath = path.join(process.cwd(), 'docs', 'formation', `${slug}.md`)
  try { return await fs.readFile(filePath, 'utf8') }
  catch { return null }
}

export default async function DocPage({ params }: { params: { slug: string } }) {
  const md = await readDoc(params.slug)
  if (!md) notFound()

  // Configuration marked : GFM (tables), breaks soft, mangle off
  marked.setOptions({ gfm: true, breaks: false })
  const html = await marked.parse(md)

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/admin/formation/docs" className="text-zinc-600 hover:text-emerald-700 inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Retour aux manuels
        </Link>
        <PrintButton />
      </div>

      <article
        className="prose prose-zinc prose-emerald max-w-none bg-white rounded-md p-6 sm:p-8 shadow-sm
                   prose-h1:text-3xl prose-h1:mt-0 prose-h1:mb-2 prose-h1:border-b prose-h1:pb-2
                   prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
                   prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2 prose-h3:font-bold
                   prose-table:text-sm prose-th:bg-zinc-50 prose-th:font-bold prose-th:text-left
                   prose-td:border prose-td:px-3 prose-td:py-2 prose-th:border prose-th:px-3 prose-th:py-2
                   prose-blockquote:border-emerald-500 prose-blockquote:bg-emerald-50/40 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:not-italic
                   prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-zinc-800 prose-code:before:content-none prose-code:after:content-none
                   prose-li:my-0.5
                   prose-a:text-emerald-700"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <p className="text-xs text-zinc-400 text-center pt-2 print:hidden">
        Source : <code>docs/formation/{params.slug}.md</code>
      </p>
    </div>
  )
}
