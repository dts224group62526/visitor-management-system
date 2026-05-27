import { useState, useEffect } from 'react';
import { User, Shield, UserCheck, Settings, Menu, X, ArrowLeft, Eye, EyeOff, Building2, PlusCircle, Loader2 } from 'lucide-react';
import StudentPortal    from './portals/StudentPortal';
import SecurityPortal   from './portals/SecurityPortal';
import HallOfficerPortal from './portals/HallOfficerPortal';
import SchoolAdminPortal from './portals/SchoolAdminPortal';
import { RegisterWizard } from './portals/SchoolAdminPortal';

type Page = 'home' | 'student' | 'security' | 'hall-officer' | 'admin';
type Step = 'institution' | 'login' | 'portal';

const BG     = '#F5F0E8';
const CARD   = '#F8F4EE';
const DARK   = '#030213';
const MUTED  = '#717182';
const BORDER = 'rgba(0,0,0,0.1)';
const INPUT  = '#EDE7DC';

// ── Matric number formats keyed by institution.matric_format ─────────────────
const MATRIC_PATTERNS: Record<string, {
  regex: RegExp; maxLen: number; example: string; hint: string;
  transform: (v: string) => string;
}> = {
  cu: {
    regex: /^\d{2}[A-Z]{2}\d{6}$/,
    maxLen: 10,
    example: '24CG036190',
    hint: '2-digit year + 2-letter dept code + 6 digits',
    transform: v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
  },
  ui: {
    regex: /^\d{6}$/,
    maxLen: 6,
    example: '231456',
    hint: '6-digit number',
    transform: v => v.replace(/\D/g, '').slice(0, 6),
  },
  unilag: {
    regex: /^\d{9}$/,
    maxLen: 9,
    example: '090107029',
    hint: '9-digit number',
    transform: v => v.replace(/\D/g, '').slice(0, 9),
  },
  abu: {
    regex: /^U\d{2}[A-Z]{2}\d{4}$/,
    maxLen: 9,
    example: 'U12CS1006',
    hint: 'U + 2-digit year + dept code + 4 digits',
    transform: v => {
      let s = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (s.length > 0 && s[0] !== 'U') s = 'U' + s.replace(/U/g, '');
      return s.slice(0, 9);
    },
  },
};

type Institution = {
  id:            string;   // UUID from DB
  name:          string;
  abbreviation:  string;
  city:          string;
  state:         string;
  matric_format: string;
};

const PORTALS = [
  { id: 'student',      title: 'Student Portal',     description: 'Register and manage your visitors',        icon: User,      color: 'bg-blue-500'   },
  { id: 'security',     title: 'Security Personnel', description: 'Verify visitors using verification codes', icon: Shield,    color: 'bg-green-500'  },
  { id: 'hall-officer', title: 'Hall Officer',        description: 'Manage visitor arrivals to your hall',    icon: UserCheck, color: 'bg-purple-500' },
  { id: 'admin',        title: 'Admin Panel',         description: 'Database management and portal control',  icon: Settings,  color: 'bg-orange-500' },
];

