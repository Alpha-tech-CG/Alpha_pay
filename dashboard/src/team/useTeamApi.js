import { useMemo } from 'react'
import { authApi } from '../auth/session'

/**
 * Client des routes de l'équipe marchand : session de l'utilisateur connecté
 * (jeton d'accès, renouvelé automatiquement). Le contrôle d'accès est fait
 * côté serveur à chaque requête. Objet stable d'un rendu à l'autre : les écrans
 * le mettent dans les dépendances de leurs effets.
 */
export function useTeamApi() {
  return useMemo(() => API, [])
}

const API = {
  myMerchants: async () => (await authApi.get('/v1/me/merchants')).data,
  listMembers: async (merchantId) => (await authApi.get(`/v1/merchants/${merchantId}/members`)).data,
  listEvents: async (merchantId) => (await authApi.get(`/v1/merchants/${merchantId}/members/events`)).data,
  listInvitations: async (merchantId) =>
    (await authApi.get(`/v1/merchants/${merchantId}/members/invitations`)).data,
  invite: async (merchantId, contact, role) =>
    (await authApi.post(`/v1/merchants/${merchantId}/members/invitations`, { ...(contact.includes('@') ? { email: contact } : { phone: contact }), role })).data,
  revokeInvitation: async (merchantId, invitationId) =>
    authApi.delete(`/v1/merchants/${merchantId}/members/invitations/${invitationId}`),
  changeRole: async (merchantId, memberId, role) =>
    (await authApi.patch(`/v1/merchants/${merchantId}/members/${memberId}`, { role })).data,
  suspend: async (merchantId, memberId) =>
    authApi.post(`/v1/merchants/${merchantId}/members/${memberId}/suspend`, {}),
  reactivate: async (merchantId, memberId) =>
    authApi.post(`/v1/merchants/${merchantId}/members/${memberId}/reactivate`, {}),
  remove: async (merchantId, memberId) =>
    authApi.delete(`/v1/merchants/${merchantId}/members/${memberId}`),
  transferOwnership: async (merchantId, toUserId) =>
    authApi.post(`/v1/merchants/${merchantId}/ownership/transfer`, { toUserId }),
  previewInvitation: async (token) => (await authApi.get(`/v1/invitations/${token}`)).data,
  acceptInvitation: async (token) => (await authApi.post('/v1/invitations/accept', { token })).data,
}
