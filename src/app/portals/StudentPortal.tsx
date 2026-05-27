import { useState, useEffect, useRef } from 'react';
import { UserPlus, LogOut, Upload, X, CheckCircle, AlertTriangle, ShieldOff, ShieldCheck, Plus, Trash2, Loader2, RefreshCw, KeyRound, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';

const BG     = '#F5F0E8';
const CARD   = '#F8F4EE';
const DARK   = '#030213';
const MUTED  = '#717182';
const BORDER = 'rgba(0,0,0,0.1)';
const INPUT  = '#EDE7DC';

const VISITOR_CAP = 4;

// API shape from GET /api/student/visitors
interface ApiVisitor {
  link_id:       string;
  is_active:     boolean;
  registered_at: string;
  visitor_id:    string;
  name:          string;
  email:         string;
  photo_url:     string | null;
  code_active:   boolean;
  phones:        string[];
}

// Local UI shape
interface Visitor {
  linkId:       string;
  visitorId:    string;
  name:         string;
  phones:       string[];
  email:        string;
  photo:        string | null;
  codeActive:   boolean;   // admin control (code_active)
  linkActive:   boolean;   // student's own link (is_active)
  registeredAt: string;
}

function mapVisitor(v: ApiVisitor): Visitor {
  return {
    linkId:       v.link_id,
    visitorId:    v.visitor_id,
    name:         v.name,
    phones:       v.phones,
    email:        v.email,
    photo:        v.photo_url,
    codeActive:   v.code_active,
    linkActive:   v.is_active,
    registeredAt: new Date(v.registered_at).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }),
  };
}

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

function Avatar({ name, photo, size = 44 }: { name: string; photo: string | null; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colorIdx = name.charCodeAt(0) % AVATAR_COLORS.length;
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: AVATAR_COLORS[colorIdx], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0 }}>
      {initials}
    </div>
  );
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
    const { ok, data } = await api.put<{ ok: boolean; error?: string }>('/auth/password', { currentPassword: current, newPassword: next });
    setLoading(false);
    if (!ok) return setError((data as Record<string, string>).error ?? 'Failed to change password.');
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
  studentName: string;
  matricNo:    string;
  onSignOut:   () => void;
};

