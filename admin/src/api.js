import axios from 'axios';

// Toutes les requêtes passent par le proxy /admin-api qui injecte le token
// interne côté serveur (jamais dans le navigateur). Cf. vite.config.js.
export const api = axios.create({ baseURL: '/admin-api' });
