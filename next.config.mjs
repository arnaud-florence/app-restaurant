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
  // Autorise les images Unsplash en CDN pour les visuels de catégorie.
  // Si on veut self-host plus tard, déplacer dans /public/images/ et changer les URLs.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    ],
  },
}

export default nextConfig
