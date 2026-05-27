import { useState, useEffect, useCallback } from 'react';
import { LogOut, Bell, CheckCheck, Clock, DoorOpen, AlertCircle, Loader2, RefreshCw, KeyRound, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';

const CARD   = '#F8F4EE';
const DARK   = '#030213';
const MUTED  = '#717182';
const BORDER = 'rgba(0,0,0,0.1)';
const INPUT  = '#EDE7DC';

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colorIdx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: AVATAR_COLORS[colorIdx], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.34, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ── Change Password inline form ───────────────────────────────────────────────
function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [cur,     setCur]     = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState('');
  const [err,     setErr]     = useState('');

  const submit = async () => {
    setErr(''); setMsg('');
    if (!cur || !next || !confirm) return setErr('All fields are required.');
    if (next.length < 6)           return setErr('New password must be at least 6 characters.');
    if (next !== confirm)           return setErr('New passwords do not match.');
    setLoading(true);
    const { ok, data } = await api.put<{ ok: boolean; message?: string; error?: string }>('/auth/password', { currentPassword: cur, newPassword: next });
    setLoading(false);
    if (!ok) return setErr((data as Record<string,string>).error ?? 'Failed to change password.');
    setMsg('Password changed successfully.');
    setTimeout(onClose, 1500);
  };

  const inp = (val: string, setter: (v: string) => void, placeholder: string) => (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={val} placeholder={placeholder}
        onChange={e => setter(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        style={{ backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.55rem 2.5rem 0.55rem 0.8rem', width: '100%', fontSize: '0.85rem', color: DARK, outline: 'none' }} />
    </div>
  );

  return (
    <div style={{ marginTop: '1rem', backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.75rem', padding: '1rem 1.1rem' }}>
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontWeight: 600, fontSize: '0.87rem', color: DARK }}>Change Password</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setShow(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>✕</button>
        </div>
      </div>
      <div className="space-y-2">
        {inp(cur,     setCur,     'Current password')}
        {inp(next,    setNext,    'New password (min 6 chars)')}
        {inp(confirm, setConfirm, 'Confirm new password')}
      </div>
      {err && <p style={{ color: '#d4183d', fontSize: '0.78rem', marginTop: '0.5rem' }}>{err}</p>}
      {msg && <p style={{ color: '#059669', fontSize: '0.78rem', marginTop: '0.5rem' }}>{msg}</p>}
      <button onClick={submit} disabled={loading}
        style={{ marginTop: '0.75rem', width: '100%', backgroundColor: DARK, color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.55rem', fontSize: '0.85rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
        {loading ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Save Password'}
      </button>
    </div>
  );
}

interface Alert {
  alertId:             string;
  visitId:             string;
  alertStatus:         'pending' | 'acknowledged';
  hallCheckoutDone:    boolean;
  createdAt:           string;
  visitorName:         string;
  visitorEmail:        string;
  studentName:         string;
  matricNo:            string;
  room:                string;
  hall:                string;
  arrivalTime:         string;
  hallCheckoutTime:    string | null;
  visitStatus:         string;
  securityOfficerName: string;
}

type Props = {
  institution: { id: string; name: string };
  officerName: string;
  hall:        string;
  onSignOut:   () => void;
};

export default function HallOfficerPortal({ institution, officerName, hall, onSignOut }: Props) {
  const [alerts,           setAlerts]          = useState<Alert[]>([]);
  const [pendingCheckouts, setPendingCheckouts] = useState(0);
  const [loading,          setLoading]         = useState(true);
  const [actionLoading,    setActionLoading]   = useState<string | null>(null);
  const [error,            setError]           = useState('');
  const [lastRefreshed,    setLastRefreshed]   = useState<Date | null>(null);
  const [showChangePwd,    setShowChangePwd]   = useState(false);

  // ── Load alerts ──────────────────────────────────────────────────────────
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api.get<{ pendingHallCheckouts: number; alerts: Alert[] }>('/hall-officer/alerts');
    setLoading(false);
    if (!ok) {
      setError((data as Record<string, string>).error ?? 'Failed to load alerts.');
      return;
    }
    setAlerts(data.alerts ?? []);
    setPendingCheckouts(data.pendingHallCheckouts ?? 0);
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // ── 30-second auto-poll ──────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => { loadAlerts(); }, 30_000);
    return () => clearInterval(id);
  }, [loadAlerts]);

  // ── Acknowledge ──────────────────────────────────────────────────────────
  const handleAcknowledge = async (alertId: string) => {
    setActionLoading(alertId);
    const { ok, data } = await api.put<{ ok: boolean; error?: string }>(`/hall-officer/alerts/${alertId}/acknowledge`, {});
    setActionLoading(null);
    if (!ok) {
      setError((data as Record<string, string>).error ?? 'Could not acknowledge alert.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    // Mark ALL pending alerts as acknowledged (backend auto-dismissed others for same visit)
    setAlerts(a => a.map(x => x.alertStatus === 'pending' && x.visitId === a.find(r => r.alertId === alertId)?.visitId
      ? { ...x, alertStatus: 'acknowledged' }
      : x.alertId === alertId ? { ...x, alertStatus: 'acknowledged' } : x
    ));
  };

  // ── Hall checkout ─────────────────────────────────────────────────────────
  const handleHallCheckout = async (alertId: string) => {
    setActionLoading(alertId);
    const { ok, data } = await api.put<{ ok: boolean; hallCheckoutTime: string; error?: string }>(
      `/hall-officer/alerts/${alertId}/hall-checkout`, {},
    );
    setActionLoading(null);
    if (!ok) {
      setError((data as Record<string, string>).error ?? 'Could not record hall checkout.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    setAlerts(a => a.map(x =>
      x.alertId === alertId
        ? { ...x, hallCheckoutDone: true, hallCheckoutTime: data.hallCheckoutTime, visitStatus: 'at_hall' }
        : x,
    ));
    setPendingCheckouts(p => Math.max(0, p - 1));
  };

  const newCount = alerts.filter(a => a.alertStatus === 'pending').length;

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: DARK, marginBottom: '0.2rem' }}>
            {officerName || 'Hall Officer'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: MUTED }}>
            Hall Officer · {hall} · {institution.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#10b981' }} />
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>On duty</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setShowChangePwd(s => !s)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
            <KeyRound size={13} /> Password
          </button>
          <button onClick={loadAlerts} disabled={loading} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
          <button onClick={onSignOut} className="flex items-center gap-2 hover:opacity-70 transition" style={{ fontSize: '0.82rem', color: MUTED, background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>

      {/* Change password form */}
      {showChangePwd && <ChangePasswordForm onClose={() => setShowChangePwd(false)} />}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#991b1b', fontSize: '0.87rem' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <div className="flex items-center gap-2" style={{ backgroundColor: newCount > 0 ? '#fef9c3' : CARD, border: `1px solid ${newCount > 0 ? '#fde047' : BORDER}`, borderRadius: '0.5rem', padding: '0.5rem 1rem' }}>
          <Bell size={15} color={newCount > 0 ? '#ca8a04' : MUTED} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: newCount > 0 ? '#ca8a04' : MUTED }}>
            {newCount > 0 ? `${newCount} new arrival${newCount > 1 ? 's' : ''}` : 'No new arrivals'}
          </span>
        </div>
        {pendingCheckouts > 0 && (
          <div className="flex items-center gap-2" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', padding: '0.5rem 1rem' }}>
            <AlertCircle size={15} color="#c2410c" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#c2410c' }}>
              {pendingCheckouts} pending hall checkout{pendingCheckouts > 1 ? 's' : ''}
            </span>
          </div>
        )}
        <span style={{ fontSize: '0.8rem', color: MUTED }}>
          {alerts.length} total · auto-refreshes every 30s
          {lastRefreshed && ` · last at ${lastRefreshed.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
        </span>
      </div>

      {/* Loading state */}
      {loading && alerts.length === 0 && (
        <div className="flex items-center justify-center gap-2" style={{ padding: '3rem', color: MUTED }}>
          <Loader2 size={20} className="animate-spin" /> Loading alerts…
        </div>
      )}

      {/* Alerts list */}
      <div className="space-y-3">
        {!loading && alerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: MUTED }}>
            <Bell size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
            <p>No visitor arrivals today.</p>
          </div>
        )}

        {alerts.map(alert => {
          const isNew       = alert.alertStatus === 'pending';
          const isStage2    = alert.alertStatus === 'acknowledged' && !alert.hallCheckoutDone;
          const isDone      = alert.hallCheckoutDone;
          const borderColor = isNew ? '#fde047' : isStage2 ? '#fed7aa' : BORDER;
          const isActing    = actionLoading === alert.alertId;

          return (
            <div key={alert.alertId} style={{ backgroundColor: CARD, border: `1px solid ${borderColor}`, borderRadius: '0.875rem', padding: '1.25rem', transition: 'all 0.2s' }}>

              {/* Stage 1 banner */}
              {isNew && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: '0.4rem', padding: '0.5rem 0.75rem', marginBottom: '0.875rem', fontSize: '0.83rem', color: '#854d0e', lineHeight: 1.6 }}>
                  <strong>{alert.visitorName}</strong> is coming to your hall.
                  {' '}Call <strong>{alert.studentName}</strong> in Room <strong>{alert.room}</strong> to wait at the visit room.
                  {' '}Accord the visitor with necessary respect.
                </div>
              )}

              <div className="flex items-center gap-3">
                <Avatar name={alert.visitorName} size={44} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, color: DARK, marginBottom: '0.1rem' }}>{alert.visitorName}</p>
                  <p style={{ fontSize: '0.8rem', color: MUTED }}>
                    Visiting <strong style={{ color: DARK }}>{alert.studentName}</strong> · Room {alert.room}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span style={{ fontSize: '0.72rem', color: MUTED, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={11} /> Arrived {alert.arrivalTime}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: MUTED }}>
                      Checked in by {alert.securityOfficerName}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <div className="flex-shrink-0">
                  {isActing ? (
                    <Loader2 size={18} className="animate-spin" style={{ color: MUTED }} />
                  ) : isNew ? (
                    <button onClick={() => handleAcknowledge(alert.alertId)} style={{ backgroundColor: DARK, color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                      Acknowledge
                    </button>
                  ) : isStage2 ? (
                    <button onClick={() => handleHallCheckout(alert.alertId)} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ backgroundColor: '#ea580c', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                      <DoorOpen size={14} /> Hall Checkout
                    </button>
                  ) : isDone ? (
                    <div className="flex items-center gap-1.5" style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                      <CheckCheck size={14} color="#059669" /> Done
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Footer */}
              {alert.alertStatus === 'acknowledged' && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${BORDER}`, fontSize: '0.75rem', color: MUTED }}>
                  {isDone ? (
                    <span>
                      Visitor left hall at <strong style={{ color: DARK }}>{alert.hallCheckoutTime}</strong>.
                      {' '}Security will record the barricade checkout.
                    </span>
                  ) : (
                    <span style={{ color: '#c2410c' }}>
                      Alert acknowledged — tap <strong>Hall Checkout</strong> once the visitor leaves the hall.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ marginTop: '1.5rem', backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.75rem', padding: '0.875rem 1.1rem' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>How it works</p>
        <div className="space-y-1.5">
          {[
            { dot: '#fde047', text: 'New arrival — acknowledge and notify the student' },
            { dot: '#fed7aa', text: 'Visitor is in the hall — tap Hall Checkout when they leave' },
            { dot: '#d1fae5', text: 'Hall checkout done — security completes the barricade checkout' },
          ].map(({ dot, text }) => (
            <div key={text} className="flex items-center gap-2">
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: dot, border: `1px solid rgba(0,0,0,0.15)`, flexShrink: 0 }} />
              <span style={{ fontSize: '0.77rem', color: MUTED }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
