import { prisma } from '@/lib/prisma';
import SavedGrid from './SavedGrid';

export const dynamic = 'force-dynamic';

export default async function SavedPage() {
  const rows = await prisma.listing.findMany({
    where: { status: 'Good' },
    orderBy: [{ fitScore: 'desc' }, { dateFound: 'desc' }],
  });
  // The per-parcel analysis setup + AI reports (Round 12/13) ride along as one
  // JSON blob — parse it server-side so the client just renders plain data.
  const listings = rows.map((l: any) => {
    let analysis: any = null;
    if (l.analysisJson) { try { analysis = JSON.parse(l.analysisJson); } catch {} }
    return {
      id: l.id, source: l.source, title: l.title, address: l.address, county: l.county,
      acreage: l.acreage, latitude: l.latitude, longitude: l.longitude,
      listingUrl: l.listingUrl, notes: l.notes, price: l.price, pricePerAcre: l.pricePerAcre,
      dateFound: l.dateFound.toISOString(), analysis,
    };
  });
  return <SavedGrid listings={listings} />;
}
