import { sendWeeklyDigest } from '@/lib/weeklyDigest';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

// "Send test now" from Settings: force-sends the weekly recap immediately,
// optionally to a one-off test recipient, without marking the week as sent.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const testTo = String(form.get('testTo') || '').trim();
    const result = await sendWeeklyDigest({ force: true, to: testTo || undefined });
    if (!result.sent) return relativeRedirect(`/settings?digest=error&detail=${encodeURIComponent(result.reason || 'not sent')}`);
    return relativeRedirect('/settings?digest=sent');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'send failed';
    return relativeRedirect(`/settings?digest=error&detail=${encodeURIComponent(message)}`);
  }
}
