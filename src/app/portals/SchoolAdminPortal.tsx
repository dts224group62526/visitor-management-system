import { useState, useRef, useEffect, useCallback } from 'react';
import {
  LogOut, Power, Upload, Users, Shield, UserCheck, RotateCcw,
  CheckCircle, AlertTriangle, Building2, ChevronRight, ChevronLeft,
  X, Mail, Phone, MapPin, Lock, Eye, EyeOff, Key, GraduationCap,
  Check, Search, ShieldCheck, ShieldOff, Hash, Loader2, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';

const CARD   = '#F8F4EE';
const DARK   = '#030213';
const MUTED  = '#717182';
const BORDER = 'rgba(0,0,0,0.1)';
const INPUT  = '#EDE7DC';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

// ── Upload section ─────────────────────────────────────────────────────────
function UploadSection({
  icon: Icon, title, description, color, state, onUpload,
}: {
  icon: React.ElementType; title: string; description: string;
  color: string; state: UploadState; onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600, color: DARK, marginBottom: '0.15rem' }}>{title}</p>
        <p style={{ fontSize: '0.8rem', color: MUTED }}>{description}</p>
      </div>
      <div className="flex-shrink-0">
        {(state === 'idle' || state === 'error') && (
          <>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ''; } }} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ backgroundColor: INPUT, border: `1px solid ${state === 'error' ? '#d4183d' : BORDER}`, borderRadius: '0.5rem', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 600, color: state === 'error' ? '#d4183d' : DARK, cursor: 'pointer' }}>
              <Upload size={13} /> {state === 'error' ? 'Retry' : 'Upload CSV'}
            </button>
          </>
        )}
        {state === 'uploading' && (
          <div className="flex items-center gap-1.5" style={{ fontSize: '0.82rem', color: MUTED }}>
            <Loader2 size={14} className="animate-spin" /> Processing…
          </div>
        )}
        {state === 'done' && (
          <div className="flex items-center gap-1.5" style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>
            <CheckCircle size={14} /> Uploaded
          </div>
        )}
      </div>
    </div>
  );
}

// ── Register Institution Wizard ────────────────────────────────────────────

const MATRIC_OPTIONS = [
  { value: 'cu',     label: 'Covenant University',     example: '24CG036190',  hint: '2-digit year + dept code + 6 digits' },
  { value: 'ui',     label: 'University of Ibadan',    example: '231456',      hint: '6-digit number' },
  { value: 'unilag', label: 'University of Lagos',     example: '090107029',   hint: '9-digit number' },
  { value: 'abu',    label: 'Ahmadu Bello University', example: 'U12CS1006',   hint: 'U + year + dept + 4 digits' },
  { value: 'custom', label: 'Other / Custom',           example: '',            hint: 'Any format accepted' },
];

const INST_TYPES = ['Federal University', 'State University', 'Private University', 'Polytechnic', 'College of Education', 'Other'];

type WizardData = {
  name: string; abbreviation: string; type: string;
  city: string; state: string; email: string; phone: string;
  matricFormat: string;
  adminPassword: string; adminConfirm: string;
  studentUpload: UploadState; securityUpload: UploadState; hallOfficerUpload: UploadState;
};

const EMPTY_WIZARD: WizardData = {
  name: '', abbreviation: '', type: '', city: '', state: '', email: '', phone: '',
  matricFormat: '',
  adminPassword: '', adminConfirm: '',
  studentUpload: 'idle', securityUpload: 'idle', hallOfficerUpload: 'idle',
};

