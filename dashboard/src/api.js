import axios from 'axios'

// Clé API marchand pour le dashboard. À terme, dérivée de la session marchand ;
// pour le MVP elle reste partagée (cf. clé éducative).
export const API_KEY = 'paybrain-key-alpha-educ-2026'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'X-API-Key': API_KEY },
})
