// Index des manuels de formation par poste (lecture des fichiers .md du repo).

import { promises as fs } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { ArrowLeft, BookOpen, FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Manuels formation — Admin' }
export const dynamic = 'force-dynamic'

type DocMeta = { slug: string; titre: string; lignes: number; lecture: string; ordre: number }

async function listDocs(): Promise<DocMeta[]> {
  const dir = path.join(process.cwd(), 'docs', 'formation')
  let files: string[] = []
  try { files = await fs.readdir(dir) } catch { return [] }
  const mdFiles = files.filter(f => f.endsWith('.md')).sort()
  const docs: DocMeta[] = []
  for (const f of mdFiles) {
    const content = await fs.readFile(path.join(dir, f), 'utf8')
    const lines = content.split('\n')
    const titreLine = lines.find(l => l.startsWith('# '))
    const titre = titreLine ? titreLine.replace(/^#+\s*/, '').trim() : f.replace('.md', '')
    const lectureMatch = content.match(/À lire en\s*~?(\d+\s*\w*)/)
    const lecture = lectureMatch ? lectureMatch[1] : '?'
    const ordreMatch = f.match(/^(\d+)/)
    docs.push({
      slug: f.replace('.md', ''),
      titre,
      lignes: lines.length,
      lecture,
      ordre: ordreMatch ? Number(ordreMatch[1]) : 99,
    })
  }
  return docs.sort((a, b) => a.ordre - b.ordre)
}

export default async function DocsIndexPage() {
  const docs = await listDocs()
  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/formation" className="text-zinc-600 hover:text-emerald-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-emerald-600" /> Manuels formation
        </h1>
      </div>

      <p className="text-sm text-zinc-600">
        Manuels métier par poste. Lecture recommandée pour chaque membre de l'équipe lors de
        sa prise de poste. Ces documents servent aussi de base aux guides interactifs Module 27.
      </p>

      {docs.length === 0 ? (
        <Card className="p-6 text-center text-zinc-500">
          Aucun manuel trouvé dans <code>docs/formation/</code>.
        </Card>
      ) : (
        <div className="grid gap-3">
          {docs.map(d => (
            <Link key={d.slug} href={`/admin/formation/docs/${d.slug}`}>
              <Card className="p-4 hover:bg-emerald-50/40 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <FileText className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-base">{d.titre}</h2>
                    <p className="text-xs text-zinc-500 mt-1">
                      {d.lignes} lignes · ~{d.lecture} de lecture
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-400 text-center pt-4">
        Sources versionnées dans <code>docs/formation/*.md</code>
      </p>
    </div>
  )
}
