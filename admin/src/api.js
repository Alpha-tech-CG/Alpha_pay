import axios from 'axios';
import { t } from './i18n';

// Le back-office appelle l'API à travers le proxy /admin-api (même origine) avec
// la session du personnel en Authorization. Aucun secret partagé dans le proxy.
export const api = axios.create({ baseURL: '/admin-api' });

let token = null;
let onExpired = () => {};

export function setStaffToken(value, expired) {
  token = value;
  onExpired = expired;
}

api.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Session expirée ou révoquée : retour à l'écran de connexion.
    if (err?.response?.status === 401 && token) onExpired();
    return Promise.reject(err);
  },
);

/** Message d'erreur lisible (format §7 de l'API). */
export function errorText(err, fallback = t('common.error')) {
  return err?.response?.data?.error?.message ?? fallback;
}
