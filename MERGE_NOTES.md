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

## Fix 2026-07-13: NC radius search missing counties + bogus sidebar acreage
NC OneMap's `gisacres` field mixes units by county — Cabarrus submits **square feet**
(a 300-acre parcel reads 13,067,972). Two symptoms: sidebar showed million-acre parcels,
and the `gisacres >= minAcres` server filter meant "20 sq ft" in Cabarrus, flooding the
fetch with every tiny lot until the 25k cap hit and remaining map tiles (whole counties)
were skipped. Fix: NC now filters server-side on `Shape__Area` (sq ft, computed by the
service, consistent statewide — new `geomAreaField`/`geomAreaUnit` source options), and
`normalize()` trusts that field over per-county attributes. Also fixed `polyAcres` to sum
all rings (multi-part parcels/holes) instead of only the first ring.

## Added 2026-07-13: comp data area controls
Sidebar "Comp data area" panel scopes where 💰 Deal analysis, 📊 Market stats and the
📋 report's comps pull data from: a radius slider (0.5–15 mi), a draw-on-map polygon
(click corners, double-click/Finish to close, click-transparent so parcels stay
clickable), a "new-construction comps only" toggle, and a free-text criteria box
(e.g. "3000+ sqft, same school district"). `src/lib/compScope.ts` turns the scope into
HARD prompt constraints (exclude-when-unsure, never silently widen) and the census
tract is sampled at the drawn area's center — so "compare to the neighborhood next
door" uses THAT neighborhood's stats. Reports restate the comp area used.

## Known coverage gap (unchanged from before)
NC parcels are statewide; in SC, York + Greenville are wired. Lancaster, Chester, Spartanburg
need a GIS source added to `public/sources.js` later.
