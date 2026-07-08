// Config Expo dynamique : reprend app.json et permet de surcharger l'URL de
// l'API par variable d'environnement (EXPO_PUBLIC_API_URL) sans éditer de
// fichier — pratique quand l'IP locale du PC change de réseau.
//
//   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000 npx expo start
//
const base = require('./app.json').expo;

module.exports = () => ({
  ...base,
  extra: {
    ...base.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || base.extra.apiBaseUrl,
  },
});
