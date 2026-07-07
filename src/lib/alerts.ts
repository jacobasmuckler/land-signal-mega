import nodemailer from 'nodemailer';
// Listing type comes from the generated Prisma client at build time.
type Listing = any;

export async function sendListingAlert(listing: Listing, toEmail?: string) {
  const to = toEmail || process.env.ALERT_TO_EMAIL;
  if (!to) return false;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return false;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  const price = listing.price ? `$${Math.round(listing.price).toLocaleString()}` : listing.priceText || 'Unknown';
  const ppa = listing.pricePerAcre ? `$${Math.round(listing.pricePerAcre).toLocaleString()}/acre` : 'Unknown';
  const body = `${listing.marketStage.toUpperCase()} LAND OPPORTUNITY FOUND

Title: ${listing.title}
Source: ${listing.source}
Address: ${listing.address || 'Unknown'}
Acreage: ${listing.acreage}
Price: ${price}
Price per acre: ${ppa}
Distance from Uptown Charlotte: ${listing.distanceFromCharlotte?.toFixed(1) || 'Unknown'} miles
Listing URL: ${listing.listingUrl || 'No URL found'}
Broker contact: ${listing.brokerName || ''} ${listing.brokerPhone || ''} ${listing.brokerEmail || ''}
Opportunity stage: ${listing.marketStage}
Reason flagged: ${listing.acreage} acres with a verified location inside the target radius.
`;
  try {
    await transporter.sendMail({
      from: user,
      to,
      subject: `${listing.marketStage === 'Pre-Market' ? 'Early land signal' : 'New land listing'}: ${listing.acreage} acres`,
      text: body
    });
    return true;
  } catch (error) {
    console.error('Listing alert email failed; keeping scan successful:', error);
    return false;
  }
}
