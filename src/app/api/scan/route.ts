import { runScan } from '@/lib/scanner';
import { relativeRedirect } from '@/lib/redirect';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    await runScan();
    return relativeRedirect('/alerts');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The scan failed';
    console.error('Manual scan failed:', error);
    return new NextResponse(
      `The scan could not complete: ${message}\n\nUse your browser Back button to return to the dashboard.`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
}
