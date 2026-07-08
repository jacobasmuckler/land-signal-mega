import { saveSettings } from '@/lib/settings';
import { relativeRedirect } from '@/lib/redirect';

export async function POST(req: Request) {
  const form = await req.formData();
  await saveSettings({
    alertEmail: String(form.get('alertEmail') || ''),
    minAcres: String(form.get('minAcres') || '20'),
    radiusMiles: String(form.get('radiusMiles') || '100'),
    gmailMaxResults: String(form.get('gmailMaxResults') || '100'),
    centerLat: String(form.get('centerLat') || '35.2271'),
    centerLng: String(form.get('centerLng') || '-80.8431'),
    gmailSearchQuery: String(form.get('gmailSearchQuery') || ''),
    weeklyDigestEnabled: form.get('weeklyDigestEnabled') === 'on' ? 'true' : 'false',
    weeklyDigestTo: String(form.get('weeklyDigestTo') || ''),
    instantAlertsEnabled: form.get('instantAlertsEnabled') === 'on' ? 'true' : 'false',
  });
  return relativeRedirect('/settings');
}