// ── Password input ────────────────────────────────────────────────────────────
function PasswordInput({ value, onChange, showPwd, onToggle, onEnter, placeholder = '••••••••' }: {
  value: string; onChange: (v: string) => void;
  showPwd: boolean; onToggle: () => void; onEnter: () => void;
  placeholder?: string;
}) {
  const st: React.CSSProperties = {
    backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem',
    padding: '0.65rem 0.9rem', paddingRight: '2.8rem', width: '100%',
    color: DARK, outline: 'none', fontSize: '0.92rem',
  };
  return (
    <div style={{ position: 'relative' }}>
      <input type={showPwd ? 'text' : 'password'} value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter()}
        style={st} placeholder={placeholder} />
      <button type="button" onClick={onToggle}
        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function App() {
  const [page, setPage]               = useState<Page>('home');
  const [step, setStep]               = useState<Step>('institution');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [institution, setInstitution] = useState('');   // UUID of selected institution
  const [instDraft, setInstDraft]     = useState('');   // UUID being selected

  const [matricNo,     setMatricNo]     = useState('');
  const [staffId,      setStaffId]      = useState('');
  const [verCode,      setVerCode]      = useState('');
  const [password,     setPassword]     = useState('');
  const [adminPwd,     setAdminPwd]     = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [error,        setError]        = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [loggedInName, setLoggedInName] = useState('');
  const [loggedInHall, setLoggedInHall] = useState('');

  const [showRegister,    setShowRegister]    = useState(false);
  const [registeredBanner, setRegisteredBanner] = useState('');

  // ── Institution list loaded from API ────────────────────────────────────────
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [instLoading,  setInstLoading]  = useState(true);

  useEffect(() => {
    fetch('/api/admin/institutions', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setInstitutions(d.institutions ?? []))
      .catch(() => {})
      .finally(() => setInstLoading(false));
  }, []);

  // Refresh institution list after new institution registers
  const refreshInstitutions = () => {
    fetch('/api/admin/institutions', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setInstitutions(d.institutions ?? []))
      .catch(() => {});
  };

  const portal       = PORTALS.find(p => p.id === page);
  const selectedInst = institutions.find(i => i.id === institution);
  const pattern      = MATRIC_PATTERNS[selectedInst?.matric_format ?? ''];

  const resetForm = () => {
    setMatricNo(''); setStaffId(''); setVerCode('');
    setPassword(''); setAdminPwd(''); setShowPwd(false); setError('');
    setLoggedInName(''); setLoggedInHall('');
  };

  const goHome = () => {
    setPage('home'); setStep('institution');
    setInstitution(''); setInstDraft('');
    resetForm();
  };

  const goToPortal = (id: Page) => {
    setPage(id); setStep('institution');
    setInstDraft(''); resetForm();
  };

  const handleInstitutionNext = () => {
    if (!instDraft) return setError('Please select your institution.');
    setInstitution(instDraft);
    setError('');
    setStep('login');
  };

  // ── Real login via API ────────────────────────────────────────────────────
  const handleLogin = async () => {
    setError('');

    // Client-side validation
    if (page === 'student') {
      if (!matricNo.trim()) return setError('Please enter your Matric Number.');
      if (pattern && !pattern.regex.test(matricNo))
        return setError(`Invalid format. Expected: ${pattern.example}`);
      if (!password.trim()) return setError('Please enter your password.');
    }
    if (page === 'security') {
      if (!staffId.trim()) return setError('Please enter your Staff ID.');
      if (!verCode.trim()) return setError('Please enter your on-duty shift code.');
    }
    if (page === 'hall-officer') {
      if (!staffId.trim())  return setError('Please enter your Staff ID.');
      if (!password.trim()) return setError('Please enter your password.');
    }
    if (page === 'admin') {
      if (!adminPwd.trim()) return setError('Please enter the admin password.');
    }

    setLoginLoading(true);
    try {
      const roleMap: Record<string, string> = {
        student:        'student',
        security:       'security',
        'hall-officer': 'hall_officer',
        admin:          'admin',
      };

      const body: Record<string, string> = {
        institutionId: institution,
        role:          roleMap[page],
      };

      if (page === 'student')      { body.identifier = matricNo; body.password = password; }
      if (page === 'security')     { body.identifier = staffId;  body.password = verCode; }
      if (page === 'hall-officer') { body.identifier = staffId;  body.password = password; }
      if (page === 'admin')        { body.identifier = 'admin';  body.password = adminPwd; }

      const res  = await fetch('/api/auth/login', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) return setError(data.error ?? 'Login failed. Please check your credentials.');

      setLoggedInName(data.name     ?? '');
      setLoggedInHall(data.hallName ?? '');
      setStep('portal');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Sign-out: end session server-side then return to login step
  const makeSignOut = () => async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setStep('login');
    resetForm();
  };

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const inputSt: React.CSSProperties = {
    backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem',
    padding: '0.65rem 0.9rem', width: '100%', color: DARK, outline: 'none', fontSize: '0.92rem',
  };
  const labelSt: React.CSSProperties = {
    display: 'block', marginBottom: '0.35rem', fontWeight: 600,
    fontSize: '0.8rem', color: DARK, textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const fieldWrap: React.CSSProperties = { marginBottom: '1.1rem' };
  const cardWrap:  React.CSSProperties = {
    maxWidth: 440, margin: '2rem auto', backgroundColor: CARD,
    borderRadius: '1rem', padding: '2.5rem',
    border: `1px solid ${BORDER}`, boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
  };
  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '0.7rem', borderRadius: '0.5rem',
    backgroundColor: loginLoading ? MUTED : DARK, color: '#fff', fontWeight: 600,
    fontSize: '0.95rem', cursor: loginLoading ? 'not-allowed' : 'pointer',
    border: 'none', marginTop: '0.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
  };

  const matricOk     = pattern ? pattern.regex.test(matricNo) : true;
  const matricBorder = matricNo.length > 0
    ? `1px solid ${matricOk ? '#10b981' : '#d4183d'}`
    : `1px solid ${BORDER}`;

  // ── Institution select ─────────────────────────────────────────────────────
  const renderInstitution = () => (
    <div style={cardWrap}>
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: '0.875rem', backgroundColor: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
          <Building2 size={26} color="#fff" />
        </div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: DARK, marginBottom: '0.25rem' }}>Select Your Institution</h2>
        <p style={{ fontSize: '0.85rem', color: MUTED }}>Choose the institution you belong to</p>
      </div>

      <div style={fieldWrap}>
        <label style={labelSt}>Institution</label>
        <select value={instDraft} onChange={e => { setInstDraft(e.target.value); setError(''); }}
          disabled={instLoading}
          style={{ ...inputSt, cursor: instLoading ? 'wait' : 'pointer', appearance: 'auto', opacity: instLoading ? 0.6 : 1 }}>
          <option value="">{instLoading ? 'Loading institutions…' : '— Select institution —'}</option>
          {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {instDraft && (() => {
          const inst = institutions.find(i => i.id === instDraft);
          return inst ? (
            <p style={{ fontSize: '0.78rem', color: MUTED, marginTop: '0.35rem' }}>
              {inst.city}, {inst.state}
            </p>
          ) : null;
        })()}
      </div>

      {error && <p style={{ color: '#d4183d', fontSize: '0.82rem', marginBottom: '0.75rem', textAlign: 'center' }}>{error}</p>}
      <button style={btnPrimary} onClick={handleInstitutionNext} disabled={instLoading}>Continue</button>
      <button onClick={goHome} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '1rem auto 0', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '0.85rem' }}>
        <ArrowLeft size={14} /> Back to Home
      </button>
    </div>
  );

  // ── Login form ────────────────────────────────────────────────────────────
  const renderLogin = () => {
    const Icon = portal?.icon ?? User;
    return (
      <div style={cardWrap}>
        {/* Institution badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: INPUT, borderRadius: '2rem', padding: '0.35rem 0.9rem', width: 'fit-content', margin: '0 auto 1.5rem', fontSize: '0.8rem', color: MUTED }}>
          <Building2 size={12} />
          {selectedInst?.name}
          <button onClick={() => { setStep('institution'); setError(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, display: 'flex', marginLeft: '0.2rem' }}>
            <X size={11} />
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className={`${portal?.color} w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3`}>
            <Icon size={26} className="text-white" />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: DARK, marginBottom: '0.25rem' }}>{portal?.title}</h2>
          <p style={{ fontSize: '0.85rem', color: MUTED }}>Sign in to access this portal</p>
        </div>

        {/* Student */}
        {page === 'student' && (
          <>
            <div style={fieldWrap}>
              <label style={labelSt}>Matric Number</label>
              <input
                style={{ ...inputSt, border: matricBorder }}
                placeholder={pattern?.example ?? 'Enter matric number'}
                value={matricNo}
                maxLength={pattern?.maxLen}
                onChange={e => setMatricNo(pattern ? pattern.transform(e.target.value) : e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              {pattern && (
                <p style={{ fontSize: '0.72rem', color: matricNo.length > 0 ? (matricOk ? '#10b981' : '#d4183d') : MUTED, marginTop: '0.3rem' }}>
                  {pattern.hint}
                </p>
              )}
            </div>
            <div style={fieldWrap}>
              <label style={labelSt}>Password</label>
              <PasswordInput value={password} onChange={setPassword} showPwd={showPwd} onToggle={() => setShowPwd(p => !p)} onEnter={handleLogin} />
            </div>
          </>
        )}

        {/* Security */}
        {page === 'security' && (
          <>
            <div style={fieldWrap}>
              <label style={labelSt}>Staff ID</label>
              <input style={inputSt} placeholder="e.g. SEC-0042" value={staffId}
                onChange={e => setStaffId(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div style={fieldWrap}>
              <label style={labelSt}>On-Duty Shift Code</label>
              <PasswordInput value={verCode} onChange={v => setVerCode(v.toUpperCase())} showPwd={showPwd} onToggle={() => setShowPwd(p => !p)} onEnter={handleLogin} placeholder="Enter your shift code" />
              <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: '0.3rem' }}>
                First-time login? Your default shift code is your Staff ID.
              </p>
            </div>
          </>
        )}

        {/* Hall Officer */}
        {page === 'hall-officer' && (
          <>
            <div style={fieldWrap}>
              <label style={labelSt}>Staff ID</label>
              <input style={inputSt} placeholder="e.g. HOF-0031" value={staffId}
                onChange={e => setStaffId(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div style={fieldWrap}>
              <label style={labelSt}>Password</label>
              <PasswordInput value={password} onChange={v => setPassword(v.toUpperCase())} showPwd={showPwd} onToggle={() => setShowPwd(p => !p)} onEnter={handleLogin} />
              <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: '0.3rem' }}>
                First-time login? Your default password is your Staff ID.
              </p>
            </div>
          </>
        )}

        {/* Admin */}
        {page === 'admin' && (
          <div style={fieldWrap}>
            <label style={labelSt}>Admin Password</label>
            <PasswordInput value={adminPwd} onChange={setAdminPwd} showPwd={showPwd} onToggle={() => setShowPwd(p => !p)} onEnter={handleLogin} />
          </div>
        )}

        {error && <p style={{ color: '#d4183d', fontSize: '0.82rem', marginBottom: '0.75rem', textAlign: 'center' }}>{error}</p>}
        <button style={btnPrimary} onClick={handleLogin} disabled={loginLoading}>
          {loginLoading ? <><Loader2 size={15} className="animate-spin" /> Signing in…</> : 'Sign In'}
        </button>

        {/* Register Institution — admin login only */}
        {page === 'admin' && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: `1px solid ${BORDER}`, textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: MUTED, marginBottom: '0.6rem' }}>New to the system?</p>
            <button
              onClick={() => setShowRegister(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#F5F0E8', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, color: DARK, cursor: 'pointer' }}
            >
              <PlusCircle size={14} /> Register your institution
            </button>
          </div>
        )}

        <button onClick={() => { setStep('institution'); setError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.75rem auto 0', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '0.85rem' }}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    );
  };

  // ── Portal content ─────────────────────────────────────────────────────────
  const renderPortalContent = () => {
    const inst     = selectedInst ?? { id: '', name: '' };
    const onSignOut = makeSignOut();
    switch (page) {
      case 'student':
        return <StudentPortal institution={inst} studentName={loggedInName} matricNo={matricNo} onSignOut={onSignOut} />;
      case 'security':
        return <SecurityPortal institution={inst} officerName={loggedInName} onSignOut={onSignOut} />;
      case 'hall-officer':
        return <HallOfficerPortal institution={inst} officerName={loggedInName} hall={loggedInHall || 'Hall'} onSignOut={onSignOut} />;
      case 'admin':
        return <SchoolAdminPortal institution={inst} onSignOut={onSignOut} />;
      default:
        return null;
    }
  };

  const pageTitle = page === 'home' ? 'Dashboard' : (portal?.title ?? '');

  return (
    <div className="flex h-screen" style={{ backgroundColor: BG }}>
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden flex-shrink-0`}
        style={{ backgroundColor: BG, borderRight: `1px solid ${BORDER}` }}
      >
        <div className="p-6 h-full flex flex-col">
          <button onClick={goHome} className="text-left hover:opacity-70 transition-opacity mb-8" style={{ color: DARK }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.3, display: 'block' }}>
              Visitor<br />Management
            </span>
          </button>

          <nav className="space-y-1 flex-1">
            {PORTALS.map(p => {
              const Icon   = p.icon;
              const active = page === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => goToPortal(p.id as Page)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${active ? `${p.color} text-white shadow-sm` : 'hover:bg-black/5'}`}
                  style={!active ? { color: DARK } : {}}
                >
                  <Icon size={17} />
                  <span style={{ fontSize: '0.87rem', fontWeight: 500 }}>{p.title}</span>
                </button>
              );
            })}
          </nav>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '1rem', fontSize: '0.72rem', color: MUTED, lineHeight: 1.6 }}>
            <p style={{ fontWeight: 600, marginBottom: '0.15rem' }}>Operating hours</p>
            <p>Saturdays &amp; Sundays only</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ backgroundColor: BG, borderBottom: `1px solid ${BORDER}` }}>
          <button onClick={() => setSidebarOpen(o => !o)} className="p-2 rounded-lg hover:bg-black/5 transition flex-shrink-0">
            {sidebarOpen ? <X size={19} color={DARK} /> : <Menu size={19} color={DARK} />}
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {page !== 'home' && selectedInst && (
              <span style={{ fontSize: '0.85rem', color: MUTED, whiteSpace: 'nowrap' }}>{selectedInst.name} /</span>
            )}
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: DARK, whiteSpace: 'nowrap' }}>{pageTitle}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 md:p-8">
          {page === 'home' && (
            <div style={{ maxWidth: 680 }}>
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: DARK, marginBottom: '0.35rem' }}>Welcome</h3>
                <p style={{ color: MUTED }}>Select a portal to continue</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PORTALS.map(p => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      onClick={() => goToPortal(p.id as Page)}
                      className="rounded-xl p-5 text-left group hover:shadow-md transition-all"
                      style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
                    >
                      <div className={`${p.color} w-11 h-11 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                        <Icon size={20} className="text-white" />
                      </div>
                      <h4 style={{ fontWeight: 600, color: DARK, marginBottom: '0.25rem', fontSize: '0.95rem' }}>{p.title}</h4>
                      <p style={{ fontSize: '0.82rem', color: MUTED }}>{p.description}</p>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981', flexShrink: 0 }} />
                <p style={{ fontSize: '0.8rem', color: MUTED }}>
                  <strong style={{ color: DARK }}>Visitor?</strong> You don't need to log in. Your verification code will be sent to your email when a student registers you.
                </p>
              </div>
            </div>
          )}

          {page !== 'home' && step === 'institution' && renderInstitution()}
          {page !== 'home' && step === 'login'       && renderLogin()}
          {page !== 'home' && step === 'portal'      && renderPortalContent()}
        </div>
      </main>

      {/* Register Institution Wizard */}
      {showRegister && (
        <RegisterWizard
          onClose={() => setShowRegister(false)}
          onDone={name => {
            setShowRegister(false);
            refreshInstitutions();
            setRegisteredBanner(name);
            setTimeout(() => setRegisteredBanner(''), 6000);
          }}
        />
      )}

      {/* Success banner */}
      {registeredBanner && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#030213', color: '#fff', borderRadius: '0.625rem',
          padding: '0.75rem 1.25rem', fontSize: '0.87rem', fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center',
          gap: '0.6rem', zIndex: 200, whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#4ade80' }}>✓</span>
          <strong>{registeredBanner}</strong> has been registered. Admin account is ready.
          <button onClick={() => setRegisteredBanner('')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1rem', padding: '0 0 0 0.5rem', lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}
