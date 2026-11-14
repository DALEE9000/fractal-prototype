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

- `app/harbor.jsx` renders the port directory and watchlist. `app/api/saved/route.js` derives ownership from the server session, checks write origins, and uses parameterized SQL. `public.saved_ports` has one row per user and port. Managed identities and sessions live in `neon_auth`.
- `lib/ports.js` pairs each harbor tide gauge with an offshore buoy. `lib/marine.js` reads [CO-OPS water levels](https://api.tidesandcurrents.noaa.gov/api/prod/) and [NDBC buoy reports](https://www.ndbc.noaa.gov/). Water levels are relative to mean lower low water. Buoy variables keep their individual report times.
- `lib/currents.js` requests the nearest 6 km grid cell from [NOAA HFR](https://dods.ndbc.noaa.gov/thredds/catalog/hfradar.html). Each hourly vector yields speed in knots and the direction the surface water moves toward, clockwise from true north. Coverage varies. Missing, invalid and older-than-12-hour vectors produce an unavailable state.
- `app/api/traffic/[id]/route.js` reads the [NYC Ferry](https://www.ferry.nyc/developer-tools/) and [MBTA](https://api-v3.mbta.com/) operator feeds. It restricts reports to the harbor viewport and drops reports older than 15 minutes. The live view has ferry coverage in New York and Boston. San Francisco has archive replay.
- `public/traffic/` contains bounded excerpts of [NOAA Marine Cadastre AIS](https://github.com/NOAA-OCM/ocm-marinecadastre-ais-vessel-traffic) for November 14, 2024, 16:00–16:30 UTC. The source file is [ais-2024-11-14.parquet](https://ocmgeodatastor1.blob.core.windows.net/marinecadastre/ais2024/ais-2024-11-14.parquet). Replay interpolates between recorded positions up to five minutes apart and runs at 20×. Live markers transition between received reports. `app/traffic-map.jsx` supports pause, reduced motion, a text vessel selector, and a fallback when WebGL is unavailable.
- The station and harbor locator images in `public/charts/` come from the [Esri Ocean Basemap](https://services.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer). Keep the displayed credits with the maps.
- Add numbered SQL migrations under `db/`. The runner uses a Postgres transaction, advisory lock and migration ledger. Deploy backward-compatible changes so a previous app version can keep serving during rollouts.

## Ship and verify

1. Branch from the latest `main`. Run `npm test` and `npm run build` before pushing. GitHub Actions tests and compiles pushes and pull requests.
2. Push the feature branch to GitHub. Vercel’s GitHub integration builds a preview for pushes to branches other than `main`. Find the URL under the commit’s Vercel check or in the Vercel Deployments tab. Preview links can require Vercel team sign-in.
3. On the preview, inspect at least one current observation, switch ports, exercise archive playback, and sign in to save a port. A second account should only see its own saves. Verify any migration against the intended preview database.
4. Merge to `main` to deploy production. For an already-reviewed local `main`, `npm run deploy` pushes it to the same Git trigger. Each Vercel build runs tests, applies migrations using that environment’s database variables, and builds Next.js.
5. Check Vercel’s build state, then test the stable production URL in a browser. Sign in, save a port, refresh and inspect `public.saved_ports` in Neon. For an incident, inspect Vercel logs and revert the code through Git. A code rollback does not reverse database changes.
