import { prisma } from './prisma';
import { getSettings } from './settings';
import { searchGmailMessages } from './gmail';
import { parseListingEmail, parseListingEmailListings, guessSource, type ParsedListing } from './parser';
import { geocodeAddress } from './geocode';
import { haversineMiles } from './distance';
import { calculateFitScore } from './fitScore';
import { sendListingAlert } from './alerts';

const ALLOWED_SOURCES = ['LandWatch', 'Crexi'];
const SAFE_GMAIL_QUERY = 'newer_than:7d (from:crexi OR from:landwatch OR from:land.com OR from:landsofamerica OR from:landandfarm OR from:support@land.com) -subject:"weekly report" -subject:"daily report" -subject:recap';
const IS_SCHEDULED_SERVICE = /scheduled/i.test(process.env.RAILWAY_SERVICE_NAME || '');

function isAllowedEmail(email: { from?: string; subject?: string; snippet?: string }) {
  const source = guessSource(`${email.from || ''} ${email.subject || ''}`);
  if (!ALLOWED_SOURCES.includes(source)) return false;
  const subject = `${email.subject || ''} ${email.snippet || ''}`.toLowerCase();
  if (/weekly report|daily report|recap|digest complete|land signal|charlotte land weekly/i.test(subject)) return false;
  return true;
}

function isPropertySpecificUrl(url?: string) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.includes('crexi.com')) return /\/properties\/\d+/.test(path);
    if (host.includes('landwatch.com') || host.includes('land.com') || host.includes('landsofamerica.com') || host.includes('landandfarm.com')) {
      return /\/property\/|\/properties\/|\/listing\/|\/land\//.test(path) && !/\/search\b|\/my-landwatch\b|\/saved-search/i.test(path);
    }
    return false;
  } catch {
    return false;
  }
}

