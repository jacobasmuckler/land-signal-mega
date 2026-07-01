import { runScan } from '@/lib/scanner';
import { relativeRedirect } from '@/lib/redirect';

export async function POST() {
  try {
    await runScan();
  } catch (error) {
    console.error('Manual scan failed:', error);
  }
  return relativeRedirect('/alerts');
}
