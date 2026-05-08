/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint cosmétique (apostrophes non échappées, imports inutilisés) ignoré en
  // build prod. Le type-check TypeScript reste actif (npx tsc --noEmit) et bloque
  // toujours sur les erreurs réelles. À ré-activer module par module si on
  // veut nettoyer la dette linting.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Inclut docs/formation/*.md dans le bundle Vercel — sinon les pages
  // /admin/formation/docs/[slug] échouent en runtime (fs.readFile sur fichier
  // non déployé). Next n'inclut pas par défaut les fichiers non importés.
  outputFileTracingIncludes: {
    '/admin/formation/docs': ['./docs/formation/**/*.md'],
    '/admin/formation/docs/[slug]': ['./docs/formation/**/*.md'],
  },
}

export default nextConfig
