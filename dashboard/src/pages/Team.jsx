import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { Card, Button, Field, Input, Select } from '../ui'
import { useTeamApi } from '../team/useTeamApi'
import { assignableRoles, can, canActOn, invitableRoles } from '../team/permissions'

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', MANAGER: 'Manager', MEMBER: 'Membre', VIEWER: 'Lecteur' }
const STATUS_LABEL = { ACTIVE: 'Actif', SUSPENDED: 'Suspendu', INVITED: 'Invité', REMOVED: 'Retiré' }
const STATUS_COLOR = { ACTIVE: '#16a34a', SUSPENDED: '#d97706', INVITED: '#64748b', REMOVED: '#dc2626' }
const EVENT_LABEL = {
  INVITATION_SENT: 'Invitation envoyée',
  INVITATION_ACCEPTED: 'Invitation acceptée',
  INVITATION_REVOKED: 'Invitation révoquée',
  ROLE_CHANGED: 'Rôle modifié',
  MEMBER_SUSPENDED: 'Membre suspendu',
  MEMBER_REACTIVATED: 'Membre réactivé',
  MEMBER_REMOVED: 'Membre retiré',
  OWNERSHIP_TRANSFERRED: 'Propriété transférée',
}

function Pill({ color, children }) {
  return (
    <span style={{
      color, background: `${color}1f`, borderRadius: 9999,
      padding: '3px 11px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

function RoleBadge({ role }) {
  const { t } = useTheme()
  return <Pill color={role === 'OWNER' ? t.primary : '#475569'}>{ROLE_LABEL[role] || role}</Pill>
}

function StatusBadge({ status }) {
  return <Pill color={STATUS_COLOR[status] || '#64748b'}>{STATUS_LABEL[status] || status}</Pill>
}

function Row({ children }) {
  const { t } = useTheme()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px',
      borderBottom: `1px solid ${t.border}`, flexWrap: 'wrap',
    }}>{children}</div>
  )
}

export default function Team() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const teamApi = useTeamApi()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [merchantId, setMerchantId] = useState(null)
  const [myRole, setMyRole] = useState(null)
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [events, setEvents] = useState([])
  const [busyId, setBusyId] = useState(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState(null)

  const [transferTarget, setTransferTarget] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferError, setTransferError] = useState(null)

  const [eventsOpen, setEventsOpen] = useState(false)

  const load = useCallback(async (id, role) => {
    const [membersRes, invitationsRes] = await Promise.all([
      teamApi.listMembers(id),
      can(role, 'team:invite') ? teamApi.listInvitations(id) : Promise.resolve([]),
    ])
    setMembers(membersRes)
    setInvitations(invitationsRes)
  }, [teamApi])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const merchants = await teamApi.myMerchants()
        if (cancelled) return
        if (merchants.length === 0) {
          setMerchantId(null); setLoading(false); return
        }
        // Hypothèse documentée (handoff étape E) : un seul marchand actif par
        // utilisateur pour l'instant — pas de sélecteur multi-marchand.
        const mine = merchants[0]
        setMerchantId(mine.merchantId)
        setMyRole(mine.role)
        await load(mine.merchantId, mine.role)
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Impossible de charger l’équipe')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [teamApi, load])

  const reload = () => load(merchantId, myRole)

  const withBusy = (id, fn) => async (...args) => {
    setBusyId(id)
    try { await fn(...args); await reload() }
    catch (err) { setError(err.response?.data?.message || 'Action impossible') }
    finally { setBusyId(null) }
  }

  const handleChangeRole = withBusy('role', (memberId, role) => teamApi.changeRole(merchantId, memberId, role))
  const handleSuspend = (memberId) => withBusy(memberId, () => teamApi.suspend(merchantId, memberId))()
  const handleReactivate = (memberId) => withBusy(memberId, () => teamApi.reactivate(merchantId, memberId))()
  const handleRemove = (memberId) => {
    if (!window.confirm('Retirer ce membre de l’équipe ?')) return
    withBusy(memberId, () => teamApi.remove(merchantId, memberId))()
  }
  const handleRevoke = (invitationId) => withBusy(invitationId, () => teamApi.revokeInvitation(merchantId, invitationId))()

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteBusy(true); setInviteError(null)
    try {
      await teamApi.invite(merchantId, inviteEmail, inviteRole)
      setInviteEmail(''); setInviteOpen(false)
      await reload()
    } catch (err) {
      setInviteError(err.response?.data?.message || 'Échec de l’invitation')
    } finally { setInviteBusy(false) }
  }

  const handleTransfer = async () => {
    if (!transferTarget) return
    if (!window.confirm('Transférer la propriété du marchand ? Vous deviendrez Admin.')) return
    setTransferBusy(true); setTransferError(null)
    try {
      await teamApi.transferOwnership(merchantId, transferTarget)
      setMyRole('ADMIN'); setTransferTarget('')
      await load(merchantId, 'ADMIN')
    } catch (err) {
      setTransferError(err.response?.data?.message || 'Échec du transfert')
    } finally { setTransferBusy(false) }
  }

  const loadEvents = async () => {
    setEventsOpen((o) => !o)
    if (!eventsOpen && events.length === 0) {
      try { setEvents(await teamApi.listEvents(merchantId)) } catch { /* section optionnelle */ }
    }
  }

  if (loading) return <div style={{ padding: 40, color: t.textMuted }}>{tr('common.loading')}</div>

  if (!merchantId) {
    return (
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{tr('nav.team')}</h1>
        <Card>Aucun marchand associé à ce compte pour l’instant.</Card>
      </div>
    )
  }

  const eligibleTransferTargets = members.filter((m) => m.status === 'ACTIVE' && m.role !== 'OWNER')

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{tr('nav.team')}</h1>
      {error && <div style={{ marginBottom: 14, color: '#e11d48', fontSize: 13 }}>⚠️ {error}</div>}

      {can(myRole, 'team:invite') && (
        <Card style={{ marginBottom: 20 }}>
          <button onClick={() => setInviteOpen((o) => !o)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            color: t.primary, fontWeight: 700, fontSize: 14,
          }}>{inviteOpen ? '– Fermer' : '+ Inviter un membre'}</button>
          {inviteOpen && (
            <form onSubmit={handleInvite} style={{ marginTop: 14 }}>
              <Field label="Email">
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              </Field>
              <Field label="Rôle">
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {invitableRoles(myRole).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={inviteBusy}>{inviteBusy ? 'Envoi…' : 'Envoyer l’invitation'}</Button>
              {inviteError && <div style={{ marginTop: 10, color: '#e11d48', fontSize: 13 }}>⚠️ {inviteError}</div>}
            </form>
          )}
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Membres ({members.length})</div>
        {members.map((m) => {
          const editable = canActOn(myRole, m.role)
          return (
            <Row key={m.id}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.fullName || m.email || m.userId}
                </div>
                {m.email && <div style={{ fontSize: 12, color: t.textMuted }}>{m.email}</div>}
              </div>
              <RoleBadge role={m.role} />
              <StatusBadge status={m.status} />
              {editable && (
                <>
                  <Select
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={(e) => handleChangeRole(m.id, e.target.value)}
                    style={{ width: 130 }}
                  >
                    {assignableRoles(myRole).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                  {m.status === 'ACTIVE' && (
                    <Button variant="ghost" disabled={busyId === m.id} onClick={() => handleSuspend(m.id)}>Suspendre</Button>
                  )}
                  {m.status === 'SUSPENDED' && (
                    <Button variant="ghost" disabled={busyId === m.id} onClick={() => handleReactivate(m.id)}>Réactiver</Button>
                  )}
                  <Button variant="ghost" disabled={busyId === m.id} onClick={() => handleRemove(m.id)}>Retirer</Button>
                </>
              )}
            </Row>
          )
        })}
      </Card>

      {can(myRole, 'team:invite') && invitations.filter((i) => i.status === 'PENDING').length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Invitations en attente</div>
          {invitations.filter((i) => i.status === 'PENDING').map((inv) => (
            <Row key={inv.id}>
              <div style={{ flex: '1 1 200px', fontSize: 13 }}>{inv.email}</div>
              <RoleBadge role={inv.role} />
              <div style={{ fontSize: 12, color: t.textMuted }}>
                expire le {new Date(inv.expiresAt).toLocaleDateString('fr-FR')}
              </div>
              <Button variant="ghost" disabled={busyId === inv.id} onClick={() => handleRevoke(inv.id)}>Révoquer</Button>
            </Row>
          ))}
        </Card>
      )}

      {myRole === 'OWNER' && eligibleTransferTargets.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#fca5a5' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Transférer la propriété</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
            Vous deviendrez Admin ; la personne choisie devient Owner. Action réversible en refaisant un transfert.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} style={{ maxWidth: 280 }}>
              <option value="">Choisir un membre…</option>
              {eligibleTransferTargets.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>
              ))}
            </Select>
            <Button variant="ghost" disabled={!transferTarget || transferBusy} onClick={handleTransfer}>
              {transferBusy ? 'Transfert…' : 'Transférer'}
            </Button>
          </div>
          {transferError && <div style={{ marginTop: 10, color: '#e11d48', fontSize: 13 }}>⚠️ {transferError}</div>}
        </Card>
      )}

      {can(myRole, 'team:audit') && (
        <Card>
          <button onClick={loadEvents} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            color: t.primary, fontWeight: 700, fontSize: 14,
          }}>{eventsOpen ? '– Masquer le journal d’activité' : '+ Journal d’activité'}</button>
          {eventsOpen && (
            <div style={{ marginTop: 14 }}>
              {events.length === 0 && <div style={{ fontSize: 13, color: t.textMuted }}>Aucun événement.</div>}
              {events.map((ev) => (
                <Row key={ev.id}>
                  <div style={{ flex: 1, fontSize: 13 }}>{EVENT_LABEL[ev.eventType] || ev.eventType}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>{new Date(ev.createdAt).toLocaleString('fr-FR')}</div>
                </Row>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
