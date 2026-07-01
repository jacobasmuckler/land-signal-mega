import { prisma } from './prisma';
import { getSettings } from './settings';
import { searchGmailMessages } from './gmail';
import { parseListingEmail } from './parser';
import { geocodeAddress } from './geocode';
import { haversineMiles } from './distance';
import { calculateFitScore } from './fitScore';
import { sendListingAlert } from './alerts';

export async function runScan() {
  const settings = await getSettings();
  const log = await prisma.scanLog.create({ data: { notes: 'Started Gmail scan' } });
  let emailsScanned = 0, listingsCreated = 0, alertsSent = 0;
  const minAcres = Number(settings.minAcres || 20);
  const radiusMiles = Number(settings.radiusMiles || 100);
  const centerLat = Number(settings.centerLat || 35.2271);
  const centerLng = Number(settings.centerLng || -80.8431);
  const gmailMaxResults = Math.min(500, Math.max(1, Number(settings.gmailMaxResults || 100)));

  try {
    const emails = await searchGmailMessages(settings.gmailSearchQuery, gmailMaxResults);
    emailsScanned = emails.length;
    for (const email of emails) {
      const parsed = parseListingEmail({ from: email.from, subject: email.subject, body: email.body, snippet: email.snippet });
      if (!parsed) continue;
      // Ignored sources: Zillow alert emails embed pixel dimensions (e.g. width="2522")
      // that the parser misreads as acreage, producing junk rows. Skip them entirely and
      // rely on LandWatch/Crexi/Land.com, which put clean acreage in the email itself.
      const IGNORED_SOURCES = ['Zillow'];
      if (IGNORED_SOURCES.includes(parsed.source)) continue;
      if (!parsed.acreage || parsed.acreage < minAcres) continue;

      const already = await prisma.listing.findFirst({
        where: { OR: [
          parsed.listingUrl ? { listingUrl: parsed.listingUrl } : undefined,
          parsed.address ? { address: parsed.address, acreage: parsed.acreage } : undefined,
          { rawEmailId: email.id },
        ].filter(Boolean) as any }
      });
      if (already) continue;

      let lat: number | undefined; let lng: number | undefined; let distance: number | undefined;
      if (parsed.address) {
        const geo = await geocodeAddress(parsed.address);
        if (geo) { lat = geo.lat; lng = geo.lng; distance = haversineMiles(centerLat, centerLng, lat, lng); }
      }
      if (distance != null && distance > radiusMiles) continue;
      const locationVerified = distance != null;
      const pricePerAcre = parsed.price ? parsed.price / parsed.acreage : undefined;
      const fitScore = calculateFitScore({ acreage: parsed.acreage, distance, pricePerAcre, brokerEmail: parsed.brokerEmail, brokerPhone: parsed.brokerPhone });

      const listing = await prisma.listing.create({ data: {
        source: parsed.source, title: parsed.title, listingUrl: parsed.listingUrl, address: parsed.address, acreage: parsed.acreage,
        price: parsed.price, priceText: parsed.priceText, pricePerAcre, latitude: lat, longitude: lng, distanceFromCharlotte: distance,
        brokerEmail: parsed.brokerEmail, brokerPhone: parsed.brokerPhone, rawEmailId: email.id, rawSnippet: parsed.rawSnippet, fitScore,
        marketStage: parsed.marketStage, locationVerified, status: locationVerified ? 'New' : 'Needs location'
      }});
      listingsCreated++;
      const qualifies = parsed.acreage >= minAcres && distance != null && distance <= radiusMiles;
      if (qualifies) {
        const sent = await sendListingAlert(listing, settings.alertEmail);
        if (sent) {
          alertsSent++;
          await prisma.listing.update({ where: { id: listing.id }, data: { alertSent: true } });
        }
      }
    }
    await prisma.scanLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), emailsScanned, listingsCreated, alertsSent, notes: 'Finished scan' } });
    return { emailsScanned, listingsCreated, alertsSent };
  } catch (err: any) {
    await prisma.scanLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), emailsScanned, listingsCreated, alertsSent, notes: err?.message || 'Scan failed' } });
    throw err;
  }
}
