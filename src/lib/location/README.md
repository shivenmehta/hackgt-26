# Nearby food access with OpenStreetMap

Python 3.10+, standard library only. No API key, `.env.local` change, Supabase
migration, or OSM account is needed. This module is separate from the Next.js UI.
It queries the public Overpass service and maintains a local SQLite cache database.

From the **hackgt-26** repository root, try a demonstration search around Georgia
Tech (these are demo coordinates, not inferred user location):

```powershell
python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963 --radius-m 5000 --output test-results/nearby-food-access.json
```

Use `py` if that is your Windows Python launcher. Replace `--lat` and `--lon` with
your location. Radius is in meters, up to 25,000; output distances are in miles.
No address geocoding is implemented. A future web form can supply coordinates from
an explicit location selection or browser geolocation permission.

The terminal groups results into **General food resources** and **SNAP & food assistance**,
nearest first, with ten displayed per group by default. `--limit 20` changes that
display limit; the JSON includes all matches. No invented sample stores are shown.
Empty assistance results mean no matching OSM features were found, not no help exists.

## Query and workflow

1. Validate coordinates and radius.
2. Check the SQLite cache for this endpoint, location and radius (24-hour TTL).
3. On a cache miss, submit one read-only Overpass query with these filters:
   - `shop=supermarket`, `shop=grocery`, `shop=convenience`
   - `shop=farm`, `amenity=marketplace`
   - `social_facility=food_bank`, `social_facility=soup_kitchen`
   - `amenity=food_sharing`
   - `amenity=community_centre` (potential contacts only)
4. Query nodes, ways and relations. Ways/relations use their bounding-box centers.
5. Normalize categories, names, contact details and tags. Deduplicate by OSM
   type plus ID. Exclude explicitly private/no-access and closed/disused features.
6. Calculate Haversine distances, filter representative points to the radius,
   sort, display, and optionally export a JSON snapshot.

Social facilities normally also have `amenity=social_facility`; the query accepts
the requested social-facility subkeys even if that companion tag is missing.
Facilities with multiple semicolon-separated social types are supported. One OSM
object matching assistance and retail is displayed under assistance with raw tags
preserved. Distinct OSM node/way records for one real business may still duplicate
it; matching names alone is not sufficient to merge branches safely.

An explicit food-bank/soup-kitchen tag takes precedence over a community-centre
tag, so the same feature is not listed twice. Missing `amenity=social_facility`
is noted in `tagging_warnings`, not used to reject the record. Semicolon-separated
social types support surrounding whitespace. A bare `amenity=social_facility`
without a food-specific subtag is not included: it could describe unrelated care.

Community centres with no food-specific subtag appear only in
`potential_assistance`. `assistance_evidence` is `community_centre_only` for those,
`explicit_osm_tag` for tagged food assistance/sharing, and `not_indicated` for
retail. `services_verified` remains false in every case. These are mapping evidence
labels, not real-world verification. A marketplace can sell nonfood goods; verify
vendors and operating days. Farm shops and marketplaces appear in
`alternative_food_retail`, not the assistance list.

## Database and reusable interface

Default database: `test-results/osm-cache.sqlite3` (gitignored). Table:

```sql
osm_search_cache(query_key TEXT PRIMARY KEY, fetched_at REAL, payload TEXT)
```

The key hashes the query and endpoint; the payload preserves the OSM response.
Expanding the query changes its cache key automatically; no cache deletion is needed.
This is a local query cache, not a full copy of OSM or a hosted Supabase table.
Successful empty searches are cached too. Failed or partial Overpass responses
are not cached. Expired data is not silently substituted when the network fails.
Use `--refresh` only when needed; `--cache` and `--cache-hours` configure storage.
`--endpoint` selects another trusted HTTPS Overpass provider explicitly.

```python
from src.lib.location.overpass import search_food_access

access = search_food_access(33.7756, -84.3963, radius_m=5000)
stores = access["nearby_food_access"]
assistance = access["food_assistance"]
markets = access["alternative_food_retail"]
potential_contacts = access["potential_assistance"]
```

