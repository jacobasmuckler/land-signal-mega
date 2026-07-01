import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// One-time cleanup: remove Zillow rows (bad acreage from pixel-width parsing).
// Visit /api/cleanup once after deploy. Safe to run multiple times.
export async function GET() {
  const result = await prisma.listing.deleteMany({ where: { source: 'Zillow' } });
  return NextResponse.json({ deleted: result.count, source: 'Zillow' });
}
