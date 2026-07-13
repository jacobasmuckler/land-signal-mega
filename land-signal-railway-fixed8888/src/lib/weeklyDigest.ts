import { prisma } from './prisma';
import { getSettings, saveSettings } from './settings';
import { sendGmail } from './gmail';

// ── Eastern-time helpers ──────────────────────────────────────────────────────
function easternNow(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    weekday: parts.weekday,                       // e.g. "Mon"
    hour: Number(parts.hour === '24' ? 0 : parts.hour),
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function money(value?: number | null) {
  return value ? `$${Math.round(value).toLocaleString()}` : '—';
}

function esc(value?: string | null) {
  return (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Weekly recap ──────────────────────────────────────────────────────────────
// Auto mode (no options): only sends on Monday at/after 9am ET, once per day.
// force: true bypasses the gate and the once-per-day dedupe (used by the
// "Send test now" button) and does NOT mark the week as sent.
export async function sendWeeklyDigest(options: { force?: boolean; to?: string } = {}) {
  const settings = await getSettings();
  const eastern = easternNow();

  if (!options.force) {
    if ((settings.weeklyDigestEnabled || 'true') !== 'true') return { sent: false, reason: 'weekly digest disabled in Settings' };
    if (eastern.weekday !== 'Mon') return { sent: false, reason: `not Monday (ET: ${eastern.weekday})` };
    if (eastern.hour < 9) return { sent: false, reason: `before 9am ET (ET hour: ${eastern.hour})` };
    if (settings.weeklyDigestLastSent === eastern.ymd) return { sent: false, reason: 'already sent today' };
  }

  const to = (options.to || settings.weeklyDigestTo || settings.alertEmail || '')
    .split(/[,;]+/).map(s => s.trim()).filter(Boolean).join(', ');
  if (!to) return { sent: false, reason: 'no recipients configured — set them in Settings' };

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const listings = await prisma.listing.findMany({
    where: { dateFound: { gte: since } },
    orderBy: [{ locationVerified: 'desc' }, { fitScore: 'desc' }, { dateFound: 'desc' }],
  });
  const goodPicks = await prisma.listing.findMany({
    where: { status: 'Good' },
    orderBy: [{ fitScore: 'desc' }, { dateFound: 'desc' }],
    take: 8,
  });

  const verified = listings.filter((l: any) => l.locationVerified);
  const needsLocation = listings.filter((l: any) => !l.locationVerified);
  const weekLabel = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });

  const row = (l: any) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap">${l.acreage} ac</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${esc(l.address || l.title)}${l.county ? `<br><span style="color:#6b7280;font-size:12px">${esc(l.county)} County</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${money(l.price)}${l.pricePerAcre ? `<br><span style="color:#6b7280;font-size:12px">${money(l.pricePerAcre)}/ac</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${l.distanceFromCharlotte != null ? l.distanceFromCharlotte.toFixed(0) + ' mi' : 'Unverified'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${l.listingUrl ? `<a href="${esc(l.listingUrl)}" style="color:#0e7490">View →</a>` : '—'}</td>
    </tr>`;

  const table = (rows: any[]) => `
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:8px">
      <tr style="text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.05em">
        <th style="padding:6px 10px">Acres</th><th style="padding:6px 10px">Location</th><th style="padding:6px 10px">Price</th><th style="padding:6px 10px">From CLT</th><th style="padding:6px 10px">Link</th>
      </tr>
      ${rows.map(row).join('')}
    </table>`;

  const stat = (label: string, value: number | string) => `
    <td style="padding:14px 18px;background:#f3f4f6;border-radius:10px;text-align:center">
      <div style="font-size:26px;font-weight:700;color:#111827">${value}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px">${label}</div>
    </td>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#111827">
    <h1 style="font-size:22px;margin:18px 0 4px">Land Signal — Weekly Land Report</h1>
    <p style="color:#6b7280;margin:0 0 18px">Week ending ${weekLabel} · 20+ acres within 100 miles of Charlotte</p>
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-bottom:6px"><tr>
      ${stat('New this week', listings.length)}
      ${stat('Verified in radius', verified.length)}
      ${stat('Needs location', needsLocation.length)}
      ${stat('Team good picks', goodPicks.length)}
    </tr></table>

    ${verified.length ? `<h2 style="font-size:16px;margin:22px 0 2px">New verified listings</h2>${table(verified.slice(0, 15))}` : '<p style="margin:20px 0;color:#6b7280">No new location-verified listings matched this week.</p>'}
    ${needsLocation.length ? `<h2 style="font-size:16px;margin:22px 0 2px">Needs a location check</h2>${table(needsLocation.slice(0, 8))}` : ''}
    ${goodPicks.length ? `<h2 style="font-size:16px;margin:22px 0 2px">Current team picks</h2>${table(goodPicks)}` : ''}

    <p style="color:#9ca3af;font-size:12px;margin-top:26px">Sent automatically every Monday at 9:00 AM ET by Land Signal.</p>
  </div>`;

  const textLines = [
    `Land Signal — Weekly Land Report (week ending ${weekLabel})`,
    `New this week: ${listings.length} · Verified in radius: ${verified.length} · Needs location: ${needsLocation.length} · Good picks: ${goodPicks.length}`,
    '',
    ...verified.slice(0, 15).map((l: any) => `- ${l.acreage} ac · ${l.address || l.title} · ${money(l.price)} · ${l.distanceFromCharlotte != null ? l.distanceFromCharlotte.toFixed(0) + ' mi' : 'unverified'}${l.listingUrl ? ' · ' + l.listingUrl : ''}`),
  ];

  await sendGmail({
    to,
    subject: `Land Signal weekly report — ${listings.length} new lead${listings.length === 1 ? '' : 's'} (${weekLabel})`,
    html,
    text: textLines.join('\n'),
  });

  if (!options.force) await saveSettings({ weeklyDigestLastSent: eastern.ymd });
  return { sent: true, to, newListings: listings.length };
}