Each place includes `place_id` (`osm:node/123`), name, categories, coordinates,
coordinate source, distance in meters/miles, address, opening hours, phone,
website, wheelchair/access tags, target population tags, OSM URL and original tags.
The result includes fetch time, OSM base timestamp, cache status and attribution.
Missing fields are `None`; opening-hours strings are not evaluated as open-now.
Treat names, tags and website URLs as external input when rendering a future UI.

The JSON snapshot contains the requested origin coordinates. Keep it gitignored;
coordinates are also sent to the selected public Overpass provider during lookup.

## Later integration with recipes and KNN

Carry `access` alongside nutrient matches in the planning response:

```python
response = {"recipe_candidates": ranked_recipes, "food_access": access}
```

Do not attach these places to arbitrary USDA foods or infer inventory, prices,
SNAP acceptance or pantry eligibility. `inventory_verified` and
`eligibility_verified` are false. A soup kitchen provides prepared meals; it is
not automatically a source of grocery ingredients. Add verified links later:

```text
place_id -> product/ingredient ID -> availability, package size, price, checked_at
```

Once those links exist, access constraints can filter purchasable ingredients and
travel costs can enter the weekly optimizer. Keep geographic distance outside the
nutrient vector. KNN and linear/integer programming are unchanged in this step.

## Accuracy, attribution and service use

Distances are straight-line estimates, not walking or driving routes. Polygon
centers are approximate and may not be entrances; an intersecting site's center
can be outside the radius and be excluded. OSM coverage and business/service
details can be incomplete or outdated. Confirm pantry hours, eligibility and
public distribution before suggesting a visit; no assistance availability is guaranteed.

