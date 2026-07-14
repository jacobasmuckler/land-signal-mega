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

## Added 2026-07-14 (evening): exact per-house comps from county records
Problem: deal analysis / market stats asked the AI to *web-search* for sold prices
"inside the drawn area" — the web can't be searched by polygon, so it answered "no
new-construction sales found in the boundary" and fell back to broad zip-code numbers.
Fix: new 📈 **Area stats** engine (`src/lib/statsSources.ts`) scans the county GIS for
EVERY parcel inside the drawn area (or radius) and reads the actual records:
- Tier 1 (all states): whatever the parcel layer carries — structure flag, assessed
  building/land/total values, last sale date, land-use description, lot size.
- Tier 2 (county CAMA registry, Mecklenburg NC wired): joins the county tax tables by
  parcel number for real **sale price, year built, heated sqft, beds/baths**.
Output: exact counts (homes, vacant lots, new builds, sales), medians ($, $/sqft,
sqft, year built, lot size) and a line for every matching home. Bulk/apartment
transfers are filtered (price ≤ $3M, $40–1500/sqft) so medians aren't skewed.
"New-construction only" and "3000+ sqft" criteria are applied exactly. Results are
cached per parcel+area, stashed with saved parcels (shows on /saved), and — the key
part — passed to 💰 deal analysis and 📊 market stats as **ground-truth comp data**
the AI must use instead of web guesses (web search only fills gaps like active
listing prices). Verified live in Steele Creek: 1-mi radius → 1,935 parcels, 1,302
homes, 152 real sales with addresses/prices; drawn polygon → 533 parcels, 36 sales,
median $408k/$202 psf. Add more counties in `CAMA_SOURCES` as needed.

## Added 2026-07-14 (later): finder remembers where you left off + Saved rundown UI
- **Finder persistence**: navigating to Saved/Alerts and back now restores the whole
  finder session — search inputs, the full result set on the map, any drawn search
  area, every parcel's analysis setup + pulled reports, active feasibility layers,
  the selected parcel, and the exact map view (sessionStorage; clears when the tab
  closes). Restore runs post-mount so SSR hydration is untouched, and saving is
  gated until restore completes so a fresh page load can't clobber the cache.
- **Saved page rebuilt**: no more "total acres" tile or distance column. Cards show
  acreage/address/county + how many reports were pulled; clicking one opens a full
  rundown modal: owner/zoning, a mini-map with the parcel pin and its comp area
  (drawn polygon or radius), the comp rules used, and every saved AI report (deal
  analysis, market stats, full report, utilities, soil) formatted with timestamps.
  Parcels without a saved workup get a pointer back to the finder. Report renderer
  shared via new `src/lib/formatReport.ts`.

## Fixed 2026-07-14: search-area draw did nothing + real drag-to-draw
Bug: the search-area draw needed a separate "✓ Finish area" click after placing
corners; if you drew the shape but clicked "Find parcels" without hitting Finish
first, the draw was silently discarded and the search fell through to the (often
empty) city text box — "Couldn't find that U.S. place." Fix: both the search-area
and per-parcel comp-area draw now use a real press-drag-release gesture (mousedown
→ mousemove while held → mouseup), tracing an actual freeform shape instead of
click-per-corner, and the polygon commits automatically on mouse-up — no separate
Finish step to forget. A release with almost no on-screen movement (an accidental
click) is ignored and drawing stays active so you can just try again. Map panning
is disabled for the duration of the draw so a drag always traces, never scrolls
the map. Verified live: dragged a real quadrilateral for a search area → committed
instantly → "Find parcels" returned 2,801 parcels from it; same drag-and-commit
verified for a per-parcel comp area.

## Reworked 2026-07-13 (final): per-parcel analysis setup
The comp controls moved OFF the main sidebar. Click a parcel → it highlights, every
other parcel fades, and a "Selected parcel" panel opens at the top of the sidebar with
that parcel's own analysis setup: radius slider, draw-the-analysis-area (popups are
suppressed while drawing so tracing over neighboring parcels never opens them),
new-construction-only toggle, and free-text criteria. Every parcel remembers its own
setup for the session (keyed by parcel id) and the AI reports pulled for it are stashed
the same way. "💾 Save parcel" (panel, popup, or list) persists the drawing + rules +
all pulled reports into the new `Listing.analysisJson` column
(migration 20260713150000_add_analysis_json, applied automatically on deploy).

## Added 2026-07-13: comp data area controls
Sidebar "Comp data area" panel scopes where 💰 Deal analysis, 📊 Market stats and the
📋 report's comps pull data from: a radius slider (0.5–15 mi), a draw-on-map polygon
(click corners, double-click/Finish to close, click-transparent so parcels stay
clickable), a "new-construction comps only" toggle, and a free-text criteria box
(e.g. "3000+ sqft, same school district"). `src/lib/compScope.ts` turns the scope into
HARD prompt constraints (exclude-when-unsure, never silently widen) and the census
tract is sampled at the drawn area's center — so "compare to the neighborhood next
door" uses THAT neighborhood's stats. Reports restate the comp area used.

## Added 2026-07-13 (later): top-20 candidates + drawn search area
Results sidebar now ranks the TOP 20 acquisition candidates instead of the 200 largest:
public/institutional owners (county, church, utility, HOA, railroad…) sink to the bottom;
size-fit vs the search band, compact shape (Polsby-Popper on the boundary), closeness,
estate/heirs or individual owners, having a road address, and res/ag zoning score up.
Each card shows why as chips. Also: "✏️ Draw a search area" under Find parcels — search
inside a drawn polygon (cyan) instead of city+radius; queries the polygon's bbox
envelope, filters to the exact shape, county discovery from the polygon centroid.
Comp area (magenta) and search area (cyan) are independent polygons.

## Known coverage gap (unchanged from before)
NC parcels are statewide; in SC, York + Greenville are wired. Lancaster, Chester, Spartanburg
need a GIS source added to `public/sources.js` later.
