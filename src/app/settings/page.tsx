import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const s = await getSettings();
  const connectedEmail = s.GMAIL_CONNECTED_EMAIL;
  const connectedAt = s.GMAIL_CONNECTED_AT;
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Edit your land search filter, Gmail connection, and scan query.</p>

      <div className="card p-6 space-y-3 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Gmail connection</h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {connectedEmail
                ? <>Connected to <b style={{ color: 'var(--text)' }}>{connectedEmail}</b>{connectedAt ? ` on ${new Date(connectedAt).toLocaleString()}` : ''}.</>
                : 'No saved Gmail connection yet, or the app is still using the old Railway token.'}
            </p>
          </div>
          <a className="btn btn-primary" href="/api/auth/gmail/start">Reconnect Gmail</a>
        </div>
        <p className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
          Use the Gmail inbox that receives LandWatch/Land.com and Crexi alerts. This saves the refresh token inside the app settings so you do not have to paste a new token into Railway.
        </p>
      </div>

      <form action="/api/settings" method="post" className="card p-6 space-y-4">
        <div><label className="label">Alert Email</label><input name="alertEmail" defaultValue={s.alertEmail} className="input" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Minimum Acres</label><input name="minAcres" defaultValue={s.minAcres} className="input" /></div>
          <div><label className="label">Radius Miles</label><input name="radiusMiles" defaultValue={s.radiusMiles} className="input" /></div>
        </div>
        <div><label className="label">Maximum Emails Per Scan</label><input name="gmailMaxResults" type="number" min="1" max="500" defaultValue={s.gmailMaxResults} className="input" /></div>
        <p className="text-sm text-slate-600">Alerts require a geocoded address inside the radius. Leads with unknown locations remain on the dashboard for review.</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Center Latitude</label><input name="centerLat" defaultValue={s.centerLat} className="input" /></div>
          <div><label className="label">Center Longitude</label><input name="centerLng" defaultValue={s.centerLng} className="input" /></div>
        </div>
        <div><label className="label">Gmail Search Query</label><textarea name="gmailSearchQuery" defaultValue={s.gmailSearchQuery} className="input min-h-32" /></div>
        <button className="btn btn-primary">Save Settings</button>
      </form>
    </div>
  );
}
