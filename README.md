<div align="center">
  <img src="public/protocol-mark.svg" width="92" alt="Doomsday Protocol mark">

  # Doomsday Protocol

  **An episode-exact Marvel watch tracker with deterministic progress, nightly slates, and an honest finish forecast.**

  [![Live site](https://img.shields.io/badge/live-doomsday--protocol-cc342f)](https://doomsday-protocol.jeromequeck2004.chatgpt.site)
  [![CI](https://github.com/jerome-queck/doomsday-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/jerome-queck/doomsday-protocol/actions/workflows/ci.yml)
  [![MIT licensed code](https://img.shields.io/badge/code-MIT-2f81f7.svg)](LICENSE)
  [![Unofficial fan project](https://img.shields.io/badge/status-unofficial%20fan%20project-7d8590.svg)](THIRD_PARTY_NOTICES.md)
</div>

---

Doomsday Protocol turns a large Marvel viewing order into a practical daily
mission. It keeps three routes independent, tracks films and exact episodes,
fits the next slate to the time available, and records where every progress
observation came from.

> [!IMPORTANT]
> This is an unofficial, non-commercial fan project. Marvel properties, TMDB
> media/data, and the adapted MCU Watchlist compilation are not covered by the
> repository's MIT code license. See [Third-party notices](THIRD_PARTY_NOTICES.md).

## What it does

| Capability | Behavior |
| --- | --- |
| Independent routes | Full journey (165), Doomsday path (72), and Essentials (60) retain separate progress and forecasts. |
| Exact missions | TV seasons advance episode by episode; films and specials remain atomic. |
| Nightly slate | Packs the next canonical items into a user-selected time budget. |
| Deadline model | Calculates remaining runtime, required daily pace, and projected finish date at 1× or 2× speed. |
| Deterministic progress | Manual, Jellyfin, Trakt, and import observations use normalized keys, timestamps, receipts, and replay-safe conflict rules. |
| Quiet tool surface | WebMCP exposes search, planning, provenance, preferences, and preview-before-import without cluttering the UI. |

## Stack

- Next.js 16 and React 19 through [vinext](https://github.com/cloudflare/vinext)
- TypeScript, Vite, and Tailwind CSS
- Cloudflare Workers and D1 through Drizzle ORM
- ChatGPT Sites authentication and hosting integration
- Node's built-in test runner

## Run on another computer

Requirements: Git and Node.js **22.13.0 or newer**.

```bash
git clone https://github.com/jerome-queck/doomsday-protocol.git
cd doomsday-protocol
npm ci
npm run dev
```

No private image bundle or API key is required to install, test, or build the
project. The catalog is committed under `data/`; poster images load from the
remote URLs recorded in that catalog. This is why a fresh clone looks like the
same application without committing third-party poster files.

The public landing page works without an account. The private vault expects the
authentication headers and D1 binding supplied by ChatGPT Sites. Local progress
development uses the Workers/Vite integration configured in
`.openai/hosting.json`; production account identity is intentionally not
emulated or committed.

## Verify a clone

```bash
npm run verify
```

That single command runs ESLint, a clean TypeScript check, the deterministic
unit tests, and a production build. GitHub Actions runs the same command for
every pull request and every push to `main`.

## Repository map

```text
app/                 Next.js routes, UI, authentication, and progress API
data/                Reproducible catalog and route membership snapshots
db/                  D1/Drizzle schema and binding access
drizzle/             Versioned database migrations
lib/                 Planner, progress contract, SQL, and store logic
public/              Original neutral project graphics only
scripts/             Catalog import and poster-URL refresh utilities
tests/               Deterministic unit tests
```

## Data and media model

- `data/watchlist.json` is a versioned snapshot, not a live scrape at runtime.
- `data/modes.json` defines the three independent route memberships.
- Poster URLs point to TMDB or another identified rights-holder host; poster
  binaries are not copied into Git.
- Local screenshots, design references, and earlier franchise artwork are
  ignored. They remain on the creator's machine but are not needed by a clone.
- `npm run db:generate` regenerates Drizzle migration metadata after schema
  changes. `node scripts/refresh-poster-urls.mjs` refreshes poster references and
  performs network requests, so review its diff before committing.

## Progress integrity

Every write uses a catalog-bound content key such as `title:49` or
`episode:3:1`. Imported activity is previewed before commit. Duplicate external
events, stale observations, ambiguous matches, and equal-time conflicts fail
closed instead of silently changing watched state.

## Deployment

The canonical deployment runs on [ChatGPT Sites](https://doomsday-protocol.jeromequeck2004.chatgpt.site).
The repository contains the Sites project configuration but no credentials.
Deploy from a ChatGPT Sites workspace authorized for the configured project;
cloning the repository does not grant access to the existing production site or
its D1 data.

## Attribution and license

Original source code and documentation are licensed under the [MIT License](LICENSE).
The watch-order structure and editorial catalog are adapted from
[MCU Watchlist](https://marvelwatchlist.com/). Identifiers and poster references
include data from [TMDB](https://www.themoviedb.org/).

> This product uses the TMDB API but is not endorsed or certified by TMDB.

Third-party names, marks, media, data, and editorial compilations remain subject
to their owners' terms and are excluded from MIT. Read
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before redistribution or
commercial use.
