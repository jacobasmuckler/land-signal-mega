import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const p = await req.json();
    const acreage = Number(p.acres) || 0;
    const address = p.address || p.title || 'Saved parcel';
    // dedupe on address+acreage
    const existing = await prisma.listing.findFirst({ where: { address, acreage } });
    if (existing) return NextResponse.json({ ok: true, already: true });
    await prisma.listing.create({ data: {
      source: 'Parcel Finder',
      title: address,
      address,
      county: p.county || undefined,
      acreage,
      latitude: p.lat ?? undefined,
      longitude: p.lon ?? undefined,
      listingUrl: p.url || undefined,
      status: 'Good',            // saved parcels go straight to the Saved tab
      marketStage: 'Listed',
      fitScore: 5,
      notes: p.owner ? `Owner: ${p.owner}${p.zoning ? ' · Zoning: ' + p.zoning : ''}` : (p.zoning ? `Zoning: ${p.zoning}` : null),
      rawSnippet: 'Saved from Parcel Finder',
    }});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'save failed' }, { status: 500 });
  }
}
