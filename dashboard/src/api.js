import axios from 'axios'

// La clé API marchand n'est JAMAIS dans le navigateur : le proxy Vite (dev) /
// le BFF (prod) l'injecte côté serveur sur chaque requête /api (cf. charte AuthN).
export const api = axios.create({
  baseURL: '/api',
})
