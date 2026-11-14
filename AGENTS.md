# Harbor Ledger

Harbor Ledger is a public, mobile-friendly port conditions and traffic app. Visitors can check New York Harbor, Boston Harbor, and San Francisco Bay. Managed Neon Auth lets visitors create an account and save ports to a personal watchlist.

## Where it runs

| Resource | Location |
| --- | --- |
| Production | [Harbor Ledger](https://harbor-ledger-wine.vercel.app) |
| Public source | [DALEE9000/fractal-prototype](https://github.com/DALEE9000/fractal-prototype) |
| Builds, domains, Git settings and logs | [Vercel project](https://vercel.com/david-a-lees-projects/harbor-ledger) |
| Runtime credentials | [Vercel environment settings](https://vercel.com/david-a-lees-projects/harbor-ledger/settings/environment-variables) |
| Postgres and authentication | [Neon main branch](https://console.neon.tech/app/projects/falling-sound-52966283/branches/br-red-frost-bbenda8s) |
| Saved ports | [Neon tables](https://console.neon.tech/app/projects/falling-sound-52966283/branches/br-red-frost-bbenda8s/tables) → public → saved_ports |
| Identity settings | [Neon Auth domains and email settings](https://console.neon.tech/app/projects/falling-sound-52966283/settings/auth) |

The Vercel team is `david-a-lees-projects`, the hosting project is `harbor-ledger`, and its Marketplace database is `harbor-ledger-db`. The project owner manages dashboard access. GitHub collaborators can work through branches and pull requests.

## Develop

Use Node.js 24 and npm. In the repository root, run:

```sh
npm ci
vercel link --project harbor-ledger --scope david-a-lees-projects
vercel env pull .env.local --environment development
npm run db:migrate
npm run dev
```

Open http://localhost:3000. The Vercel CLI needs project access for the link and environment pull. Local credentials belong in the ignored `.env.local`. The checked-in `.env.example` lists required names. Never copy credential values into source, screenshots, logs, issues, or pull requests. Keep any environment pull outside static assets.

`DATABASE_URL` is the server-only pooled connection. Migrations use `DATABASE_URL_UNPOOLED`. Neon injects `NEON_AUTH_BASE_URL` and Vercel holds a separate `NEON_AUTH_COOKIE_SECRET` per environment. For new production aliases, register the exact HTTPS origin in Neon Auth and verify registration and sign-in there. For destructive schema experiments, use an isolated Neon branch and confirm which database your local variables select.

## Code and data

The [world ocean explorer](https://harbor-ledger-wine.vercel.app/ocean) is a static page. World coastlines come from OpenFreeMap vector tiles. Free Copernicus Marine WMTS serves the six-hourly surface velocity layer in Global Ocean Physics (DOI 10.48670/moi-00016). The global layer shows forecast valid time and modeled vectors. Map colors use the provider's haline palette from 0 to 1.5 m/s. Clicking water reads the u and v components at a model cell. Animations sample a small cached set of points in the visitor's viewport. NOAA measured radar remains in the harbor views.

At zoom 8 or closer the browser subscribes to a bounded AIS window where it fits the anonymous provider limit. A viewport crossing the date line uses two boxes on one connection. Ports and ocean presets are shareable via `/ocean?place=rotterdam`. All world map, current and AIS requests go directly to the public providers. The explorer requires no API keys, paid services, database jobs or new infrastructure. If a provider is unavailable, show the affected layer's status and continue serving the other layers.

- `app/harbor.jsx` renders the port directory and watchlist. `app/api/saved/route.js` derives ownership from the server session, checks write origins, and uses parameterized SQL. `public.saved_ports` has one row per user and port. Managed identities and sessions live in `neon_auth`.
- `lib/ports.js` pairs each harbor tide gauge with an offshore buoy. `lib/marine.js` reads [CO-OPS water levels](https://api.tidesandcurrents.noaa.gov/api/prod/) and [NDBC buoy reports](https://www.ndbc.noaa.gov/). Water levels are relative to mean lower low water. Buoy variables keep their individual report times.
- `lib/currents.js` requests the nearest 6 km grid cell from [NOAA HFR](https://dods.ndbc.noaa.gov/thredds/catalog/hfradar.html). Each hourly vector yields speed in knots and the direction the surface water moves toward, clockwise from true north. Coverage varies. Missing, invalid and older-than-12-hour vectors produce an unavailable state.
- All three U.S. charts open on Live AIS. The browser uses a bounded [Open Waters snapshot and event stream](https://openwaters.io/api/ais/) for each harbor and its offshore approaches. It draws AISHub and volunteer reports up to 15 minutes old. Keep [AISHub's map attribution](https://www.aishub.net/terms) visible. The app has no AIS proxy, download API, or AIS database. Open Waters offers free personal use. Review its [access and per-source terms](https://openwaters.io/ais/) before commercial use. Slow connections fall back to snapshots during reconnects. Moving ships selects reports of at least one knot. Harbor Ledger interpolates between received coordinates and never projects beyond the last report.
- `app/api/traffic/[id]/route.js` reads the independent [NYC Ferry](https://www.ferry.nyc/developer-tools/) and [MBTA](https://api-v3.mbta.com/) operator feeds. Each remains available as a separate view in its harbor. All U.S. ports also offer historical AIS replay.
- Clicking a vessel or selecting its name centers the camera and draws its reported trail above the HF radar. Dragging the map pauses follow. Harbor Ledger retains up to one hour of live positions in the browser and requests recent source-attributed U.S. AIS history only for the selected MMSI. Mixed-source windows without per-fix credits fall back to eligible subwindows and observations received in the session. Replay trails stop at the playback clock. Gaps over five minutes and provider-declared breaks start a new segment. Closing the chart clears the tracking state.
- `public/traffic/` contains bounded excerpts of [NOAA Marine Cadastre AIS](https://github.com/NOAA-OCM/ocm-marinecadastre-ais-vessel-traffic) for November 14, 2024, 16:00–16:30 UTC. The source file is [ais-2024-11-14.parquet](https://ocmgeodatastor1.blob.core.windows.net/marinecadastre/ais2024/ais-2024-11-14.parquet). Replay interpolates between recorded positions up to five minutes apart and runs at 20×. Live markers transition between received reports. `app/traffic-map.jsx` supports pause, reduced motion, a text vessel selector, and a fallback when WebGL is unavailable.
- The pixel charts use locally bundled Web Mercator rasters derived from OpenFreeMap, OpenMapTiles and © OpenStreetMap (ODbL). Keep the on-map credits. Leaflet supplies pan and zoom. Three.js renders pixel ships with a canvas fallback. The navy palette is in `app/style.css`. Silkscreen is bundled with its SIL Open Font License.
- The HF radar layer reads bounded NetCDF3 subsets from NOAA NDBC using `lib/radar-field.js`. Pick the newest single observation hour with usable returns, up to 12 hours old. Project each observed cell at native grid spacing and use the shared knot thresholds in `lib/current-scale.js`. Missing cells stay empty and calm cells stay still. The animated dots illustrate the sampled direction and relative speed within each cell. Selecting a cell reveals its speed, bearing and position. Reduced-motion preferences disable animation. The offshore view shows the radar coverage. Replay dates and radar observation times are independent.
- Add numbered SQL migrations under `db/`. The runner uses a Postgres transaction, advisory lock and migration ledger. Deploy backward-compatible changes so a previous app version can keep serving during rollouts.

## Ship and verify

The [Helsinki live AIS tracker](https://harbor-ledger-wine.vercel.app/traffic/helsinki) uses [Fintraffic / Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It displays recent broadcasts by MMSI and uses the provider’s millisecond report timestamp. The optional 8× recorded passage follows SUOMENLINNA II and VICTORIA 1 from public reports captured on November 14, 2026, 16:48–16:50 UTC. No third-party tracking key or visitor account is required.

1. Branch from the latest `main`. Run `npm test` and `npm run build` before pushing. GitHub Actions tests and compiles pushes and pull requests.
2. Push the feature branch to GitHub. Vercel’s GitHub integration builds a preview for pushes to branches other than `main`. Find the URL under the commit’s Vercel check or in the Vercel Deployments tab. Preview links can require Vercel team sign-in.
3. On the preview, inspect at least one current observation, switch ports, exercise archive playback, and sign in to save a port. A second account should only see its own saves. Verify any migration against the intended preview database.
4. Merge to `main` to deploy production. For an already-reviewed local `main`, `npm run deploy` pushes it to the same Git trigger. Each Vercel build runs tests, applies migrations using that environment’s database variables, and builds Next.js.
5. Check Vercel’s build state, then test the stable production URL in a browser. Sign in, save a port, refresh and inspect `public.saved_ports` in Neon. For an incident, inspect Vercel logs and revert the code through Git. A code rollback does not reverse database changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
