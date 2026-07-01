import { prisma } from './prisma';
import { getSettings } from './settings';
import { searchGmailMessages } from './gmail';
import { parseListingEmail, parseListingEmailListings, guessSource, type ParsedListing } from './parser';
import { geocodeAddress } from './geocode';
import { haversineMiles } from './distance';
import { calculateFitScore } from './fitScore';
import { sendListingAlert } from './alerts';

// Zillow alert emails embed pixel dimensions (e.g. width="2522") that the parser
// misreads as acreage, producing junk rows. Ignore Zillow entirely and rely on
// LandWatch/Land.com/Crexi, which carry clean acreage in the email itself.
const IGNORED_SOURCES = ['Zillow'];

export async function runScan(override?: { query?: string; maxResults?: number }) {
  const settings = await getSettings();
  const log = await prisma.scanLog.create({ data: { notes: 'Started Gmail scan' } });
  let emailsScanned = 0, listingsCreated = 0, alertsSent = 0;
  const minAcres = Number(settings.minAcres || 20);
  const radiusMiles = Number(settings.radiusMiles || 100);
  const centerLat = Number(settings.centerLat || 35.2271);
  const centerLng = Number(settings.centerLng || -80.8431);
  const gmailMaxResults = Math.min(500, Math.max(1, Number(override?.maxResults ?? settings.gmailMaxResults ?? 100)));
  const gmailQuery = override?.query || settings.gmailSearchQuery;

  async function saveOne(parsed: ParsedListing, emailId: string): Promise<boolean> {
    if (!parsed.acreage || parsed.acreage < minAcres) return false;
    // Dedup by listing URL if present; otherwise by address+acreage. Never skip solely
    // because the URL is blank (threaded LandWatch messages often omit clean URLs).
    const orConds = [
      parsed.listingUrl ? { listingUrl: parsed.listingUrl } : undefined,
      parsed.address ? { address: parsed.address, acreage: parsed.acreage } : undefined,
    ].filter(Boolean) as any[];
    if (orConds.length) {
      const already = await prisma.listing.findFirst({ where: { OR: orConds } });
      if (already) return false;
    }

    let lat: number | undefined, lng: number | undefined, distance: number | undefined;
    if (parsed.address) {
      const geo = await geocodeAddress(parsed.address);
      if (geo) { lat = geo.lat; lng = geo.lng; distance = haversineMiles(centerLat, centerLng, lat, lng); }
    }
    if (distance != null && distance > radiusMiles) return false;
    const locationVerified = distance != null;
    const pricePerAcre = parsed.price ? parsed.price / parsed.acreage : undefined;
    const fitScore = calculateFitScore({ acreage: parsed.acreage, distance, pricePerAcre, brokerEmail: parsed.brokerEmail, brokerPhone: parsed.brokerPhone });

    try {
      const listing = await prisma.listing.create({ data: {
        source: parsed.source, title: parsed.title, listingUrl: parsed.listingUrl || undefined, address: parsed.address, county: parsed.county, acreage: parsed.acreage,
        price: parsed.price, priceText: parsed.priceText, pricePerAcre, latitude: lat, longitude: lng, distanceFromCharlotte: distance,
        brokerEmail: parsed.brokerEmail, brokerPhone: parsed.brokerPhone, rawEmailId: emailId, rawSnippet: parsed.rawSnippet, fitScore,
        marketStage: parsed.marketStage, locationVerified, status: locationVerified ? 'New' : 'Needs location'
      }});
      listingsCreated++;
      if (parsed.acreage >= minAcres && distance != null && distance <= radiusMiles) {
        const sent = await sendListingAlert(listing, settings.alertEmail);
        if (sent) { alertsSent++; await prisma.listing.update({ where: { id: listing.id }, data: { alertSent: true } }); }
      }
      return true;
    } catch (e: any) {
      // Unique-URL collision (same listing seen twice in a thread) — not an error, just skip.
      if (e?.code === 'P2002') return false;
      throw e;
    }
  }

  try {
    const emails = await searchGmailMessages(gmailQuery, gmailMaxResults);
    emailsScanned = emails.length;
    for (const email of emails) {
      const source = guessSource(`${email.from || ''} ${email.subject || ''}`);
      if (IGNORED_SOURCES.includes(source)) continue;

      // 1) Try the multi-listing digest parser (LandWatch/Land.com "Saved Searches", Crexi).
      const many = parseListingEmailListings({ from: email.from, subject: email.subject, body: email.body, snippet: email.snippet });
      if (many.length) {
        for (const p of many) await saveOne(p, email.id);
        continue;
      }
      // 2) Fall back to single-listing parse for everything else.
      const one = parseListingEmail({ from: email.from, subject: email.subject, body: email.body, snippet: email.snippet });
      if (one && !IGNORED_SOURCES.includes(one.source)) await saveOne(one, email.id);
    }
    await prisma.scanLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), emailsScanned, listingsCreated, alertsSent, notes: 'Finished scan' } });
    return { emailsScanned, listingsCreated, alertsSent };
  } catch (err: any) {
    await prisma.scanLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), emailsScanned, listingsCreated, alertsSent, notes: err?.message || 'Scan failed' } });
    throw err;
  }
}
