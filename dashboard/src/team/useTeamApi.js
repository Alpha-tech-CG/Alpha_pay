import { useAuth } from '@clerk/clerk-react'
import { api } from '../api'

/**
 * Client HTTP pour les endpoints Team Members (auth Clerk Bearer — décision
 * 1A du handoff). Distinct de `api` seul (utilisé tel quel pour les endpoints
 * à clé API) : ces routes exigent un vrai token de session Clerk par requête.
 * Le proxy Vite (dev, vite.config.js) injecte aussi X-API-Key sur /api —
 * inoffensif ici, ClerkSessionGuard ignore cet en-tête.
 */
export function useTeamApi() {
  const { getToken } = useAuth()

  async function auth() {
    const token = await getToken()
    return { headers: { Authorization: `Bearer ${token}` } }
  }

  return {
    myMerchants: async () => (await api.get('/v1/me/merchants', await auth())).data,
    listMembers: async (merchantId) => (await api.get(`/v1/merchants/${merchantId}/members`, await auth())).data,
    listEvents: async (merchantId) => (await api.get(`/v1/merchants/${merchantId}/members/events`, await auth())).data,
    listInvitations: async (merchantId) =>
      (await api.get(`/v1/merchants/${merchantId}/members/invitations`, await auth())).data,
    invite: async (merchantId, email, role) =>
      (await api.post(`/v1/merchants/${merchantId}/members/invitations`, { email, role }, await auth())).data,
    revokeInvitation: async (merchantId, invitationId) =>
      api.delete(`/v1/merchants/${merchantId}/members/invitations/${invitationId}`, await auth()),
    changeRole: async (merchantId, memberId, role) =>
      (await api.patch(`/v1/merchants/${merchantId}/members/${memberId}`, { role }, await auth())).data,
    suspend: async (merchantId, memberId) =>
      api.post(`/v1/merchants/${merchantId}/members/${memberId}/suspend`, {}, await auth()),
    reactivate: async (merchantId, memberId) =>
      api.post(`/v1/merchants/${merchantId}/members/${memberId}/reactivate`, {}, await auth()),
    remove: async (merchantId, memberId) =>
      api.delete(`/v1/merchants/${merchantId}/members/${memberId}`, await auth()),
    transferOwnership: async (merchantId, toUserId) =>
      api.post(`/v1/merchants/${merchantId}/ownership/transfer`, { toUserId }, await auth()),
    previewInvitation: async (token) => (await api.get(`/v1/invitations/${token}`)).data,
    acceptInvitation: async (token) => (await api.post('/v1/invitations/accept', { token }, await auth())).data,
  }
}
