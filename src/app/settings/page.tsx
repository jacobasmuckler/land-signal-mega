import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function fmtEastern(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
}

export default async function SettingsPage({ searchParams }: { searchParams?: { digest?: string; detail?: string } }) {
  const s = await getSettings();
  const connectedEmail = s.GMAIL_CONNECTED_EMAIL;
  const connectedAt = s.GMAIL_CONNECTED_AT;
  const digestState = searchParams?.digest;
  const digestDetail = searchParams?.detail;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold display">Settings</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>Search filters, Gmail connection, and the weekly report.</p>
      </div>

      {digestState === 'sent' && (
        <div className="card p-4" style={{ borderColor: 'var(--lime)', color: 'var(--lime)' }}>
          ✓ Weekly report sent — check the inbox (and spam folder the first time).
        </div>
      )}
      {digestState === 'error' && (
        <div className="card p-4" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>
          Weekly report failed: {digestDetail || 'unknown error'}.
          {/scope|reconnect|authoriz/i.test(digestDetail || '') && <> Click <b>Reconnect Gmail</b> below, approve the send permission, then try again.</>}
        </div>
      )}

      {/* ── Gmail connection ─────────────────────────────────────────── */}
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Gmail connection</h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {connectedEmail
                ? <>Connected to <b style={{ color: 'var(--text)' }}>{connectedEmail}</b>{connectedAt ? ` on ${fmtEastern(connectedAt)}` : ''}.</>
                : 'No saved Gmail connection yet, or the app is still using the old Railway token.'}
            </p>
          </div>
          <a className="btn btn-primary" href="/api/auth/gmail/start">Reconnect Gmail</a>
        </div>
        <p className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
          Use the inbox that receives the LandWatch/Land.com and Crexi alerts. Reconnecting grants read access for scanning <b>and</b> send access for the weekly report — no tokens to paste anywhere.
        </p>
      </div>

      {/* ── Weekly report ────────────────────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Weekly report email</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>A recap of the week&apos;s new leads and team picks, sent automatically every <b style={{ color: 'var(--text)' }}>Monday at 9:00 AM Eastern</b>.</p>
        </div>
        <form action="/api/settings" method="post" className="space-y-4">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <input type="checkbox" name="weeklyDigestEnabled" defaultChecked={(s.weeklyDigestEnabled || 'true') === 'true'} />
            Send the weekly report automatically
          </label>
          <div>
            <label className="label">Send to (comma-separated)</label>
            <input name="weeklyDigestTo" defaultValue={s.weeklyDigestTo} className="input" placeholder="boss@company.com, you@company.com" />
          </div>
          {/* keep the rest of the settings unchanged when saving from this card */}
          <input type="hidden" name="alertEmail" value={s.alertEmail} />
          <input type="hidden" name="minAcres" value={s.minAcres} />
          <input type="hidden" name="radiusMiles" value={s.radiusMiles} />
          <input type="hidden" name="gmailMaxResults" value={s.gmailMaxResults} />
          <input type="hidden" name="centerLat" value={s.centerLat} />
          <input type="hidden" name="centerLng" value={s.centerLng} />
          <input type="hidden" name="gmailSearchQuery" value={s.gmailSearchQuery} />
          <button className="btn btn-primary">Save weekly report settings</button>
        </form>
        <form action="/api/weekly-digest" method="post" className="flex items-end gap-3 flex-wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div style={{ flex: '1 1 240px' }}>
            <label className="label">Send a test right now (optional different recipient)</label>
            <input name="testTo" className="input" placeholder={`leave blank to use: ${s.weeklyDigestTo || 'the list above'}`} />
          </div>
          <button className="btn" type="submit">Send test now</button>
        </form>
      </div>

      {/* ── Search filters ───────────────────────────────────────────── */}
      <form action="/api/settings" method="post" className="card p-6 space-y-4">
        <h2 className="text-xl font-semibold">Search filters</h2>
        <div><label className="label">Instant Alert Email</label><input name="alertEmail" defaultValue={s.alertEmail} className="input" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Minimum Acres</label><input name="minAcres" defaultValue={s.minAcres} className="input" /></div>
          <div><label className="label">Radius Miles</label><input name="radiusMiles" defaultValue={s.radiusMiles} className="input" /></div>
        </div>
        <div><label className="label">Maximum Emails Per Scan</label><input name="gmailMaxResults" type="number" min="1" max="500" defaultValue={s.gmailMaxResults} className="input" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Center Latitude</label><input name="centerLat" defaultValue={s.centerLat} className="input" /></div>
          <div><label className="label">Center Longitude</label><input name="centerLng" defaultValue={s.centerLng} className="input" /></div>
        </div>
        <div><label className="label">Gmail Search Query</label><textarea name="gmailSearchQuery" defaultValue={s.gmailSearchQuery} className="input min-h-32" /></div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Leads that can&apos;t be geocoded stay on the dashboard as “Needs location” instead of being dropped.</p>
        {/* keep weekly settings unchanged when saving from this card */}
        <input type="hidden" name="weeklyDigestTo" value={s.weeklyDigestTo} />
        {(s.weeklyDigestEnabled || 'true') === 'true' && <input type="hidden" name="weeklyDigestEnabled" value="on" />}
        <button className="btn btn-primary">Save Settings</button>
      </form>
    </div>
  );
}
