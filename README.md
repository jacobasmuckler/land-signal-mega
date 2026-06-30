# Charlotte Land Opportunity Scanner

Private team web app that scans Gmail alerts for listed and early-signal land opportunities that are **20+ acres** and **within 100 miles of Uptown Charlotte, NC**.

## What it does

- Scans Gmail for real estate alerts from Crexi, Zillow, Redfin, LandWatch, Realtor, LoopNet, brokers, auction notices, foreclosure notices, and rezoning notices.
- Parses title, URL, acreage, price, address, and broker contact info when available.
- Geocodes addresses using free OpenStreetMap/Nominatim.
- Calculates distance from Uptown Charlotte.
- Labels coming-soon, off-market, auction, foreclosure, rezoning, assemblage, and call-for-offers messages as `Pre-Market`.
- Deduplicates listings so you do not get spammed.
- Sends an email alert only when acreage and location are verified. Unknown locations remain on the dashboard as `Needs location`.
- Includes dashboard, settings page, and manual add form.
- Uses a shared PostgreSQL database so the whole team sees the same leads.
- Protects the hosted dashboard with a team username and password.

## Recommended team deployment: Railway

Railway can host the dashboard, PostgreSQL database, and scheduled scanner in one project. Once deployed, teammates can open the generated HTTPS address from any computer or phone.

### 1. Put the project on GitHub

Create a private GitHub repository, upload this project, and push the files. Never commit your `.env` file.

### 2. Create the Railway project

1. Create a project at [Railway](https://railway.com/).
2. Choose **Deploy from GitHub repo** and select the private repository.
3. Add a PostgreSQL database to the same Railway project.
4. Connect the web service's `DATABASE_URL` variable to the PostgreSQL database.
5. Generate a public domain under the web service's networking settings.

Railway will use the included `Dockerfile`. At startup, the app automatically runs the database migrations and then launches the dashboard.

### 3. Add web-service variables

Add every variable from `.env.example` in Railway's Variables page:

- `DATABASE_URL` from the Railway PostgreSQL service.
- `TEAM_USERNAME` and a long random `TEAM_PASSWORD`.
- Gmail OAuth credentials.
- SMTP credentials.
- `ALERT_TO_EMAIL`; multiple recipients can be entered as a comma-separated list.
- `NOMINATIM_EMAIL`.

After redeploying, open the Railway domain. Your browser will request the team username and password.

### 4. Add the scheduled scanner

Create a second Railway service from the same GitHub repository:

1. Give it the same environment variables as the web service.
2. Set its start command to `pnpm scan`.
3. Set its cron schedule to `*/15 * * * *`.
4. Do not generate a public domain for this service.

This checks for new opportunities every 15 minutes. Railway cron schedules use UTC, but this interval is unaffected by timezone.

### Access model

This version uses one shared team username and password. Anyone with those credentials can view the dashboard, change settings, add leads, and trigger a scan. Individual user accounts, roles, and audit history can be added later if needed.

## What “about to go for sale” means

No public source can reliably identify every owner who is about to sell. The scanner treats observable early signals as pre-market leads:

- Broker teasers, off-market emails, and calls for offers.
- Auction, foreclosure, trustee-sale, and tax-sale notices.
- Rezoning filings and development applications.
- Land assemblage and “seeking offers” messages.

For Charlotte proper, the City publishes current rezoning petitions and legal notices on its [official rezoning page](https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Rezoning). NC OneMap provides [statewide parcel resources](https://www.nconemap.gov/pages/parcels), and Mecklenburg County’s [Polaris map](https://polaris3g.mecklenburgcountync.gov/) is useful for parcel verification. These are research/enrichment sources; this version monitors alerts delivered to Gmail rather than scraping government sites.

## First: create free listing alerts

Set saved searches on these sites and send alerts to your Gmail:

1. Crexi: Charlotte commercial land, industrial land, development land.
2. Zillow: Charlotte NC lots/land, lot size 20+ acres.
3. Redfin: property type land, lot size 20+ acres, instant alerts.
4. LandWatch: NC and SC land for sale 20+ acres.
5. Any broker newsletters or LoopNet/CoStar alerts if you receive them.

This app does **not scrape** Zillow, Crexi, Realtor, or Redfin. It scans alert emails you receive.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npx prisma generate
npx prisma db push
npm run dev
```

Open:

```text
http://localhost:3000
```

## Gmail API setup

1. Go to Google Cloud Console.
2. Create a project called `Charlotte Land Scanner`.
3. Enable Gmail API.
4. Create OAuth Client ID credentials for a web app.
5. Add an authorized redirect URI if you use a separate OAuth token helper.
6. Add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REDIRECT_URI` to `.env`.
7. Generate a refresh token with Google OAuth Playground or your preferred OAuth helper.
8. Add `GMAIL_REFRESH_TOKEN` to `.env`.

For easiest first test, use the Manual Add form first. Then wire Gmail once the dashboard works.

## Alert email setup

For Gmail SMTP:

1. Turn on 2-factor authentication on your Google account.
2. Create a Gmail App Password.
3. Put it in `SMTP_PASS`.
4. Put your Gmail in `SMTP_USER`.
5. Put your recipient email in `ALERT_TO_EMAIL`.

## Run scan manually

From the dashboard, click **Scan Now**.

Or run:

```bash
npm run scan
```

## Run automatically on Windows

After `.env` is configured and a manual scan succeeds, open PowerShell in the project folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-scheduled-scan.ps1
```

This creates a Windows Scheduled Task that scans every 15 minutes. To use a different interval:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-scheduled-scan.ps1 -IntervalMinutes 30
```

The computer must be on and connected to the internet. For true 24/7 monitoring, deploy the app and invoke `npm run scan` from a hosted scheduler.

## Recommended Gmail search query

```text
newer_than:7d (from:crexi OR from:zillow OR from:landwatch OR from:redfin OR from:realtor OR from:loopnet OR subject:land OR subject:acre OR subject:acres OR subject:listing OR subject:auction OR subject:foreclosure OR subject:"coming soon" OR subject:rezoning)
```

## Free data-source strategy

The free source is your Gmail inbox. Create saved searches with instant alerts on every relevant marketplace, subscribe to broker newsletters, and route government-notice subscriptions into the same inbox. Coverage depends on the alerts you subscribe to.

## Current parsing limitation

The parser treats each Gmail message as one lead. Configure marketplace searches for immediate or single-listing alerts when possible. Digest emails containing many properties need source-specific templates before every acreage, address, and URL can be paired reliably.

## Important files

- `src/lib/parser.ts` - extracts acreage, price, URL, possible address, broker info.
- `src/lib/distance.ts` - Haversine distance calculation.
- `src/lib/geocode.ts` - free Nominatim geocoding.
- `src/lib/gmail.ts` - Gmail search/read connector.
- `src/lib/scanner.ts` - main scanning pipeline.
- `src/lib/alerts.ts` - sends email alerts.
- `prisma/schema.prisma` - database models.

## Next improvements

- Add exact Crexi/Zillow/Redfin email templates after you receive real alert emails.
- Add MLS/IDX or commercial-data connectors if you obtain licensed access.
- Add county-by-county parcel and notice connectors; a 100-mile circle crosses many NC and SC jurisdictions.
- Add SMS alerts through a provider such as Twilio if email is not fast enough.
