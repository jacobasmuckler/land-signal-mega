import { prisma } from '@/lib/prisma';
import { geocodeAddress } from '@/lib/geocode';
import { haversineMiles } from '@/lib/distance';
import { calculateFitScore } from '@/lib/fitScore';
import { getSettings } from '@/lib/settings';
import { sendListingAlert } from '@/lib/alerts';
import { relativeRedirect } from '@/lib/redirect';

export async function POST(req: Request) {
  const form = await req.formData();
  const settings = await getSettings();
  const acreage = Number(form.get('acreage'));
  const priceRaw = String(form.get('price') || '');
  const price = priceRaw ? Number(priceRaw) : undefined;
  const address = String(form.get('address') || '');
  let latitude: number | undefined, longitude: number | undefined, distanceFromCharlotte: number | undefined;
  if (address) {
    const geo = await geocodeAddress(address);
    if (geo) {
      latitude = geo.lat; longitude = geo.lng;
      distanceFromCharlotte = haversineMiles(Number(settings.centerLat), Number(settings.centerLng), latitude, longitude);
    }
  }
  const pricePerAcre = price ? price / acreage : undefined;
  const fitScore = calculateFitScore({ acreage, distance: distanceFromCharlotte, pricePerAcre, brokerEmail: String(form.get('brokerEmail') || ''), brokerPhone: String(form.get('brokerPhone') || '') });
  const listing = await prisma.listing.create({ data: {
    title: String(form.get('title') || 'Manual Listing'), source: String(form.get('source') || 'Manual'), listingUrl: String(form.get('listingUrl') || '') || undefined,
    address: address || undefined, acreage, price, pricePerAcre, latitude, longitude, distanceFromCharlotte,
    brokerEmail: String(form.get('brokerEmail') || '') || undefined, brokerPhone: String(form.get('brokerPhone') || '') || undefined, fitScore,
    marketStage: String(form.get('marketStage') || 'Listed'),
    locationVerified: distanceFromCharlotte != null,
    status: distanceFromCharlotte == null ? 'Needs location' : 'New'
  }});
  // Instant alerts are opt-in (Settings); the weekly Monday report is the default.
  if (settings.instantAlertsEnabled === 'true' && acreage >= Number(settings.minAcres) && distanceFromCharlotte != null && distanceFromCharlotte <= Number(settings.radiusMiles)) {
    const sent = await sendListingAlert(listing, settings.alertEmail);
    if (sent) await prisma.listing.update({ where: { id: listing.id }, data: { alertSent: true } });
  }
  return relativeRedirect('/');
}