export async function runScan(override?: { query?: string; maxResults?: number; sendAlerts?: boolean; notePrefix?: string; expandThreads?: boolean }) {
  const settings = await getSettings();
  const log = await prisma.scanLog.create({ data: { notes: 'Started Gmail scan' } });
  let emailsScanned = 0, listingsCreated = 0, alertsSent = 0;
  const minAcres = Number(settings.minAcres || 20);
  const radiusMiles = Number(settings.radiusMiles || 100);
  const centerLat = Number(settings.centerLat || 35.2271);
  const centerLng = Number(settings.centerLng || -80.8431);
  const gmailMaxResults = Math.min(500, Math.max(1, Number(override?.maxResults ?? settings.gmailMaxResults ?? 50)));
  const gmailQuery = override?.query || SAFE_GMAIL_QUERY;
  const expandsThreads = override?.expandThreads === true;
  const skipped = {
    unsupportedSource: 0,
    noParsedListing: 0,
    noAcreage: 0,
    belowMinAcres: 0,
    missingAddress: 0,
    duplicate: 0,
    geocodeFailed: 0,
    outsideRadius: 0,
  };
  let parsedCandidates = 0;
  type SaveResult = 'created' | 'noAcreage' | 'belowMinAcres' | 'missingAddress' | 'duplicate' | 'geocodeFailed' | 'outsideRadius';

  async function saveOne(parsed: ParsedListing, emailId: string): Promise<SaveResult> {
    parsedCandidates++;
    if (!parsed.acreage) return 'noAcreage';
    if (parsed.acreage < minAcres) return 'belowMinAcres';
    if (!parsed.address) return 'missingAddress';
    // Dedup only on strong identifiers. LandWatch emails often reuse generic/search/
    // tracking links, and older parser versions could collapse different listings into
    // the same address+acreage. Avoid false duplicates by requiring a property-specific
    // URL or the same address + acreage + price.
    const listingUrl = isPropertySpecificUrl(parsed.listingUrl) ? parsed.listingUrl : undefined;
    const orConds = [
      parsed.sourceListingId ? { sourceListingId: parsed.sourceListingId } : undefined,
      listingUrl ? { listingUrl } : undefined,
      parsed.address && parsed.price ? { address: parsed.address, acreage: parsed.acreage, price: parsed.price } : undefined,
    ].filter(Boolean) as any[];
    if (orConds.length) {
      const already = await prisma.listing.findFirst({ where: { OR: orConds } });
      if (already) return 'duplicate';
    }

    let lat: number | undefined, lng: number | undefined, distance: number | undefined;
    const geo = await geocodeAddress(parsed.address);
    if (geo) { lat = geo.lat; lng = geo.lng; distance = haversineMiles(centerLat, centerLng, lat, lng); }
    if (distance == null) return 'geocodeFailed';
    if (distance > radiusMiles) return 'outsideRadius';
    const locationVerified = true;
    const pricePerAcre = parsed.price ? parsed.price / parsed.acreage : undefined;
    const fitScore = calculateFitScore({ acreage: parsed.acreage, distance, pricePerAcre, brokerEmail: parsed.brokerEmail, brokerPhone: parsed.brokerPhone });

    try {
      const listing = await prisma.listing.create({ data: {
        source: parsed.source, sourceListingId: parsed.sourceListingId, title: parsed.title, listingUrl, address: parsed.address, county: parsed.county, acreage: parsed.acreage,
        price: parsed.price, priceText: parsed.priceText, pricePerAcre, latitude: lat, longitude: lng, distanceFromCharlotte: distance,
        brokerEmail: parsed.brokerEmail, brokerPhone: parsed.brokerPhone, rawEmailId: emailId, rawSnippet: parsed.rawSnippet, fitScore,
        marketStage: parsed.marketStage, locationVerified, status: 'New'
      }});
      listingsCreated++;
      if (override?.sendAlerts !== false && !IS_SCHEDULED_SERVICE) {
        const sent = await sendListingAlert(listing, settings.alertEmail);
        if (sent) { alertsSent++; await prisma.listing.update({ where: { id: listing.id }, data: { alertSent: true } }); }
      }
      return 'created';
    } catch (e: any) {
      // Unique-URL collision (same listing seen twice in a thread) — not an error, just skip.
      if (e?.code === 'P2002') return 'duplicate';
      throw e;
    }
  }

  function countSaveResult(result: SaveResult) {
    if (result !== 'created') skipped[result]++;
  }

  try {
    const emails = await searchGmailMessages(gmailQuery, gmailMaxResults, {
      expandThreads: expandsThreads,
    });
    emailsScanned = emails.length;
    for (const email of emails) {
      if (!isAllowedEmail(email)) {
        skipped.unsupportedSource++;
        continue;
      }

      // 1) Try the multi-listing digest parser (LandWatch/Land.com "Saved Searches", Crexi).
      const many = parseListingEmailListings({ from: email.from, subject: email.subject, body: email.body, snippet: email.snippet });
      if (many.length) {
        for (const p of many) countSaveResult(await saveOne(p, email.id));
        continue;
      }
      // 2) Fall back to single-listing parse for everything else.
      const one = parseListingEmail({ from: email.from, subject: email.subject, body: email.body, snippet: email.snippet });
      if (one && ALLOWED_SOURCES.includes(one.source)) countSaveResult(await saveOne(one, email.id));
      else skipped.noParsedListing++;
    }
    const skipSummary = `parsed ${parsedCandidates} candidates; skipped unsupported/report ${skipped.unsupportedSource}, no parsed listing ${skipped.noParsedListing}, no acreage ${skipped.noAcreage}, below ${minAcres} acres ${skipped.belowMinAcres}, missing address ${skipped.missingAddress}, duplicate ${skipped.duplicate}, geocode failed ${skipped.geocodeFailed}, outside ${radiusMiles} miles ${skipped.outsideRadius}`;
    await prisma.scanLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), emailsScanned, listingsCreated, alertsSent, notes: `${override?.notePrefix || 'Finished scan'}: accepted LandWatch/Land.com and Crexi only; Zillow and generic/report emails ignored. ${emailsScanned} emails checked${expandsThreads ? ' after expanding Gmail threads' : ''}, ${listingsCreated} listings added; ${skipSummary}.` } });
    return { emailsScanned, listingsCreated, alertsSent };
  } catch (err: any) {
    await prisma.scanLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), emailsScanned, listingsCreated, alertsSent, notes: err?.message || 'Scan failed' } });
    throw err;
  }
}
