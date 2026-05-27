import { useState } from 'react';
import { LogOut, Search, CheckCircle2, Clock, User, ShieldAlert, Hourglass, Loader2, RefreshCw, KeyRound, Eye, EyeOff, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';

const CARD   = '#F8F4EE';
const DARK   = '#030213';
const MUTED  = '#717182';
const BORDER = 'rgba(0,0,0,0.1)';
const INPUT  = '#EDE7DC';

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];

function Avatar({ name, photo, size = 56 }: { name: string; photo?: string | null; size?: number }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colorIdx = name.charCodeAt(0) % AVATAR_COLORS.length;
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: AVATAR_COLORS[colorIdx], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.34, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// API types
interface ApiHost {
  linkId:      string;
  studentId:   string;
  studentName: string;
  matricNo:    string;
  hall:        string;
  room:        string;
  linkActive:  boolean;
  visitId:     string | null;
  visitStatus: string | null;
  checkInTime: string | null;
}

interface ApiVerifyResult {
  visitor: {
    id:               string;
    name:             string;
    email:            string;
    photoUrl:         string | null;
    verificationCode: string;
    codeActive:       boolean;
    phones:           string[];
  };
  hasOpenVisit: boolean;
  openVisitId:  string | null;
  openStatus:   string | null;
  hosts:        ApiHost[];
}

// ── Change Password form ─────────────────────────────────────────────────────
function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [current,     setCurrent]     = useState('');
  const [next,        setNext]        = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext,    setShowNext]    = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [loading,     setLoading]     = useState(false);

  const lSt: React.CSSProperties = { display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.8rem', color: DARK, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const iSt: React.CSSProperties = { backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.6rem 0.85rem', width: '100%', color: DARK, outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' };

  const handleSubmit = async () => {
    setError('');
    if (!current || !next || !confirm) return setError('All fields are required.');
    if (next.length < 6) return setError('New password must be at least 6 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setLoading(true);
    const res = await fetch('/api/auth/password', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) return setError(body.error ?? 'Failed to change password.');
    setSuccess('Password changed successfully.');
    setTimeout(onClose, 2000);
  };

  return (
    <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KeyRound size={16} color={DARK} />
          <h4 style={{ fontWeight: 700, color: DARK }}>Change Password</h4>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}><X size={18} /></button>
      </div>
      {success ? (
        <div className="flex items-center gap-2" style={{ color: '#166534', fontSize: '0.87rem' }}>
          <CheckCircle size={16} /> {success}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label style={lSt}>Current Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showCurrent ? 'text' : 'password'} style={{ ...iSt, paddingRight: '2.5rem' }} placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} />
              <button type="button" onClick={() => setShowCurrent(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, display: 'flex' }}>
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label style={lSt}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showNext ? 'text' : 'password'} style={{ ...iSt, paddingRight: '2.5rem' }} placeholder="At least 6 characters" value={next} onChange={e => setNext(e.target.value)} />
              <button type="button" onClick={() => setShowNext(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, display: 'flex' }}>
                {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label style={lSt}>Confirm New Password</label>
            <input type="password" style={iSt} placeholder="Re-enter new password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
          {error && (
            <div className="flex items-center gap-1.5" style={{ color: '#d4183d', fontSize: '0.82rem' }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-2">
            <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontSize: '0.87rem' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', backgroundColor: DARK, color: '#fff', border: 'none', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontSize: '0.87rem', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: loading ? 0.7 : 1 }}>
              {loading ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Save Password'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  institution: { id: string; name: string };
  officerName: string;
  onSignOut:   () => void;
};

export default function SecurityPortal({ institution, officerName, onSignOut }: Props) {
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [codeInput,    setCodeInput]    = useState('');
  const [result,       setResult]       = useState<ApiVerifyResult | null>(null);
  const [searched,     setSearched]     = useState(false);
  const [searchError,  setSearchError]  = useState('');
  const [searching,    setSearching]    = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // studentId or visitId
  const [actionError,  setActionError]  = useState('');
  const [actionMsg,    setActionMsg]    = useState('');

  // ── Verify code ─────────────────────────────────────────────────────────
  const handleSearch = async (code?: string) => {
    const trimmed = (code ?? codeInput).trim().toUpperCase();
    if (trimmed.length < 6) return setSearchError('Please enter a valid 10-character verification code.');
    setSearchError('');
    setSearching(true);
    const { ok, data } = await api.get<ApiVerifyResult>(`/security/verify/${trimmed}`);
    setSearching(false);
    setSearched(true);
    if (!ok) {
      setResult(null);
    } else {
      setResult(data);
    }
  };

  // Re-fetch after an action to get fresh visit status
  const refresh = () => handleSearch(codeInput.trim().toUpperCase());

  // ── Barricade check-in ────────────────────────────────────────────────
  const handleCheckIn = async (studentId: string) => {
    if (!result) return;
    setActionLoading(studentId);
    setActionError('');
    const { ok, data } = await api.post<{ ok: boolean; visitId: string; checkInTime: string; error?: string }>(
      '/security/visits',
      { visitorId: result.visitor.id, primaryStudentId: studentId },
    );
    setActionLoading(null);
    if (!ok) {
      setActionError((data as Record<string, string>).error ?? 'Check-in failed.');
      setTimeout(() => setActionError(''), 5000);
      return;
    }
    setActionMsg(`Check-in recorded at ${data.checkInTime}. Visitor is en route to the hall.`);
    setTimeout(() => setActionMsg(''), 5000);
    await refresh();
  };

  // ── Barricade checkout ────────────────────────────────────────────────
  const handleBarricadeCheckout = async (visitId: string) => {
    setActionLoading(visitId);
    setActionError('');
    const { ok, data } = await api.put<{ ok: boolean; checkOutTime: string; error?: string }>(
      `/security/visits/${visitId}/checkout`,
      {},
    );
    setActionLoading(null);
    if (!ok) {
      setActionError((data as Record<string, string>).error ?? 'Checkout failed.');
      setTimeout(() => setActionError(''), 5000);
      return;
    }
    setActionMsg(`Visit completed. Check-out recorded at ${data.checkOutTime}.`);
    setTimeout(() => setActionMsg(''), 5000);
    await refresh();
  };

  const resetSearch = () => {
    setCodeInput(''); setResult(null); setSearched(false);
    setSearchError(''); setActionError(''); setActionMsg('');
  };

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: DARK, marginBottom: '0.2rem' }}>
            {officerName || 'Security Officer'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: MUTED }}>Security Personnel · {institution.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#10b981' }} />
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>On duty</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowChangePwd(p => !p)} className="flex items-center gap-1.5 hover:opacity-70 transition" style={{ fontSize: '0.82rem', color: MUTED, background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
            <KeyRound size={13} /> Password
          </button>
          <button onClick={onSignOut} className="flex items-center gap-2 hover:opacity-70 transition" style={{ fontSize: '0.82rem', color: MUTED, background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>

      {/* Change password form */}
      {showChangePwd && <ChangePasswordForm onClose={() => setShowChangePwd(false)} />}

      {/* Code input */}
      <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Enter Visitor Verification Code
        </p>
        <div className="flex gap-3">
          <input
            value={codeInput}
            onChange={e => { setCodeInput(e.target.value.toUpperCase()); setSearchError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="10-character code"
            maxLength={10}
            style={{ flex: 1, backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.65rem 1rem', color: DARK, outline: 'none', fontSize: '1rem', fontFamily: 'monospace', letterSpacing: '0.1em' }}
          />
          <button onClick={() => handleSearch()} disabled={searching} style={{ backgroundColor: DARK, color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.65rem 1.25rem', cursor: searching ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', opacity: searching ? 0.7 : 1 }}>
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Verify
          </button>
          {searched && (
            <button onClick={resetSearch} style={{ backgroundColor: INPUT, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.65rem 1rem', cursor: 'pointer', fontSize: '0.87rem' }}>
              Clear
            </button>
          )}
        </div>
        {searchError && <p style={{ color: '#d4183d', fontSize: '0.82rem', marginTop: '0.5rem' }}>{searchError}</p>}
      </div>

      {/* Action toast */}
      {actionMsg && (
        <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#166534', fontSize: '0.87rem' }}>
          <CheckCircle2 size={16} /> {actionMsg}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#991b1b', fontSize: '0.87rem' }}>
          <ShieldAlert size={16} /> {actionError}
        </div>
      )}

      {/* Not found */}
      {searched && !result && !searching && (
        <div style={{ textAlign: 'center', padding: '2.5rem', backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', color: MUTED }}>
          <User size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
          <p style={{ fontWeight: 600, marginBottom: '0.25rem', color: DARK }}>No visitor found</p>
          <p style={{ fontSize: '0.85rem' }}>Code <strong style={{ fontFamily: 'monospace' }}>{codeInput}</strong> doesn't match any registered visitor.</p>
        </div>
      )}

      {/* Visitor result */}
      {result && (
        <div>
          {/* Visitor card */}
          <div style={{ backgroundColor: CARD, border: `1px solid ${result.visitor.codeActive ? BORDER : 'rgba(212,24,61,0.3)'}`, borderRadius: '0.875rem', padding: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Avatar name={result.visitor.name} photo={result.visitor.photoUrl} size={60} />
            <div style={{ flex: 1 }}>
              <h4 style={{ fontWeight: 700, color: DARK, fontSize: '1.05rem', marginBottom: '0.1rem' }}>{result.visitor.name}</h4>
              <p style={{ fontSize: '0.83rem', color: MUTED }}>{result.visitor.email}</p>
              <p style={{ fontSize: '0.83rem', color: MUTED }}>{result.visitor.phones.join(' · ')}</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: '0.7rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code</p>
              <p style={{ fontFamily: 'monospace', fontWeight: 700, color: DARK, letterSpacing: '0.08em' }}>{result.visitor.verificationCode}</p>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '2rem', display: 'inline-block', marginTop: '0.25rem', backgroundColor: result.visitor.codeActive ? '#dcfce7' : '#fee2e2', color: result.visitor.codeActive ? '#166534' : '#d4183d' }}>
                {result.visitor.codeActive ? 'Code Active' : 'Code Deactivated'}
              </span>
            </div>
            {/* Refresh button */}
            <button onClick={refresh} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.4rem', padding: '0.4rem', cursor: 'pointer', color: MUTED, display: 'flex' }}>
              <RefreshCw size={14} />
            </button>
          </div>

          {/* R6: code deactivated */}
          {!result.visitor.codeActive && (
            <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#fee2e2', border: '1px solid rgba(212,24,61,0.3)', borderRadius: '0.625rem', padding: '0.875rem 1rem', color: '#d4183d', fontSize: '0.85rem' }}>
              <ShieldAlert size={16} />
              <span>This visitor's code has been deactivated. <strong>Check-in is not permitted.</strong></span>
            </div>
          )}

          {/* R7: already inside */}
          {result.visitor.codeActive && result.hasOpenVisit && (
            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.625rem', padding: '0.875rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#9a3412' }}>
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert size={16} />
                <strong>Visitor is currently {result.openStatus === 'at_hall' ? 'leaving the hall' : 'inside the premises'}.</strong>
              </div>
              {result.openStatus === 'checked_in' && (
                <p style={{ fontSize: '0.82rem' }}>Waiting for the hall officer to record hall checkout before barricade checkout is available.</p>
              )}
              {result.openStatus === 'at_hall' && (
                <button
                  onClick={() => handleBarricadeCheckout(result.openVisitId!)}
                  disabled={actionLoading === result.openVisitId}
                  style={{ marginTop: '0.75rem', backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.2rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {actionLoading === result.openVisitId ? <Loader2 size={14} className="animate-spin" /> : null}
                  Barricade Checkout
                </button>
              )}
            </div>
          )}

          {/* Host students */}
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Registered Host Students ({result.hosts.length})
          </p>

          <div className="space-y-3">
            {result.hosts.map(h => {
              const isLoading   = actionLoading === h.studentId;
              const canCheckIn  = result.visitor.codeActive && !result.hasOpenVisit && h.linkActive;

              return (
                <div key={h.linkId} style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', opacity: h.linkActive ? 1 : 0.55 }}>
                  <Avatar name={h.studentName} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: DARK, marginBottom: '0.1rem' }}>{h.studentName}</p>
                    <p style={{ fontSize: '0.8rem', color: MUTED }}>{h.matricNo} · {h.hall}, Room {h.room}</p>
                    {!h.linkActive && (
                      <p style={{ fontSize: '0.72rem', color: '#d4183d', marginTop: '0.2rem' }}>Link deactivated by student</p>
                    )}
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {h.checkInTime && (
                        <span style={{ fontSize: '0.72rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Clock size={11} /> Check-in: {h.checkInTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex-shrink-0">
                    {isLoading ? (
                      <Loader2 size={16} className="animate-spin" style={{ color: MUTED }} />
                    ) : canCheckIn ? (
                      <button onClick={() => handleCheckIn(h.studentId)} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                        Check In
                      </button>
                    ) : result.hasOpenVisit && h.visitId ? (
                      h.visitStatus === 'checked_in' ? (
                        <div className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#854d0e', fontWeight: 600, backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '0.4rem', padding: '0.4rem 0.7rem', whiteSpace: 'nowrap' }}>
                          <Hourglass size={12} /> Awaiting hall checkout
                        </div>
                      ) : h.visitStatus === 'at_hall' ? (
                        <div className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: 600, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.4rem', padding: '0.4rem 0.7rem', whiteSpace: 'nowrap' }}>
                          Leaving hall
                        </div>
                      ) : h.visitStatus === 'completed' ? (
                        <div className="flex items-center gap-1.5" style={{ fontSize: '0.82rem', color: MUTED, fontWeight: 600 }}>
                          <CheckCircle2 size={15} color="#10b981" /> Completed
                        </div>
                      ) : null
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: MUTED }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status legend */}
          <div style={{ marginTop: '1.25rem', backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.625rem', padding: '0.875rem 1rem' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Status Guide</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem' }}>
              {[
                { dot: '#10b981', label: 'Check In',            desc: 'Record barricade entry' },
                { dot: '#854d0e', label: 'Awaiting Hall Out',   desc: 'Hall officer must record exit first' },
                { dot: '#f59e0b', label: 'Barricade Checkout',  desc: 'Visitor leaving — record barricade exit' },
                { dot: '#717182', label: 'Completed',           desc: 'Visit fully closed' },
              ].map(s => (
                <span key={s.label} style={{ fontSize: '0.72rem', color: MUTED }}>
                  <span style={{ color: s.dot, fontWeight: 600 }}>● {s.label}</span> — {s.desc}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
