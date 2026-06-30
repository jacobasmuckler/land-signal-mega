# Land Signal — merged mega-app (build notes)

This is `charlotte-land-scanner` (your live Next.js scanner) with two things added and a reskin.

## What was kept exactly as-is (your working pipeline)
- Gmail OAuth connector, scanner, parser, fit-scoring, alerts, settings, Prisma schema/migrations (Postgres).
- The team-password gate (`src/middleware.ts`) — set TEAM_USERNAME + TEAM_PASSWORD.
- All existing env vars (GMAIL_*, SMTP_*, ALERT_TO_EMAIL, DATABASE_URL, etc.) — unchanged.

## What was added
- **Parcel Finder** page at `/finder` — live county-GIS parcel search (from your land-finder app),
  with all 19 target-county quick-jumps and feasibility layers (roads, water/USGS, FEMA flood, USGS topo).
  Reuses the verified ArcGIS query engine. GIS data is fetched browser-side; `public/sources.js` holds the sources.
- Nav link to Parcel Finder; dashboard relabeled "For-Sale Alerts".

## What changed cosmetically
- `globals.css` + `layout.tsx` reskinned to the dark Land Signal survey-console theme.
- Dashboard market-stage shown as colored pills. No data/logic changes.

## Deploy (Railway)
Same service type as your current scanner. Needs: a Postgres plugin (DATABASE_URL),
and the same GMAIL_*, SMTP_*, ALERT_TO_EMAIL, TEAM_USERNAME, TEAM_PASSWORD vars you already use.
`npm start` runs `prisma migrate deploy && next start`.

## Known coverage gap (unchanged from before)
NC parcels are statewide; in SC, York + Greenville are wired. Lancaster, Chester, Spartanburg
need a GIS source added to `public/sources.js` later.
