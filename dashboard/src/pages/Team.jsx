import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { fmt } from '../merchant'
import { Card, Button, Field, Input, Select } from '../ui'
import { useTeamApi } from '../team/useTeamApi'
import { errorMessage } from '../auth/session'
import { assignableRoles, can, canActOn, invitableRoles } from '../team/permissions'

const STATUS_COLOR = { ACTIVE: '#16a34a', SUSPENDED: '#d97706', INVITED: '#64748b', REMOVED: '#dc2626' }

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
  const { t: tr } = useT()
  return <Pill color={role === 'OWNER' ? t.primary : '#475569'}>{tr(`team.role.${role}`)}</Pill>
}

function StatusBadge({ status }) {
  const { t: tr } = useT()
  return <Pill color={STATUS_COLOR[status] || '#64748b'}>{tr(`team.status.${status}`)}</Pill>
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
  const [inviteRole, setInviteRole] = useState('CASHIER')
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
        if (!cancelled) setError(errorMessage(err, tr('team.error.load')))
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
    catch (err) { setError(errorMessage(err, tr('team.error.action'))) }
    finally { setBusyId(null) }
  }

  const handleChangeRole = withBusy('role', (memberId, role) => teamApi.changeRole(merchantId, memberId, role))
  const handleSuspend = (memberId) => withBusy(memberId, () => teamApi.suspend(merchantId, memberId))()
  const handleReactivate = (memberId) => withBusy(memberId, () => teamApi.reactivate(merchantId, memberId))()
  const handleRemove = (memberId) => {
    if (!window.confirm(tr('team.removeConfirm'))) return
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
      setInviteError(errorMessage(err, tr('team.error.invite')))
    } finally { setInviteBusy(false) }
  }

  const handleTransfer = async () => {
    if (!transferTarget) return
    if (!window.confirm(tr('team.transferConfirm'))) return
    setTransferBusy(true); setTransferError(null)
    try {
      await teamApi.transferOwnership(merchantId, transferTarget)
      setMyRole('ADMIN'); setTransferTarget('')
      await load(merchantId, 'ADMIN')
    } catch (err) {
      setTransferError(errorMessage(err, tr('team.error.transfer')))
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
        <Card>{tr('team.noMerchant')}</Card>
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
          }}>{inviteOpen ? tr('team.invite.close') : tr('team.invite.open')}</button>
          {inviteOpen && (
            <form onSubmit={handleInvite} style={{ marginTop: 14 }}>
              <Field label={tr('team.invite.contact')}>
                <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder={tr('team.invite.placeholder')} required />
              </Field>
              <Field label={tr('team.invite.role')}>
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {invitableRoles(myRole).map((r) => <option key={r} value={r}>{tr(`team.role.${r}`)}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={inviteBusy}>{inviteBusy ? tr('team.invite.sending') : tr('team.invite.send')}</Button>
              {inviteError && <div style={{ marginTop: 10, color: '#e11d48', fontSize: 13 }}>⚠️ {inviteError}</div>}
            </form>
          )}
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{fmt(tr('team.members'), { n: members.length })}</div>
        {members.map((m) => {
          const editable = canActOn(myRole, m.role)
          return (
            <Row key={m.id}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.fullName || m.email || m.userId}
                </div>
                {(m.email || m.phone) && <div style={{ fontSize: 12, color: t.textMuted }}>{m.email || m.phone}</div>}
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
                    {assignableRoles(myRole).map((r) => <option key={r} value={r}>{tr(`team.role.${r}`)}</option>)}
                  </Select>
                  {m.status === 'ACTIVE' && (
                    <Button variant="ghost" disabled={busyId === m.id} onClick={() => handleSuspend(m.id)}>{tr('team.suspend')}</Button>
                  )}
                  {m.status === 'SUSPENDED' && (
                    <Button variant="ghost" disabled={busyId === m.id} onClick={() => handleReactivate(m.id)}>{tr('team.reactivate')}</Button>
                  )}
                  <Button variant="ghost" disabled={busyId === m.id} onClick={() => handleRemove(m.id)}>{tr('team.remove')}</Button>
                </>
              )}
            </Row>
          )
        })}
      </Card>

      {can(myRole, 'team:invite') && invitations.filter((i) => i.status === 'PENDING').length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{tr('team.pending')}</div>
          {invitations.filter((i) => i.status === 'PENDING').map((inv) => (
            <Row key={inv.id}>
              <div style={{ flex: '1 1 200px', fontSize: 13 }}>{inv.email || inv.phone}</div>
              <RoleBadge role={inv.role} />
              <div style={{ fontSize: 12, color: t.textMuted }}>
                {fmt(tr('team.expires'), { date: new Date(inv.expiresAt).toLocaleDateString('fr-FR') })}
              </div>
              <Button variant="ghost" disabled={busyId === inv.id} onClick={() => handleRevoke(inv.id)}>{tr('team.revoke')}</Button>
            </Row>
          ))}
        </Card>
      )}

      {myRole === 'OWNER' && eligibleTransferTargets.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#fca5a5' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{tr('team.transfer.title')}</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
            {tr('team.transfer.intro')}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} style={{ maxWidth: 280 }}>
              <option value="">{tr('team.transfer.choose')}</option>
              {eligibleTransferTargets.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>
              ))}
            </Select>
            <Button variant="ghost" disabled={!transferTarget || transferBusy} onClick={handleTransfer}>
              {transferBusy ? tr('team.transfer.busy') : tr('team.transfer.submit')}
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
          }}>{eventsOpen ? tr('team.log.hide') : tr('team.log.show')}</button>
          {eventsOpen && (
            <div style={{ marginTop: 14 }}>
              {events.length === 0 && <div style={{ fontSize: 13, color: t.textMuted }}>{tr('team.log.none')}</div>}
              {events.map((ev) => (
                <Row key={ev.id}>
                  <div style={{ flex: 1, fontSize: 13 }}>{tr(`team.event.${ev.eventType}`)}</div>
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
