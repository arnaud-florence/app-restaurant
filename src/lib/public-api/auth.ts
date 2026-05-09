// Auth pour l'API publique consommée par l'outil 2 (site vitrine).
// Header : x-api-key: <PUBLIC_API_KEY>
//
// La key est validée par comparaison stricte avec process.env.PUBLIC_API_KEY.
// Tant que la variable n'est pas définie en prod : toutes les routes publiques
// rejettent (403). À configurer après génération d'une key aléatoire (32+ chars).
//
// Pour générer une key sûre :
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

export function checkApiKey(req: Request): { ok: true } | { ok: false; status: number; reason: string } {
  const expected = process.env.PUBLIC_API_KEY
  if (!expected) {
    return { ok: false, status: 503, reason: 'Public API désactivée (PUBLIC_API_KEY non configurée)' }
  }
  const provided = req.headers.get('x-api-key')
  if (!provided) {
    return { ok: false, status: 401, reason: 'Header x-api-key manquant' }
  }
  // Comparaison constante-time pour éviter timing attacks
  if (provided.length !== expected.length) {
    return { ok: false, status: 403, reason: 'API key invalide' }
  }
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  if (diff !== 0) return { ok: false, status: 403, reason: 'API key invalide' }

  return { ok: true }
}

export function unauthorizedResponse(reason: string, status: number): Response {
  return Response.json({ error: reason }, { status })
}