Display **© OpenStreetMap contributors**, linking to
[OSM copyright and ODbL](https://www.openstreetmap.org/copyright), with exported data
and future UI results. Public Overpass servers are shared and can be overloaded.
The client uses an identifying User-Agent, one bounded query, caching, finite
timeouts, and explicit busy/error messages without automatic retry loops.
For substantial multi-user traffic, use a suitable provider or self-hosted service.

Sources: [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API),
[query language](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL),
[food banks](https://wiki.openstreetmap.org/wiki/Tag:social_facility%3Dfood_bank),
[soup kitchens](https://wiki.openstreetmap.org/wiki/Tag:social_facility%3Dsoup_kitchen),
[food sharing](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dfood_sharing).
Additional tags: [farm shops](https://wiki.openstreetmap.org/wiki/Tag:shop%3Dfarm),
[marketplaces](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dmarketplace),
[community centres](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dcommunity_centre).

Run offline tests:

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
```

## USDA SNAP retailer CSV source

The SNAP integration uses Python `csv` and SQLite, so **pandas and an API key are
not required**. It reads the CURRENT USDA locator export, not the separate
historical authorization dataset. Historical files include formerly authorized
retailers and must not be treated as current acceptance records.

Source: [USDA SNAP Retailer Locator](https://www.fna.usda.gov/snap/retailer-locator).
Its Data Resources link identifies ArcGIS item `8b260f9a10b0459aa441ad8588c2251c`.
[Current CSV export](https://hub.arcgis.com/api/download/v1/items/8b260f9a10b0459aa441ad8588c2251c/csv?layers=0).

A downloaded snapshot is already imported locally. Run the two external sources:

```powershell
python -m src.lib.location.nearby --lat 35.7745 --lon -84.3963 --radius-m 5000 --sources osm snap --output test-results/nearby-osm-snap.json
```

Run SNAP only (offline after import):

```powershell
python -m src.lib.location.nearby --lat 35.7745 --lon -84.3963 --radius-m 5000 --sources snap
```

The default requests OSM and local community events. Add `feedam` to `--sources` for nearby and urgent directory listings. `--snap-db` selects a
custom SQLite database. Sources run independently: if one fails, successful
results remain available, the output reports PARTIAL RESULTS, and JSON includes
`source_status`, `source_errors`, and `partial_results`. If all requested sources
fail, the command exits with an error. A successful empty search is not a failure.

### Import and refresh

Download the current CSV to `test-results/snap-retailers.csv`, then run:

```powershell
python -m src.lib.location.snap --csv test-results/snap-retailers.csv
```

Use `--retrieved-on YYYY-MM-DD` if downloaded earlier; otherwise today is recorded.
`--db` chooses a different database. `--source-url` records an alternate export URL.
No automatic download runs during nearby searches. `--refresh` on `nearby` only
refreshes OSM; refresh SNAP by downloading and reimporting its current CSV.

The first import read 251,574 rows with no invalid rows or duplicate IDs, retrieved
September 26, 2026. A CSV retrieval date is not its publication/authorization date;
`source_data_as_of` remains null because the export does not provide that value.
Metadata retains retrieval/import times, source URL, counts and a SHA-256 checksum.
Raw CSV, SQLite database and output snapshots are in gitignored `test-results/`.
They are not pushed to teammates; teammates need to download/import their own copy.

`snap.py` maps USDA columns `Record_ID`, `Store_Name`, `Store_Type`, `Latitude`,
`Longitude`, `Store_Street_Address`, `Additonal_Address` (USDA spelling), `City`,
`State`, `Zip_Code`, `Zip4`, and `County`. Spaces versus underscores in headers are
accepted. ZIP codes stay strings to preserve leading zeros. Projected `X`/`Y`
columns are deliberately ignored; the geographic latitude/longitude columns are
used. Coordinates outside valid ranges, null/nonfinite coordinates and (0, 0) are
skipped and counted. Identical duplicate IDs are counted; conflicting duplicates
abort the import. Historical date headers or missing required columns are rejected.
The caller must still select the current official export; headers alone cannot
prove data provenance.

The local database `test-results/snap-retailers.sqlite3` contains `snap_retailers`
(with a latitude index) and `snap_metadata`. An import replaces its snapshot in a
transaction; a failed import preserves the previous data. Nearby lookup reads the
database without network access, uses a latitude band to reduce candidates, then
applies the same Haversine formula and 6,371,008.8 m Earth radius as OSM. Results are
sorted by straight-line distance, including correct handling across the antimeridian.

### Combined result contract

A new `snap_retailers` list contains retailer name/type, coordinates, distance,
formatted and structured address, `usda_snap:<Record_ID>` identity, source URL,
retrieval date and `snap_status=listed_in_current_locator_export`.
`snap_acceptance_verified_live` and `inventory_verified` remain false.
`snap_snapshot` describes the imported dataset and `snap_limitations` describes
its interpretation. SNAP retailers are purchasable-food options, not food banks
or free-food services. No individual SNAP eligibility is inferred.

OSM and USDA raw records remain separate audit lists; a store can occur in both. Do not add
their counts as unique locations or join them by name alone. The canonical `locations`
list now reconciles strong matches as documented below. Neither source supplies
current shelf inventory, prices or a reliable link to USDA nutrient food IDs, so
this change does not alter KNN or claim that meal ingredients are in stock.

## Feed America (feedam.org): nearby and urgent assistance

**Identity:** this provider calls itself Feed America (EIN 92-1761881), not
Feeding America. We use the requested feedam.org service and preserve its own
publisher attribution plus each record original `data_source`. Do not infer a
relationship with the Feeding America national network. The live API response
provides no data-license value, so this implementation does not assert a blanket
license for underlying third-party records.

```powershell
python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963 --radius-m 5000 --sources osm snap feedam --output test-results/nearby-all-sources.json
python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963 --radius-m 5000 --sources feedam
```

No key or new dependency is required. `feedam.py` makes two sequential GET requests:

- `/api/resources/nearby`: `lat`, `lng`, `mode=free`, `radius` in miles, `limit=100`.
- `/api/resources/urgent`: `lat`, `lng`, `radius` in miles.

Both endpoints are fetched fresh on each run; no local urgent-response cache is
used. A saved JSON snapshot is historical evidence, not a live open-now indicator.
Calls have 30-second timeouts and no automatic retry loop. Each endpoint can fail
independently; a successful endpoint remains usable with an explicit partial
status. Both failing marks Feedam unavailable while other sources remain usable.

API documentation for these endpoints is sparse: request parameters are listed
but full schemas/pagination are not specified. The adapter validates the observed
`success`/`resources` response structure and source IDs. Nearby searches may be
capped or expanded by the provider. Returned coordinates are checked and Haversine
distance is recalculated to enforce the original radius. `feedam_endpoints`
records counts, excluded rows, radius expansion, fetch timestamps, provider
messages, and possible truncation. No undocumented pagination is assumed.
`total_available` is preserved as provider metadata, not claimed as an exact
in-radius count. Missing coordinates are excluded rather than assigned a distance.

Urgent matches receive `reported_by_urgent_endpoint=true`. That flag means the
provider included the listing; it does not independently verify opening hours,
stock or eligibility. An empty urgent response does not prove nearby pantries are
closed. Raw `hours_status`, `live_status`, requirements, appointment flags,
verification status/date and source information are retained. Call before visiting.

### Duplicate handling and canonical output

`deduplicate.py` constructs a canonical `locations` list used for terminal output.
The original OSM, SNAP and `feedam_resources` lists remain in JSON for auditing.
**Use `ui_categories` in the future UI**, not concatenated raw provider lists. `locations` remains the canonical flat list.

- Repeated source IDs (notably nearby + urgent Feedam results) are merged.
- Cross-ID/provider records merge only with equal normalized non-placeholder names,
  equal normalized numbered street addresses, and coordinates within 75 meters.
- Street abbreviations and punctuation/case differences are normalized.
- Name alone, distance alone, or shared address alone never automatically merge.
- Every member of a group must match, avoiding transitive chains merging branches.
- Ambiguous records remain separate with `possible_duplicate_ids` and a terminal
  marker. Matching has no guarantee of finding all real-world duplicates.

Merged locations retain `source_ids`, `source_groups`, every `source_records`
entry, a merge reason, and any urgent or SNAP membership. Conflicting schedules,
requirements and verification details remain visible in the source records; the
representative top-level record is not a resolution of those conflicts. One
canonical location appears in one display group: assistance takes precedence,
then SNAP retail, then the existing retail/potential groups. SNAP and urgent
badges retain overlapping roles. Co-located organizations are not merged merely
because they share a building.

`deduplication` reports input records, displayed locations, and how many displayed
locations still have possible duplicates. Those counts are not proof of unique
physical businesses. An explicit ID crosswalk can later resolve uncertain matches.
Failed/unrequested sources are not displayed as successful zero-result searches.

Initial Atlanta live check: 53 Feedam assistance records within 5 km, zero urgent
matches at query time, and 124 SNAP records. OSM returned HTTP 504; the run was
correctly marked partial. The reconciliation retained 16 possible-duplicate
listings for review. Results vary over time and location.

References: [API documentation](https://feedam.org/api/docs),
[OpenAPI](https://feedam.org/api/openapi.json), [publisher identity](https://feedam.org/about).

## Two-category frontend contract

The CLI and `search_sources(...)` now expose exactly two display categories:

```json
{
  "ui_categories": {
    "general_food_resources": [],
    "snap_and_assistance": []
  },
  "ui_category_labels": {
    "general_food_resources": "General food resources",
    "snap_and_assistance": "SNAP & food assistance"
  }
}
```

The arrays contain complete canonical location objects, with additional
`ui_category` and `service_labels` fields. Each array is sorted by distance;
they partition the reconciled locations without repeating the same canonical
location in both categories. Raw provider arrays and the flat `locations` list
remain available for debugging and compatibility; they are not extra UI sections.

- **General food resources:** grocery/convenience stores, markets and farm shops
  with no matched SNAP/assistance membership.
- **SNAP & food assistance:** SNAP-listed retailers, food banks/pantries, soup
  kitchens, food-sharing resources, Feedam assistance listings, and explicitly
  labeled potential community-centre contacts.

Assistance/SNAP membership takes priority if a location has both roles. An OSM
store merged with a USDA SNAP retailer appears once in the second category, with
both source records preserved. A missing SNAP match is not proof a store rejects
SNAP; it may be unmatched or absent from the selected source snapshot.

Render `service_labels` beneath each result. These distinguish **paid groceries**
from food assistance and **unverified potential contacts**. Retain urgent labels,
possible-duplicate flags, source status, fetch dates, and attribution. The display
categories do not determine an individual user eligibility or guarantee services.

Frontend usage once the Python result is connected to an HTTP endpoint:

```ts
const general = result.ui_categories.general_food_resources;
const assistance = result.ui_categories.snap_and_assistance;
```

The standalone CLI and the Community web UI share this contract. Use `--sources osm snap feedam events` to request all providers;
the default requests OSM and local community events. Both category keys are always present,
even when empty. Empty results refer only to available selected sources; always
show `partial_results` and `source_errors` if a provider failed.

## Community giveaways (backend only)

`events.py` stores local community food posts in `.local/community-events.sqlite3`
(gitignored, persistent across restarts). The Python API is `create_event`,
`cancel_event`, `search_events`, and `geocode_address`. No extra dependencies or API
keys are needed. The Community web UI now calls this library through the private Python service and Next.js proxy. Keep the SQLite file on one backend
server, outside static/public directories. Multiple servers would need a shared
database. Back up the file if posts need to survive machine loss.

Required post fields:

| Field                       | Meaning                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `host_name`                 | Public display name; not verified identity                  |
| `message`                   | Public plain-text message (1–4000 characters)               |
| `address`                   | Public event address                                        |
| `foods`                     | Nonempty list of food descriptions                          |
| `latitude`, `longitude`     | Host-confirmed map pin for distance filtering               |
| `starts_at`, `ends_at`      | ISO 8601 times with explicit UTC offsets                    |
| `public_location_confirmed` | Must be `true`: the host intends to publish the address/pin |

An address alone cannot calculate distance. Get candidate coordinates:

```powershell
python -m src.lib.location.events geocode "736 Peachtree St NE, Atlanta, GA 30308"
```

The [US Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html)
returned a candidate at `33.774751346452, -84.384733945104` during the September
26, 2026 check. A host must confirm the candidate pin: geocoding does not verify
an apartment entrance, hosting permission, or an event. Zero or multiple matches
are possible; callers must not silently choose an ambiguous match. The lookup
sends the supplied address to the Census service.

Create a JSON file, for example `.local/new-event.json` (create `.local` first):

```json
{
  "host_name": "Sally",
  "message": "Example only: pasta and smoothies on Sunday evening!",
  "address": "736 Peachtree St NE, Atlanta, GA 30308",
  "foods": ["Pasta", "smoothies"],
  "latitude": 33.774751346452,
  "longitude": -84.384733945104,
  "starts_at": "2026-09-27T18:00:00-04:00",
  "ends_at": "2026-09-27T20:00:00-04:00",
  "public_location_confirmed": true
}
```

This is a fictional example; replace its location and times with confirmed real
event details before using the normal store. Times must be in the future or an
event still in progress; creation rejects already-ended events. Offsets describe
each instant explicitly, including overnight events and daylight-saving changes.
Do not infer the time from the free-text message.

```powershell
python -m src.lib.location.events create --input .local/new-event.json
python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963 --sources osm snap feedam events
```

Creation returns `{ "event": { ... }, "edit_token": "..." }`. Keep the token
private; it is returned once, only a hash is stored, and it never appears in nearby
search results. Cancel a post using its returned `community_event:...` ID; the CLI
prompts privately for the token:

```powershell
python -m src.lib.location.events cancel "community_event:YOUR-ID"
```

To correct a post, cancel and create a replacement. The token authorizes
cancellation, not account ownership. The web flow authorizes cancellation using a private capability link, without accounts. Its service enforces request limits; public deployment still needs an abuse-reporting/moderation process. Render messages as
escaped plain text, not HTML. Do not serve the creation response or SQLite file as
part of public nearby output.

### Time-aware search and duplicate handling

Default sources are now `osm events`; request `--sources osm snap feedam events`
for all four. Explicit source lists remain exact (`--sources snap` does not include
events). Events appear under `ui_categories.snap_and_assistance` with
`Community giveaway — host reported`, alongside other assistance sources.

By default, searches include events active now or starting within the next 24
hours. `--event-window-hours 0` returns only events scheduled active at the search
instant. Use an offset-bearing `--at` for a different instant:

```powershell
python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963 --sources events --at "2026-09-27T18:30:00-04:00" --event-window-hours 0
```

Time intervals include the start and exclude the end. Ended, canceled, and
out-of-radius events are excluded. `--events-db` selects a different store for
nearby searches; `events --db PATH create ...` selects one for writes. Missing local
stores return no posts; unreadable/corrupt stores produce a provider error rather
than a misleading empty result. All-provider searches retain partial-failure flags.

Distinct event IDs remain separate even at the same address, with identical host
names, or beside a permanent food provider. Repeated records for the same event ID
merge. The web flow supplies a private UUID v4 `request_id`. Retrying the same payload and ID returns the original event and token atomically; changed payloads with that ID are rejected. Direct calls without a request ID create new posts. Treat request IDs as private capabilities, just like management links. Recurring schedules and
food inventory/reservations are not implemented.

### Availability across all providers

Every reconciled location, including both UI categories, has `availability`:

- Community events: `status` is `scheduled_active` or `upcoming`, with explicit
  start/end times and `evaluated_at`. Scheduled active is not confirmation that
  food remains or a host is present.
- OSM: preserve `opening_hours` exactly. Complex OSM expressions are not parsed
  into open-now claims.
- Feedam: preserve `hours_json`, reported hours/live status, and fetch time.
- USDA SNAP CSV: hours are unknown because the source has no hours column.

`schedules` preserves each source's evidence when locations merge, so an OSM
schedule can accompany a SNAP retailer without pretending USDA supplied it.
`hours_known` means schedule data was supplied, not verified completeness.
External `status` stays `unknown`; conflicting and outdated schedules are not
silently resolved. CLI output prints reported hours or "hours unknown". The event
`--at` filter does **not** make external listings historical or predict their
opening status; provider live data remains current/retrieved data. Keep
`verified: false` visible in the consuming application's interpretation.

### Reproducible examples and tests

```powershell
python -m src.lib.location.event_examples --output test-results/community-event-examples.json
python -m unittest discover -s tests -p "test_*.py" -v
```

The offline example creates temporary fictional events for Atlanta (Sally),
Chicago, Los Angeles, New York, and Seattle. For each city, it searches from nearby
and far-away user locations, during the event, before it, and at its end: 20 checked
scenarios. The JSON report includes the user origin, time window, full public post,
distance, availability, and two-category output. Test pins are approximate synthetic
fixtures, not geocoding assertions. It never populates the real event store, and
does not retain private creation tokens.

Sally's original September 25, 2026 example is historical: the demo injects a test
clock before creation and searches during that evening. A search afterward will
exclude it. Production CLI creation always uses the real clock. Automated tests
also cover start/end boundaries, overnight events, equivalent UTC times,
daylight-saving offset changes, invalid inputs, cancellation authorization,
same-venue events, source reconciliation, hours provenance, and provider failures.

## Community web application

Run `npm ci`, then **`npm run dev`** from the repository root. This starts Next.js
and a loopback-only Python location service together. Open `/community` or select
Community in the planner. Ctrl+C stops both. Python 3.10+ must be installed; set
`PYTHON_COMMAND` to its executable path if automatic discovery fails.
The launcher reads `.env.local`, generates a private service token when one is not
configured, and passes it only to the two server processes. No new API key is needed.

Routes:

- `/community`: address/device/map-pin search, radius, source and event-time filters,
  synchronized map/list, two resource categories, schedules and provider status.
- `/community/host`: a free-food event form with public location consent and explicit
  start/end UTC offsets. Address lookup returns candidates that the host selects.
- `/community/events/[id]`: public share page; keeps showing canceled/ended status.
- `/community/events/[id]/manage#token=...`: private management link. The fragment is
  read into per-tab session storage and removed from the address bar; it is never
  sent as a URL query or included in public records. Save the original creation
  link before navigating away. No account recovery is available if that link is lost.

The cancellation button requires confirmation and a valid private token. Browser
creation retries reuse one private UUID for an unchanged submission. Events expire
from live lists on the next minute tick; data refreshes every minute. Event detail
pages refresh every 30 seconds. A custom search instant is expressed in the
visitor's device timezone; displayed event times retain the host's explicit offset.
External opening hours are source-reported and are not filtered as verified open-now.

The map uses Leaflet with configurable `NEXT_PUBLIC_MAP_TILE_URL`, defaulting to
standard OSM raster tiles. Preserve OSM attribution; follow
https://operations.osmfoundation.org/policies/tiles/. No bulk download or prefetch.
For larger public usage, configure an appropriate tile provider and add any required
provider attribution in `map.tsx`. Map tiles can fail without disabling the list.
Street-address lookup sends an address to US Census only when Find address is pressed.
Device geolocation is requested only after the visitor clicks Use my location.

### Service boundary and deployment

`src/app/api/location/[...path]/route.ts` proxies an allowlist of requests to
`src/lib/location/service.py`. Browser requests never receive the private
`LOCATION_SERVICE_TOKEN`. Writes require a same-origin JSON request, request bodies
are capped at 20 KB, and the Python service bounds concurrent work and applies
global per-process limits (180 reads and 20 writes per minute). Provider requests
run independently; errors remain visible beside available results. The service
does not log addresses or private token bodies. Rate limits are intentionally
simple single-instance demo limits, not a distributed abuse-control system.

API endpoints under `/api/location`:

| Method | Path                  | Input                                                                                                      |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/nearby`             | `lat`, `lon`, `radius` (meters), comma-separated `sources`, `window` (hours), optional offset-bearing `at` |
| POST   | `/geocode`            | `{ "address": "US street address" }`                                                                       |
| POST   | `/events`             | `{ "event": { ...required fields... }, "request_id": "private UUID v4" }`                                  |
| GET    | `/events/[id]`        | Public event ID                                                                                            |
| POST   | `/events/[id]/cancel` | `{ "edit_token": "private capability" }`                                                                   |

Local production preview: `npm run build`, then `npm run start:local`.
`npm run dev:web` and `npm start` run only Next.js, so independently run the Python
service if using those commands. Set the same stable random
`LOCATION_SERVICE_TOKEN` in both processes, `LOCATION_SERVICE_URL` on Next.js, and
`LOCATION_SERVICE_PORT` on Python. The Python adapter binds to `127.0.0.1`; it is
intended behind Next.js on the same machine, not as a public standalone HTTP server.
`LOCATION_EVENTS_DB` selects persistent event storage. The SNAP importer/cache paths
remain as documented above. Changing the service token does not revoke event links.

A serverless Next.js deployment alone does not run this Python service or provide
persistent SQLite. Public hosting requires a persistent Python host/disk and a
proper secured service connection if hosted separately. Use a shared event database
and distributed limits before running multiple instances. Account-free hosting is
intentional; do not imply that hosts or available food are verified.

Validation commands:

```powershell
python -m unittest discover -s tests -p "test_*.py" -q
npm run lint
npm run typecheck
npm run build
npm run test:location-ui
npm run test:bridge
```

Location Playwright tests start their own production app on port 3101 and Python
on 8766, using a unique event database in gitignored `test-results/`. They test real
event API writes/cancellation and use deterministic external-provider fixtures for
failure/coverage UI cases. Install Chrome for the default browser channel, or set `PLAYWRIGHT_CHANNEL=msedge` to use installed Microsoft Edge.
Screenshots and traces are written to gitignored test output, never public assets.

### Community location autocomplete

The Community search field suggests US addresses, streets and cities after three
characters and a 450 ms pause. Select a suggestion with a click or Arrow keys +
Enter to set the map/search coordinates; editing the text invalidates the previous
selection. Escape dismisses the menu. Geolocation and manual map pins remain available.
The separate host address-confirmation form still uses the Census lookup.

`POST /api/location/suggest` accepts `{ "query": "partial address" }`. The server
uses [Photon](https://github.com/komoot/photon), a search-as-you-type geocoder using
OSM data. No key is required for the default public demo endpoint. Requests are
debounced, stale responses ignored, and up to 128 queries cached in memory for
five minutes. Suggestions use the service's read-request quota rather than its
event-write quota. Typed text is sent to Photon; the UI discloses this and attribution.
Coverage is not address validation. For higher traffic, configure
`LOCATION_AUTOCOMPLETE_URL` with a hosted/private Photon-compatible `/api/` endpoint;
the public demo has usage limits and no availability guarantee.
