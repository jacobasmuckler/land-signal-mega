'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', inviteCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const urlError = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(tab === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Something went wrong.'); setBusy(false); return; }
      window.location.href = '/';
    } catch { setError('Network error — try again.'); setBusy(false); }
  }

  const input = (props: any) => (
    <input {...props} required onChange={(e: any) => setForm(f => ({ ...f, [props.name]: e.target.value }))}
      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(111,214,224,.25)', background: 'rgba(6,14,16,.7)', color: '#E7F1EF', fontSize: 14, outline: 'none', marginBottom: 12 }} />
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#060D0F', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes sweep { to { transform: rotate(360deg); } }
        @keyframes ping { 0% { transform: scale(.4); opacity: .5; } 100% { transform: scale(1.6); opacity: 0; } }
        @keyframes floatIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .radar { position: absolute; border-radius: 50%; border: 1px solid rgba(111,214,224,.10); }
        .msbtn:hover { background: rgba(111,214,224,.12) !important; }
        .lsbtn:hover { filter: brightness(1.1); }
      `}</style>

      {/* radar backdrop */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(111,214,224,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(111,214,224,.045) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
      {[420, 640, 880, 1140].map(d => (
        <div key={d} className="radar" style={{ width: d, height: d, left: `calc(50% - ${d / 2}px)`, top: `calc(50% - ${d / 2}px)` }} />
      ))}
      <div style={{ position: 'absolute', width: 1140, height: 1140, left: 'calc(50% - 570px)', top: 'calc(50% - 570px)', borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(111,214,224,.14), transparent 18%)', animation: 'sweep 7s linear infinite' }} />
      <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#E8B04B', left: 'calc(50% - 7px)', top: 'calc(50% - 7px)', boxShadow: '0 0 18px #E8B04B' }} />
      <div style={{ position: 'absolute', width: 90, height: 90, borderRadius: '50%', border: '2px solid rgba(232,176,75,.5)', left: 'calc(50% - 45px)', top: 'calc(50% - 45px)', animation: 'ping 2.6s ease-out infinite' }} />

      {/* card */}
      <div style={{ position: 'relative', width: 400, maxWidth: '92vw', padding: '34px 32px 28px', borderRadius: 18, background: 'rgba(10,20,23,.88)', border: '1px solid rgba(111,214,224,.22)', backdropFilter: 'blur(10px)', boxShadow: '0 30px 80px rgba(0,0,0,.55), 0 0 40px rgba(111,214,224,.06)', animation: 'floatIn .5s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center', marginBottom: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9FE870', boxShadow: '0 0 12px #9FE870' }} />
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '.14em', color: '#6FD6E0' }}>LAND SIGNAL</span>
        </div>
        <div style={{ textAlign: 'center', color: '#7C948F', fontSize: 12.5, marginBottom: 22, letterSpacing: '.04em' }}>Land acquisition intelligence · Northbridge / FIT Precast</div>

        <a href="/api/auth/microsoft/start" className="msbtn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(111,214,224,.35)', background: 'rgba(111,214,224,.07)', color: '#E7F1EF', fontSize: 14.5, fontWeight: 600, textDecoration: 'none', marginBottom: 14 }}>
          <svg width="17" height="17" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
          Sign in with Microsoft
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px', color: '#5C736E', fontSize: 11 }}>
          <span style={{ flex: 1, height: 1, background: 'rgba(111,214,224,.15)' }} />or use email<span style={{ flex: 1, height: 1, background: 'rgba(111,214,224,.15)' }} />
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); }}
              style={{ flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: '1px solid ' + (tab === t ? '#E8B04B' : 'rgba(111,214,224,.18)'), background: tab === t ? 'rgba(232,176,75,.14)' : 'transparent', color: tab === t ? '#E8B04B' : '#7C948F' }}>
              {t === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {tab === 'register' && input({ name: 'name', placeholder: 'Your name', value: form.name })}
          {input({ name: 'email', type: 'email', placeholder: 'Work email', value: form.email })}
          {input({ name: 'password', type: 'password', placeholder: tab === 'register' ? 'Create a password (8+ characters)' : 'Password', value: form.password, minLength: tab === 'register' ? 8 : undefined })}
          {tab === 'register' && input({ name: 'inviteCode', placeholder: 'Team code (ask Jacob)', value: form.inviteCode })}
          {(error || urlError) && <div style={{ color: '#FF9D8A', fontSize: 12.5, marginBottom: 10 }}>{error || urlError}</div>}
          <button className="lsbtn" disabled={busy} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #E8B04B, #d99a2b)', color: '#131313', fontWeight: 700, fontSize: 14.5, opacity: busy ? .6 : 1 }}>
            {busy ? 'One sec…' : tab === 'login' ? 'Sign in →' : 'Create account →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: '#5C736E' }}>
          20+ acres · 100 miles · before anyone else
        </div>
      </div>
    </div>
  );
}