export default function StudentPortal({ institution, studentName, matricNo, onSignOut }: Props) {
  const [visitors,      setVisitors]      = useState<Visitor[]>([]);
  const [slotsUsed,     setSlotsUsed]     = useState(0);
  const [portalOpen,    setPortalOpen]    = useState(true);
  const [loadingList,   setLoadingList]   = useState(true);
  const [showChangePwd, setShowChangePwd] = useState(false);

  const [showForm,          setShowForm]          = useState(false);
  const [confirmPending,    setConfirmPending]     = useState(false);
  const [successMsg,        setSuccessMsg]         = useState('');
  const [globalError,       setGlobalError]        = useState('');
  const [deactivateTarget,  setDeactivateTarget]   = useState<string | null>(null);
  const [reactivateTarget,  setReactivateTarget]   = useState<string | null>(null);
  const [actionLoading,     setActionLoading]      = useState<string | null>(null);

  // Form state
  const [name,      setName]      = useState('');
  const [phones,    setPhones]    = useState<string[]>(['']);
  const [email,     setEmail]     = useState('');
  const [photo,     setPhoto]     = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load visitors on mount ───────────────────────────────────────────────
  const loadVisitors = async () => {
    setLoadingList(true);
    const { ok, data } = await api.get<{
      portalOpen: boolean;
      slotsUsed:  number;
      slotsMax:   number;
      visitors:   ApiVisitor[];
    }>('/student/visitors');
    if (ok) {
      setPortalOpen(data.portalOpen ?? true);
      setSlotsUsed(data.slotsUsed ?? 0);
      setVisitors((data.visitors ?? []).map(mapVisitor));
    } else {
      setGlobalError((data as Record<string, string>).error ?? 'Failed to load visitors.');
    }
    setLoadingList(false);
  };

  useEffect(() => { loadVisitors(); }, []);

  const canRegister = slotsUsed < VISITOR_CAP && portalOpen;
  const activeCount = visitors.filter(v => v.linkActive && v.codeActive).length;

  // ── Photo ────────────────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Phone helpers ────────────────────────────────────────────────────────
  const updatePhone = (idx: number, val: string) => setPhones(p => p.map((ph, i) => i === idx ? val : ph));
  const addPhone    = () => setPhones(p => [...p, '']);
  const removePhone = (idx: number) => setPhones(p => p.length > 1 ? p.filter((_, i) => i !== idx) : p);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmitClick = () => {
    setFormError('');
    if (!name.trim())  return setFormError('Visitor name is required.');
    const cleanPhones = phones.map(p => p.trim()).filter(Boolean);
    if (!cleanPhones.length) return setFormError('At least one phone number is required.');
    if (!email.trim() || !email.includes('@')) return setFormError('A valid email address is required.');
    setConfirmPending(true);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    const cleanPhones = phones.map(p => p.trim()).filter(Boolean);
    const { ok, data } = await api.post<{ ok: boolean; visitor: ApiVisitor; message: string; error?: string }>(
      '/student/visitors',
      { name: name.trim(), email: email.trim(), phones: cleanPhones, photoUrl: photo ?? undefined },
    );
    setSubmitting(false);
    setConfirmPending(false);

    if (!ok) {
      setFormError((data as Record<string, string>).error ?? 'Registration failed.');
      return;
    }

    setVisitors(v => [mapVisitor(data.visitor), ...v]);
    setSlotsUsed(s => s + 1);
    setShowForm(false);
    setName(''); setPhones(['']); setEmail(''); setPhoto(null);
    setSuccessMsg(data.message || 'Visitor registered successfully.');
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  // ── Deactivate (student link) ────────────────────────────────────────────
  const handleDeactivate = async (linkId: string) => {
    setActionLoading(linkId);
    const { ok, data } = await api.del<{ ok: boolean; error?: string }>(`/student/visitors/${linkId}`);
    setActionLoading(null);
    setDeactivateTarget(null);
    if (!ok) {
      setGlobalError((data as Record<string, string>).error ?? 'Could not deactivate visitor.');
      setTimeout(() => setGlobalError(''), 5000);
      return;
    }
    setVisitors(v => v.map(x => x.linkId === linkId ? { ...x, linkActive: false } : x));
    setSuccessMsg("Visitor's link deactivated. You can reactivate them at any time.");
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // ── Reactivate ───────────────────────────────────────────────────────────
  const handleReactivate = async (linkId: string) => {
    setActionLoading(linkId);
    const { ok, data } = await api.patch<{ ok: boolean; error?: string }>(`/student/visitors/${linkId}/reactivate`, {});
    setActionLoading(null);
    setReactivateTarget(null);
    if (!ok) {
      setGlobalError((data as Record<string, string>).error ?? 'Could not reactivate visitor.');
      setTimeout(() => setGlobalError(''), 5000);
      return;
    }
    setVisitors(v => v.map(x => x.linkId === linkId ? { ...x, linkActive: true } : x));
    setSuccessMsg("Visitor reactivated successfully.");
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const inputSt: React.CSSProperties = { backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.6rem 0.85rem', width: '100%', color: DARK, outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' };
  const labelSt: React.CSSProperties = { display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.8rem', color: DARK, textTransform: 'uppercase', letterSpacing: '0.04em' };

  const confirmVisitor = visitors.find(v => v.linkId === deactivateTarget || v.linkId === reactivateTarget);

  return (
    <div style={{ maxWidth: 740 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: DARK, marginBottom: '0.2rem' }}>
            Welcome, {studentName.split(' ')[0] || 'Student'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: MUTED }}>{matricNo} · {institution.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadVisitors} className="flex items-center gap-1.5 hover:opacity-70 transition" style={{ fontSize: '0.82rem', color: MUTED, background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
            <RefreshCw size={12} />
          </button>
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

      {/* Portal closed banner */}
      {!portalOpen && (
        <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#854d0e', fontSize: '0.87rem' }}>
          <AlertTriangle size={15} /> The visitor registration portal is currently closed by your institution's admin.
        </div>
      )}

      {/* Slot counter */}
      <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.78rem', color: MUTED, marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Semester Visitor Slots — {slotsUsed}/{VISITOR_CAP} used
          </p>
          <div className="flex items-center gap-2">
            {Array.from({ length: VISITOR_CAP }).map((_, i) => {
              const v = visitors[i];
              const bg = !v ? INPUT : (v.linkActive && v.codeActive) ? '#3b82f6' : MUTED;
              return <div key={i} style={{ width: 28, height: 8, borderRadius: 4, backgroundColor: bg }} />;
            })}
            <span style={{ fontSize: '0.78rem', color: MUTED, marginLeft: '0.25rem' }}>
              {activeCount} active · {slotsUsed - activeCount} inactive
            </span>
          </div>
        </div>
        <button
          onClick={() => { if (canRegister) { setShowForm(true); setFormError(''); } }}
          disabled={!canRegister}
          className="flex items-center gap-2 transition"
          style={{ backgroundColor: canRegister ? DARK : MUTED, color: '#fff', border: 'none', borderRadius: '0.6rem', padding: '0.55rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, cursor: canRegister ? 'pointer' : 'not-allowed', opacity: canRegister ? 1 : 0.6 }}
        >
          <UserPlus size={15} />
          {!portalOpen ? 'Portal Closed' : slotsUsed >= VISITOR_CAP ? 'Semester Cap Reached' : 'Register Visitor'}
        </button>
      </div>

      {/* Toasts */}
      {successMsg && (
        <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#166534', fontSize: '0.87rem' }}>
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}
      {globalError && (
        <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#991b1b', fontSize: '0.87rem' }}>
          <AlertTriangle size={16} /> {globalError}
        </div>
      )}

      {/* Loading */}
      {loadingList && (
        <div className="flex items-center justify-center gap-2" style={{ padding: '3rem', color: MUTED }}>
          <Loader2 size={20} className="animate-spin" /> Loading your visitors…
        </div>
      )}

      {/* Registration form */}
      {showForm && (
        <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div className="flex items-center justify-between mb-4">
            <h4 style={{ fontWeight: 700, color: DARK }}>Register New Visitor</h4>
            <button onClick={() => { setShowForm(false); setFormError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}><X size={18} /></button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label style={labelSt}>Full Name *</label>
                <input style={inputSt} placeholder="e.g. Mrs. Folake Adewale" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label style={labelSt}>Email Address *</label>
                <input style={inputSt} type="email" placeholder="visitor@email.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={labelSt}>Phone Number(s) * <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: MUTED }}>(at least one required)</span></label>
              <div className="space-y-2">
                {phones.map((ph, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input style={{ ...inputSt, flex: 1 }} placeholder="+234 800 000 0000" value={ph} onChange={e => updatePhone(i, e.target.value)} />
                    {phones.length > 1 && (
                      <button onClick={() => removePhone(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '0.4rem', flexShrink: 0 }}><Trash2 size={15} /></button>
                    )}
                  </div>
                ))}
                <button onClick={addPhone} className="flex items-center gap-1.5 hover:opacity-70 transition" style={{ fontSize: '0.8rem', color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0' }}>
                  <Plus size={13} /> Add another phone number
                </button>
              </div>
            </div>
            <div>
              <label style={labelSt}>Photo (optional)</label>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 hover:opacity-70 transition" style={{ ...inputSt, cursor: 'pointer', justifyContent: 'center', color: MUTED, display: 'flex' }}>
                {photo ? (
                  <><img src={photo} alt="preview" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} /> Photo selected — click to change</>
                ) : (
                  <><Upload size={14} /> Upload photo</>
                )}
              </button>
            </div>
          </div>
          {formError && (
            <div className="flex items-center gap-2 mt-3" style={{ color: '#d4183d', fontSize: '0.82rem' }}>
              <AlertTriangle size={14} /> {formError}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-5">
            <button onClick={() => { setShowForm(false); setFormError(''); }} style={{ padding: '0.55rem 1.2rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontSize: '0.87rem' }}>Cancel</button>
            <button onClick={handleSubmitClick} style={{ padding: '0.55rem 1.2rem', borderRadius: '0.5rem', backgroundColor: DARK, color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.87rem' }}>Submit</button>
          </div>
        </div>
      )}

      {/* Visitor list */}
      {!loadingList && (
        <div className="space-y-3">
          {visitors.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: MUTED }}>
              <UserPlus size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
              <p>No visitors registered yet. You have {VISITOR_CAP} slots this semester.</p>
            </div>
          )}
          {visitors.map(v => {
            const fullyActive = v.linkActive && v.codeActive;
            const adminBlocked = v.linkActive && !v.codeActive;
            const border = adminBlocked ? '1px solid rgba(212,24,61,0.3)' : `1px solid ${BORDER}`;
            return (
              <div key={v.linkId} style={{ backgroundColor: CARD, border, borderRadius: '0.875rem', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', opacity: fullyActive ? 1 : 0.65 }}>
                <Avatar name={v.name} photo={v.photo} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontWeight: 600, color: DARK, fontSize: '0.95rem' }}>{v.name}</span>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '2rem',
                      backgroundColor: fullyActive ? '#dcfce7' : adminBlocked ? '#fee2e2' : INPUT,
                      color: fullyActive ? '#166534' : adminBlocked ? '#991b1b' : MUTED,
                    }}>
                      {fullyActive ? 'Active' : adminBlocked ? 'Suspended by admin' : 'Deactivated'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: MUTED, marginTop: '0.1rem' }}>{v.email}</p>
                  <p style={{ fontSize: '0.78rem', color: MUTED }}>{v.phones.join(' · ')}</p>
                  <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: '0.25rem' }}>Registered {v.registeredAt}</p>
                </div>
                <div className="flex-shrink-0">
                  {actionLoading === v.linkId ? (
                    <Loader2 size={16} className="animate-spin" style={{ color: MUTED }} />
                  ) : v.linkActive ? (
                    !adminBlocked && (
                      <button onClick={() => setDeactivateTarget(v.linkId)} className="flex items-center gap-1.5 flex-shrink-0 hover:opacity-70 transition" style={{ fontSize: '0.78rem', color: '#d4183d', background: 'none', border: '1px solid rgba(212,24,61,0.25)', borderRadius: '0.4rem', padding: '0.35rem 0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <ShieldOff size={12} /> Deactivate
                      </button>
                    )
                  ) : (
                    <button onClick={() => setReactivateTarget(v.linkId)} className="flex items-center gap-1.5 flex-shrink-0 hover:opacity-70 transition" style={{ fontSize: '0.78rem', color: '#059669', background: 'none', border: '1px solid rgba(5,150,105,0.3)', borderRadius: '0.4rem', padding: '0.35rem 0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <ShieldCheck size={12} /> Reactivate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm submit dialog */}
      {confirmPending && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: CARD, borderRadius: '1rem', padding: '2rem', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={22} color="#d4183d" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h4 style={{ fontWeight: 700, color: DARK, marginBottom: '0.5rem' }}>Confirm Visitor Registration</h4>
                <p style={{ fontSize: '0.87rem', color: MUTED, lineHeight: 1.6 }}>
                  The information below <strong style={{ color: DARK }}>cannot be edited</strong> after submission.
                </p>
              </div>
            </div>
            <div style={{ backgroundColor: BG, borderRadius: '0.5rem', padding: '0.875rem', marginBottom: '1.25rem', fontSize: '0.87rem', lineHeight: 1.8 }}>
              <p style={{ color: DARK }}><strong>Name:</strong> {name}</p>
              <p style={{ color: DARK }}><strong>Phone(s):</strong> {phones.filter(Boolean).join(', ')}</p>
              <p style={{ color: DARK }}><strong>Email:</strong> {email}</p>
            </div>
            {formError && <p style={{ color: '#d4183d', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{formError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setConfirmPending(false)} disabled={submitting} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleConfirm} disabled={submitting} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', backgroundColor: DARK, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {deactivateTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: CARD, borderRadius: '1rem', padding: '2rem', maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h4 style={{ fontWeight: 700, color: DARK, marginBottom: '0.5rem' }}>Deactivate Visitor?</h4>
            <p style={{ fontSize: '0.87rem', color: MUTED, marginBottom: '0.5rem', lineHeight: 1.6 }}>
              <strong style={{ color: DARK }}>{confirmVisitor?.name}</strong>'s code will be invalid at the barricade.
            </p>
            <p style={{ fontSize: '0.82rem', color: MUTED, marginBottom: '1.25rem' }}>You can reactivate their code at any time.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeactivateTarget(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => handleDeactivate(deactivateTarget!)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', backgroundColor: '#d4183d', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Deactivate</button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate confirm */}
      {reactivateTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: CARD, borderRadius: '1rem', padding: '2rem', maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h4 style={{ fontWeight: 700, color: DARK, marginBottom: '0.5rem' }}>Reactivate Visitor?</h4>
            <p style={{ fontSize: '0.87rem', color: MUTED, marginBottom: '1.25rem', lineHeight: 1.6 }}>
              <strong style={{ color: DARK }}>{confirmVisitor?.name}</strong>'s code will be valid at the barricade again.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setReactivateTarget(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => handleReactivate(reactivateTarget!)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', backgroundColor: '#059669', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Reactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