function StepDot({ step, current, label }: { step: number; current: number; label: string }) {
  const done = step < current, active = step === current;
  return (
    <div className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#10b981' : active ? DARK : INPUT, color: done || active ? '#fff' : MUTED, fontWeight: 700, fontSize: '0.78rem', flexShrink: 0, border: active ? `2px solid ${DARK}` : 'none', transition: 'all 0.2s' }}>
        {done ? <Check size={14} /> : step}
      </div>
      <span style={{ fontSize: '0.68rem', color: active ? DARK : MUTED, fontWeight: active ? 600 : 400, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
    </div>
  );
}

const inputSt: React.CSSProperties = { width: '100%', backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.65rem 0.9rem', color: DARK, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };

export function RegisterWizard({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [step,        setStep]        = useState(1);
  const [data,        setData]        = useState<WizardData>(EMPTY_WIZARD);
  const [showPwd,     setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [submitting,  setSubmitting]  = useState(false);
  const [registered,  setRegistered]  = useState(false);
  const [submitError, setSubmitError] = useState('');

  // File refs for deferred uploads
  const studentFileRef     = useRef<File | null>(null);
  const securityFileRef    = useRef<File | null>(null);
  const hallOfficerFileRef = useRef<File | null>(null);

  const set = (key: keyof WizardData, val: string | UploadState) =>
    setData(d => ({ ...d, [key]: val }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!data.name.trim())         errs.name         = 'Institution name is required.';
      if (!data.abbreviation.trim()) errs.abbreviation = 'Abbreviation is required.';
      if (!data.type)                errs.type         = 'Please select an institution type.';
      if (!data.city.trim())         errs.city         = 'City is required.';
      if (!data.state.trim())        errs.state        = 'State is required.';
      if (!data.email.trim())        errs.email        = 'Contact email is required.';
    }
    if (step === 3) {
      if (!data.matricFormat) errs.matricFormat = 'Select a matric number format.';
      if (!data.adminPassword.trim()) errs.adminPassword = 'Admin password is required.';
      if (data.adminPassword.length < 8) errs.adminPassword = 'Password must be at least 8 characters.';
      if (data.adminPassword !== data.adminConfirm) errs.adminConfirm = 'Passwords do not match.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const prev = () => { setErrors({}); setStep(s => s - 1); };

  const handleRegister = async () => {
    setSubmitting(true);
    setSubmitError('');

    // 1. Create institution
    const { ok, data: instData } = await api.post<{ ok: boolean; institution: { id: string }; error?: string }>(
      '/admin/institutions',
      {
        name:          data.name.trim(),
        abbreviation:  data.abbreviation.trim(),
        type:          data.type,
        city:          data.city.trim(),
        state:         data.state.trim(),
        contactEmail:  data.email.trim(),
        phone:         data.phone.trim() || undefined,
        matricFormat:  data.matricFormat,
        adminPassword: data.adminPassword,
      },
    );

    if (!ok) {
      setSubmitting(false);
      setSubmitError((instData as Record<string, string>).error ?? 'Registration failed.');
      return;
    }

    // 2. Auto-login so we can upload databases
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institutionId: instData.institution.id, role: 'admin', identifier: 'admin', password: data.adminPassword }),
    });

    if (loginRes.ok) {
      // 3. Upload databases if files were provided
      if (studentFileRef.current)     await api.upload('/admin/upload/students',     studentFileRef.current);
      if (securityFileRef.current)    await api.upload('/admin/upload/security',     securityFileRef.current);
      if (hallOfficerFileRef.current) await api.upload('/admin/upload/hall-officers', hallOfficerFileRef.current);

      // 4. Log out of the temporary admin session so user goes to login screen
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    }

    setSubmitting(false);
    setRegistered(true);
    setTimeout(() => onDone(data.name), 2000);
  };

  const selectedMatric = MATRIC_OPTIONS.find(o => o.value === data.matricFormat);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
      <div style={{ backgroundColor: '#F5F0E8', borderRadius: '1.25rem', width: '100%', maxWidth: 560, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '1.5rem 1.5rem 0', position: 'sticky', top: 0, backgroundColor: '#F5F0E8', zIndex: 1 }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 size={20} color={DARK} />
              <h3 style={{ fontWeight: 700, color: DARK, fontSize: '1.1rem' }}>Register Institution</h3>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '0.25rem' }}><X size={20} /></button>
          </div>
          <div className="flex items-start gap-0" style={{ marginBottom: '1.5rem' }}>
            <StepDot step={1} current={step} label="Institution" />
            <div style={{ flex: 0.5, height: 1, backgroundColor: step > 1 ? '#10b981' : BORDER, marginTop: 15, transition: 'background-color 0.3s' }} />
            <StepDot step={2} current={step} label="Databases" />
            <div style={{ flex: 0.5, height: 1, backgroundColor: step > 2 ? '#10b981' : BORDER, marginTop: 15, transition: 'background-color 0.3s' }} />
            <StepDot step={3} current={step} label="Config" />
            <div style={{ flex: 0.5, height: 1, backgroundColor: step > 3 ? '#10b981' : BORDER, marginTop: 15, transition: 'background-color 0.3s' }} />
            <StepDot step={4} current={step} label="Review" />
          </div>
        </div>

        <div style={{ padding: '0 1.5rem 1.5rem' }}>

          {/* Step 1: Institution Info */}
          {step === 1 && (
            <div className="space-y-4">
              <FieldRow label="Institution Name">
                <input style={{ ...inputSt, border: `1px solid ${errors.name ? '#d4183d' : BORDER}` }} placeholder="e.g. Covenant University" value={data.name} onChange={e => set('name', e.target.value)} />
                {errors.name && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.name}</p>}
              </FieldRow>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FieldRow label="Abbreviation">
                  <input style={{ ...inputSt, border: `1px solid ${errors.abbreviation ? '#d4183d' : BORDER}` }} placeholder="e.g. CU" value={data.abbreviation} onChange={e => set('abbreviation', e.target.value.toUpperCase())} maxLength={10} />
                  {errors.abbreviation && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.abbreviation}</p>}
                </FieldRow>
                <FieldRow label="Institution Type">
                  <select style={{ ...inputSt, border: `1px solid ${errors.type ? '#d4183d' : BORDER}`, appearance: 'auto' }} value={data.type} onChange={e => set('type', e.target.value)}>
                    <option value="">Select type…</option>
                    {INST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {errors.type && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.type}</p>}
                </FieldRow>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FieldRow label="City">
                  <div style={{ position: 'relative' }}>
                    <MapPin size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                    <input style={{ ...inputSt, paddingLeft: '2rem', border: `1px solid ${errors.city ? '#d4183d' : BORDER}` }} placeholder="Ota" value={data.city} onChange={e => set('city', e.target.value)} />
                  </div>
                  {errors.city && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.city}</p>}
                </FieldRow>
                <FieldRow label="State">
                  <input style={{ ...inputSt, border: `1px solid ${errors.state ? '#d4183d' : BORDER}` }} placeholder="Ogun" value={data.state} onChange={e => set('state', e.target.value)} />
                  {errors.state && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.state}</p>}
                </FieldRow>
              </div>
              <FieldRow label="Contact Email">
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                  <input type="email" style={{ ...inputSt, paddingLeft: '2rem', border: `1px solid ${errors.email ? '#d4183d' : BORDER}` }} placeholder="registrar@cu.edu.ng" value={data.email} onChange={e => set('email', e.target.value)} />
                </div>
                {errors.email && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.email}</p>}
              </FieldRow>
              <FieldRow label="Phone (optional)">
                <div style={{ position: 'relative' }}>
                  <Phone size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                  <input type="tel" style={{ ...inputSt, paddingLeft: '2rem' }} placeholder="+234 800 000 0000" value={data.phone} onChange={e => set('phone', e.target.value)} />
                </div>
              </FieldRow>
            </div>
          )}

          {/* Step 2: Upload Databases (optional — uploads happen after registration) */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: '0.85rem', color: MUTED, marginBottom: '1.25rem', lineHeight: 1.6 }}>
                Optionally upload your CSV databases now. All three are optional here — you can also upload them from your admin portal after logging in.
              </p>
              <div className="space-y-3">
                <UploadSection icon={Users} title="Student Database" description="CSV: matric_number, first_name, last_name, email, hall, room, level, department" color="bg-blue-500" state={data.studentUpload}
                  onUpload={file => { studentFileRef.current = file; set('studentUpload', 'done'); }} />
                <UploadSection icon={Shield} title="Security Personnel" description="CSV: staff_id, first_name, last_name, email, shift_days, shift_start, shift_end" color="bg-green-500" state={data.securityUpload}
                  onUpload={file => { securityFileRef.current = file; set('securityUpload', 'done'); }} />
                <UploadSection icon={UserCheck} title="Hall Officers" description="CSV: staff_id, first_name, last_name, email, hall_assigned" color="bg-purple-500" state={data.hallOfficerUpload}
                  onUpload={file => { hallOfficerFileRef.current = file; set('hallOfficerUpload', 'done'); }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: MUTED, marginTop: '1rem', fontStyle: 'italic' }}>
                Files are uploaded to the database after you complete registration in Step 4.
              </p>
            </div>
          )}

          {/* Step 3: Configuration */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, display: 'block', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Matric Number Format</label>
                <div className="space-y-2">
                  {MATRIC_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => set('matricFormat', opt.value)} style={{ width: '100%', textAlign: 'left', backgroundColor: data.matricFormat === opt.value ? DARK : CARD, border: `1px solid ${data.matricFormat === opt.value ? DARK : BORDER}`, borderRadius: '0.625rem', padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s' }}>
                      <div>
                        <p style={{ fontWeight: 600, color: data.matricFormat === opt.value ? '#fff' : DARK, fontSize: '0.88rem' }}>{opt.label}</p>
                        <p style={{ fontSize: '0.75rem', color: data.matricFormat === opt.value ? 'rgba(255,255,255,0.65)' : MUTED, marginTop: '0.1rem' }}>{opt.example ? `e.g. ${opt.example} — ${opt.hint}` : opt.hint}</p>
                      </div>
                      {data.matricFormat === opt.value && <Check size={16} color="#fff" />}
                    </button>
                  ))}
                </div>
                {errors.matricFormat && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.4rem' }}>{errors.matricFormat}</p>}
              </div>
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '1.25rem' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Key size={15} color={DARK} />
                  <p style={{ fontWeight: 700, color: DARK, fontSize: '0.92rem' }}>Admin Credentials</p>
                </div>
                <div className="space-y-3">
                  <FieldRow label="Admin Password">
                    <div style={{ position: 'relative' }}>
                      <Lock size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                      <input type={showPwd ? 'text' : 'password'} style={{ ...inputSt, paddingLeft: '2rem', paddingRight: '2.5rem', border: `1px solid ${errors.adminPassword ? '#d4183d' : BORDER}` }} placeholder="Minimum 8 characters" value={data.adminPassword} onChange={e => set('adminPassword', e.target.value)} />
                      <button onClick={() => setShowPwd(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, display: 'flex' }}>
                        {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {errors.adminPassword && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.adminPassword}</p>}
                  </FieldRow>
                  <FieldRow label="Confirm Password">
                    <div style={{ position: 'relative' }}>
                      <Lock size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                      <input type={showConfirm ? 'text' : 'password'} style={{ ...inputSt, paddingLeft: '2rem', paddingRight: '2.5rem', border: `1px solid ${errors.adminConfirm ? '#d4183d' : BORDER}` }} placeholder="Re-enter password" value={data.adminConfirm} onChange={e => set('adminConfirm', e.target.value)} />
                      <button onClick={() => setShowConfirm(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, display: 'flex' }}>
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {errors.adminConfirm && <p style={{ fontSize: '0.75rem', color: '#d4183d', marginTop: '0.25rem' }}>{errors.adminConfirm}</p>}
                  </FieldRow>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && !registered && (
            <div>
              <p style={{ fontSize: '0.85rem', color: MUTED, marginBottom: '1.25rem', lineHeight: 1.6 }}>
                Review your institution details before registering.
              </p>
              {[
                { title: 'Institution Details', icon: Building2, rows: [['Name', data.name], ['Abbreviation', data.abbreviation], ['Type', data.type], ['Location', `${data.city}, ${data.state}`], ['Contact Email', data.email], ...(data.phone ? [['Phone', data.phone] as [string, string]] : [])] },
                { title: 'Databases', icon: GraduationCap, rows: [['Students', data.studentUpload === 'done' ? '✓ File ready' : '— Upload after login'], ['Security', data.securityUpload === 'done' ? '✓ File ready' : '— Upload after login'], ['Hall Officers', data.hallOfficerUpload === 'done' ? '✓ File ready' : '— Upload after login']] },
                { title: 'Configuration', icon: Key, rows: [['Matric Format', selectedMatric?.label ?? '—'], ['Admin Password', '••••••••']] },
              ].map(section => (
                <div key={section.title} style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1rem 1.25rem', marginBottom: '0.75rem' }}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <section.icon size={14} color={MUTED} />
                    <p style={{ fontSize: '0.77rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{section.title}</p>
                  </div>
                  <div className="space-y-1.5">
                    {section.rows.map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center">
                        <span style={{ fontSize: '0.82rem', color: MUTED }}>{label}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: String(value).startsWith('✓') ? '#059669' : DARK }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {submitError && (
                <div className="flex items-center gap-2 mb-3" style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#991b1b', fontSize: '0.85rem' }}>
                  <AlertTriangle size={15} /> {submitError}
                </div>
              )}
              <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '0.75rem', padding: '0.875rem 1rem', fontSize: '0.82rem', color: '#854d0e', lineHeight: 1.6 }}>
                By registering, you confirm you are authorised to onboard <strong>{data.name}</strong>.
              </div>
            </div>
          )}

          {/* Success */}
          {registered && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <CheckCircle size={32} color="#16a34a" />
              </div>
              <h4 style={{ fontWeight: 700, color: DARK, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Registration Successful!</h4>
              <p style={{ fontSize: '0.87rem', color: MUTED, lineHeight: 1.6 }}>
                <strong style={{ color: DARK }}>{data.name}</strong> has been registered. You can now sign in with your admin password.
              </p>
            </div>
          )}

          {/* Nav buttons */}
          {!registered && (
            <div className="flex gap-3 mt-6">
              {step > 1 ? (
                <button onClick={prev} disabled={submitting} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ flex: 1, padding: '0.65rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', justifyContent: 'center' }}>
                  <ChevronLeft size={15} /> Back
                </button>
              ) : (
                <button onClick={onClose} style={{ flex: 1, padding: '0.65rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                  Cancel
                </button>
              )}
              {step < 4 ? (
                <button onClick={next} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ flex: 2, padding: '0.65rem', borderRadius: '0.5rem', backgroundColor: DARK, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', justifyContent: 'center' }}>
                  Continue <ChevronRight size={15} />
                </button>
              ) : (
                <button onClick={handleRegister} disabled={submitting} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ flex: 2, padding: '0.65rem', borderRadius: '0.5rem', backgroundColor: '#10b981', color: '#fff', border: 'none', cursor: submitting ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.88rem', justifyContent: 'center', opacity: submitting ? 0.8 : 1 }}>
                  {submitting ? <><Loader2 size={15} className="animate-spin" /> Registering…</> : <><CheckCircle size={15} /> Register Institution</>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Visitor lookup result type ──────────────────────────────────────────────
interface AdminVisitor {
  id:                string;
  name:              string;
  email:             string;
  verification_code: string;
  code_active:       boolean;
  phones:            string[];
  registered_by:     string[];
  created_at:        string;
}

// ── Main SchoolAdminPortal ────────────────────────────────────────────────
type Props = {
  institution: { id: string; name: string };
  onSignOut:   () => void;
};

export default function SchoolAdminPortal({ institution, onSignOut }: Props) {
  const [stats, setStats] = useState({ registeredStudents: 0, activeVisitors: 0, visitsToday: 0, portalOpen: true });
  const [statsLoading, setStatsLoading] = useState(true);

  const [portalToggling, setPortalToggling]   = useState(false);
  const [studentUpload, setStudentUpload]       = useState<UploadState>('idle');
  const [securityUpload, setSecurityUpload]     = useState<UploadState>('idle');
  const [hallOfficerUpload, setHallOfficerUpload] = useState<UploadState>('idle');
  const [uploadMsg, setUploadMsg]             = useState('');
  const [uploadError, setUploadError]         = useState('');

  const [visitorQuery,    setVisitorQuery]    = useState('');
  const [visitorResult,   setVisitorResult]   = useState<AdminVisitor | null>(null);
  const [visitorNotFound, setVisitorNotFound] = useState(false);
  const [visitorLoading,  setVisitorLoading]  = useState(false);
  const [visitorActing,   setVisitorActing]   = useState(false);

  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone,    setResetDone]    = useState(false);
  const [globalError,  setGlobalError]  = useState('');

  // ── User password reset ──────────────────────────────────────────────────
  const [pwdRole,       setPwdRole]       = useState('');
  const [pwdIdentifier, setPwdIdentifier] = useState('');
  const [pwdLoading,    setPwdLoading]    = useState(false);
  const [pwdMsg,        setPwdMsg]        = useState('');
  const [pwdError,      setPwdError]      = useState('');

  // ── Load stats ───────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const { ok, data } = await api.get<typeof stats>('/admin/stats');
    setStatsLoading(false);
    if (ok) setStats(data);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ── Portal toggle ────────────────────────────────────────────────────────
  const handlePortalToggle = async () => {
    setPortalToggling(true);
    const newOpen = !stats.portalOpen;
    const { ok, data } = await api.put<{ ok: boolean; portalOpen: boolean; error?: string }>('/admin/portal-status', { open: newOpen });
    setPortalToggling(false);
    if (!ok) {
      setGlobalError((data as Record<string, string>).error ?? 'Failed to toggle portal.');
      setTimeout(() => setGlobalError(''), 4000);
      return;
    }
    setStats(s => ({ ...s, portalOpen: data.portalOpen }));
  };

  // ── CSV uploads ──────────────────────────────────────────────────────────
  const handleUpload = async (
    endpoint: string,
    file: File,
    setter: (s: UploadState) => void,
  ) => {
    setter('uploading');
    setUploadError('');
    const { ok, data } = await api.upload<{ ok: boolean; inserted: number; updated: number; skipped: number; error?: string }>(endpoint, file);
    if (!ok) {
      setter('error');
      setUploadError((data as Record<string, string>).error ?? 'Upload failed.');
      setTimeout(() => setUploadError(''), 5000);
      return;
    }
    setter('done');
    setUploadMsg(`${file.name}: ${data.inserted} inserted, ${data.updated} updated${data.skipped ? `, ${data.skipped} skipped` : ''}.`);
    setTimeout(() => setUploadMsg(''), 6000);
    loadStats();
  };

  // ── Visitor lookup ───────────────────────────────────────────────────────
  const handleVisitorLookup = async () => {
    const code = visitorQuery.trim().toUpperCase();
    if (!code) return;
    setVisitorLoading(true);
    setVisitorNotFound(false);
    const { ok, data } = await api.get<{ visitor: AdminVisitor }>(`/admin/visitors/${code}`);
    setVisitorLoading(false);
    if (!ok) { setVisitorResult(null); setVisitorNotFound(true); }
    else      { setVisitorResult(data.visitor); }
  };

  const handleVisitorStatus = async (active: boolean) => {
    if (!visitorResult) return;
    setVisitorActing(true);
    const { ok, data } = await api.patch<{ ok: boolean; visitor: { code_active: boolean }; error?: string }>(
      `/admin/visitors/${visitorResult.verification_code}/status`, { active },
    );
    setVisitorActing(false);
    if (!ok) {
      setGlobalError((data as Record<string, string>).error ?? 'Action failed.');
      setTimeout(() => setGlobalError(''), 4000);
      return;
    }
    setVisitorResult(v => v ? { ...v, code_active: data.visitor.code_active } : null);
  };

  // ── Semester reset ────────────────────────────────────────────────────────
  const handleReset = async () => {
    setResetLoading(true);
    const { ok, data } = await api.post<{ ok: boolean; archivedVisits: number; deletedLinks: number; error?: string }>('/admin/semester-reset', {});
    setResetLoading(false);
    setResetConfirm(false);
    if (!ok) {
      setGlobalError((data as Record<string, string>).error ?? 'Reset failed.');
      setTimeout(() => setGlobalError(''), 5000);
      return;
    }
    setResetDone(true);
    setTimeout(() => setResetDone(false), 5000);
    loadStats();
  };

  // ── Reset a user's password to default ──────────────────────────────────
  const handlePwdReset = async () => {
    setPwdError(''); setPwdMsg('');
    if (!pwdRole) return setPwdError('Please select a role.');
    if (!pwdIdentifier.trim()) return setPwdError('Identifier is required.');
    setPwdLoading(true);
    const { ok, data } = await api.post<{ ok: boolean; message?: string; error?: string }>(
      '/admin/reset-password', { role: pwdRole, identifier: pwdIdentifier.trim() },
    );
    setPwdLoading(false);
    if (!ok) {
      setPwdError((data as Record<string, string>).error ?? 'Reset failed.');
      setTimeout(() => setPwdError(''), 5000);
    } else {
      setPwdMsg((data as Record<string, string>).message ?? 'Password reset to default.');
      setPwdIdentifier('');
      setTimeout(() => setPwdMsg(''), 5000);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: DARK, marginBottom: '0.2rem' }}>Admin Panel</h3>
          <p style={{ fontSize: '0.85rem', color: MUTED }}>{institution.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadStats} disabled={statsLoading} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
            {statsLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
          <button onClick={onSignOut} className="flex items-center gap-2 hover:opacity-70 transition" style={{ fontSize: '0.82rem', color: MUTED, background: 'none', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>

      {/* Global error */}
      {globalError && (
        <div className="flex items-center gap-2 mb-4" style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#991b1b', fontSize: '0.87rem' }}>
          <AlertTriangle size={15} /> {globalError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Registered Students', value: stats.registeredStudents, color: '#3b82f6' },
          { label: 'Active Visitors',      value: stats.activeVisitors,     color: '#10b981' },
          { label: 'Visits Today',         value: stats.visitsToday,        color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.1rem 1.25rem' }}>
            <p style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>{statsLoading ? '…' : s.value}</p>
            <p style={{ fontSize: '0.77rem', color: MUTED, marginTop: '0.2rem' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Portal status */}
      <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontWeight: 700, color: DARK, marginBottom: '0.2rem' }}>Registration Portal</p>
            <p style={{ fontSize: '0.83rem', color: MUTED }}>
              {stats.portalOpen ? 'Students can currently register visitors.' : 'The student registration portal is closed.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: stats.portalOpen ? '#059669' : '#d4183d' }}>
              {stats.portalOpen ? 'Open' : 'Closed'}
            </span>
            <button onClick={handlePortalToggle} disabled={portalToggling} className="flex items-center gap-2 transition hover:opacity-80" style={{ backgroundColor: stats.portalOpen ? '#d4183d' : '#10b981', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: portalToggling ? 'wait' : 'pointer', opacity: portalToggling ? 0.7 : 1 }}>
              {portalToggling ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
              {stats.portalOpen ? 'Close Portal' : 'Open Portal'}
            </button>
          </div>
        </div>
      </div>

      {/* DB Upload */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Database Management</p>
        {uploadMsg && (
          <div className="flex items-center gap-2 mb-3" style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#166534', fontSize: '0.85rem' }}>
            <CheckCircle size={14} /> {uploadMsg}
          </div>
        )}
        {uploadError && (
          <div className="flex items-center gap-2 mb-3" style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#991b1b', fontSize: '0.85rem' }}>
            <AlertTriangle size={14} /> {uploadError}
          </div>
        )}
        <div className="space-y-3">
          <UploadSection icon={Users} title="Student Database" description="CSV: matric_number, first_name, last_name, email, hall, room, level, department" color="bg-blue-500" state={studentUpload}
            onUpload={f => handleUpload('/admin/upload/students', f, setStudentUpload)} />
          <UploadSection icon={Shield} title="Security Personnel" description="CSV: staff_id, first_name, last_name, email, shift_days, shift_start, shift_end" color="bg-green-500" state={securityUpload}
            onUpload={f => handleUpload('/admin/upload/security', f, setSecurityUpload)} />
          <UploadSection icon={UserCheck} title="Hall Officers" description="CSV: staff_id, first_name, last_name, email, hall_assigned" color="bg-purple-500" state={hallOfficerUpload}
            onUpload={f => handleUpload('/admin/upload/hall-officers', f, setHallOfficerUpload)} />
        </div>
      </div>

      {/* Visitor Management */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Visitor Management</p>
        <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.85rem', color: MUTED, marginBottom: '1rem', lineHeight: 1.6 }}>
            Look up a visitor by their 10-character verification code to deactivate or reactivate their access globally.
          </p>
          <div className="flex gap-2">
            <div style={{ position: 'relative', flex: 1 }}>
              <Hash size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={{ width: '100%', backgroundColor: '#EDE7DC', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.65rem 0.9rem 0.65rem 2rem', color: DARK, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                placeholder="e.g. 2UMNRM4SXK" value={visitorQuery} maxLength={10}
                onChange={e => { setVisitorQuery(e.target.value.toUpperCase()); setVisitorNotFound(false); }}
                onKeyDown={e => e.key === 'Enter' && handleVisitorLookup()} />
            </div>
            <button onClick={handleVisitorLookup} disabled={visitorLoading} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ backgroundColor: DARK, color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.65rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, cursor: visitorLoading ? 'wait' : 'pointer', flexShrink: 0, opacity: visitorLoading ? 0.7 : 1 }}>
              {visitorLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Look Up
            </button>
          </div>

          {visitorNotFound && (
            <div className="flex items-center gap-2 mt-3" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#991b1b' }}>
              <AlertTriangle size={15} /> No visitor found with that code.
            </div>
          )}

          {visitorResult && (
            <div style={{ marginTop: '1rem', backgroundColor: '#F5F0E8', border: `2px solid ${visitorResult.code_active ? '#86efac' : '#fca5a5'}`, borderRadius: '0.75rem', padding: '1.1rem 1.25rem' }}>
              <div className="flex items-start gap-3 flex-wrap">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p style={{ fontWeight: 700, color: DARK, fontSize: '1rem' }}>{visitorResult.name}</p>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, borderRadius: '999px', padding: '0.2rem 0.6rem', backgroundColor: visitorResult.code_active ? '#dcfce7' : '#fee2e2', color: visitorResult.code_active ? '#166534' : '#991b1b' }}>
                      {visitorResult.code_active ? 'ACTIVE' : 'DEACTIVATED'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: MUTED, marginBottom: '0.5rem' }}>{visitorResult.email}</p>
                  {visitorResult.phones.map(ph => <p key={ph} style={{ fontSize: '0.8rem', color: MUTED }}>{ph}</p>)}
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontSize: '0.7rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.1rem' }}>Code</p>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: DARK, fontFamily: 'monospace', letterSpacing: '0.08em' }}>{visitorResult.verification_code}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.7rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.1rem' }}>Registered by</p>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: DARK }}>{visitorResult.registered_by.join(', ') || '—'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {visitorActing ? <Loader2 size={16} className="animate-spin" style={{ color: MUTED }} /> : visitorResult.code_active ? (
                    <button onClick={() => handleVisitorStatus(false)} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ backgroundColor: 'rgba(212,24,61,0.1)', color: '#d4183d', border: '1px solid rgba(212,24,61,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.9rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                      <ShieldOff size={14} /> Deactivate
                    </button>
                  ) : (
                    <button onClick={() => handleVisitorStatus(true)} className="flex items-center gap-1.5 hover:opacity-80 transition" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.9rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                      <ShieldCheck size={14} /> Reactivate
                    </button>
                  )}
                </div>
              </div>
              {!visitorResult.code_active && (
                <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: `1px solid ${BORDER}`, fontSize: '0.78rem', color: '#991b1b' }}>
                  This visitor's code is deactivated globally. Security will not be able to check them in until reactivated.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Password Reset */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Reset User Password</p>
        <div style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '0.875rem', padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.83rem', color: MUTED, marginBottom: '1rem', lineHeight: 1.6 }}>
            Reset a user's password back to their default (matric/staff ID). Use this when a user is locked out.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</label>
              <select value={pwdRole} onChange={e => setPwdRole(e.target.value)} style={{ width: '100%', backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.65rem 0.9rem', color: DARK, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', appearance: 'auto' }}>
                <option value="">Select role…</option>
                <option value="student">Student</option>
                <option value="security">Security Officer</option>
                <option value="hall_officer">Hall Officer</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: MUTED, display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {pwdRole === 'student' ? 'Matric Number' : 'Staff ID'}
              </label>
              <input
                value={pwdIdentifier}
                onChange={e => setPwdIdentifier(e.target.value)}
                placeholder={pwdRole === 'student' ? 'e.g. 24CG001001' : 'e.g. HOF-0031'}
                style={{ width: '100%', backgroundColor: INPUT, border: `1px solid ${BORDER}`, borderRadius: '0.5rem', padding: '0.65rem 0.9rem', color: DARK, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          {pwdMsg && (
            <div className="flex items-center gap-2 mb-3" style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.65rem 1rem', color: '#166534', fontSize: '0.85rem' }}>
              <CheckCircle size={14} /> {pwdMsg}
            </div>
          )}
          {pwdError && (
            <div className="flex items-center gap-2 mb-3" style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.65rem 1rem', color: '#991b1b', fontSize: '0.85rem' }}>
              <AlertTriangle size={14} /> {pwdError}
            </div>
          )}
          <button onClick={handlePwdReset} disabled={pwdLoading} className="flex items-center gap-2 hover:opacity-80 transition" style={{ backgroundColor: DARK, color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, cursor: pwdLoading ? 'wait' : 'pointer', opacity: pwdLoading ? 0.7 : 1 }}>
            {pwdLoading ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
            Reset to Default Password
          </button>
        </div>
      </div>

      {/* Semester reset */}
      <div style={{ backgroundColor: CARD, border: '1px solid rgba(212,24,61,0.2)', borderRadius: '0.875rem', padding: '1.25rem 1.5rem' }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontWeight: 700, color: DARK, marginBottom: '0.2rem' }}>Semester Reset</p>
            <p style={{ fontSize: '0.83rem', color: MUTED }}>Archives all visits and clears visitor links so students re-register next semester.</p>
          </div>
          <button onClick={() => setResetConfirm(true)} className="flex items-center gap-2 hover:opacity-80 transition" style={{ backgroundColor: 'rgba(212,24,61,0.1)', color: '#d4183d', border: '1px solid rgba(212,24,61,0.3)', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            <RotateCcw size={13} /> Reset Semester
          </button>
        </div>
      </div>

      {resetDone && (
        <div className="flex items-center gap-2 mt-3" style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#166534', fontSize: '0.87rem' }}>
          <CheckCircle size={16} /> Semester reset complete. All visits archived and visitor links cleared. Students can re-register next semester.
        </div>
      )}

      {/* Reset confirm dialog */}
      {resetConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: CARD, borderRadius: '1rem', padding: '2rem', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={22} color="#d4183d" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h4 style={{ fontWeight: 700, color: DARK, marginBottom: '0.5rem' }}>Reset Semester?</h4>
                <p style={{ fontSize: '0.87rem', color: MUTED, lineHeight: 1.6 }}>
                  This will archive all visits and clear all visitor–student links for <strong style={{ color: DARK }}>{institution.name}</strong>. Students will re-register their visitors next semester.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setResetConfirm(false)} disabled={resetLoading} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: 'none', color: MUTED, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleReset} disabled={resetLoading} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', backgroundColor: '#d4183d', color: '#fff', border: 'none', cursor: resetLoading ? 'wait' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                {resetLoading ? <><Loader2 size={14} className="animate-spin" /> Resetting…</> : 'Yes, Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
