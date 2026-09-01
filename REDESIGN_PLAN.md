# Doomsday Protocol v6

## Direction

Recast the tracker as a restrained cinematic intelligence desk: poster-led, fast to scan,
episode-exact, and useful on a phone without turning routine actions into theatrical props.

## Capability upgrade

- Exact next title or episode across independent 165 / 72 / 60-title modes.
- Nightly session plans that never exceed the selected time budget.
- Playback-speed, pace, projected finish, and deadline telemetry.
- Search, status/tier/format filters, collapsible eras, title details, episode controls,
  spoiler-safe context, and saved watch history.
- Ten unobtrusive WebMCP tools for status, planning, provenance, navigation, preferences,
  exact writes, and preview-bound imports.

## Progress contract

- UI and WebMCP writes share the same operation builders and server validator.
- External observations require exact catalogue keys, stable event IDs, bounded timestamps,
  and plausible resume positions.
- Imports preview by default. A commit must reuse the token for the exact previewed payload and
  state.
- Ledger receipt, materialized state, sync tombstone, canonical response, and provenance reads
  execute in one D1 transaction.
- Stale, duplicate, and equal-time conflicts fail closed and remain visible in receipts.
- Legacy watched TV titles expand idempotently to exact episodes; newer episode state wins.

## Visual system

- Near-black/navy field, warm paper typography, restrained red status accents.
- Condensed display type only for hierarchy; Geist and mono labels for operational detail.
- Large active art on desktop, compact next-up presentation plus a fixed watched action on mobile.
- No reel ornament, fake stamps, glows, rounded dashboard cards, or repeated decorative borders.
- Native named dialogs, persistent mobile close controls, 44px touch targets, and clear focus states.

## Verification gates

- `npm run verify` (lint, typecheck, 14 tests, production build).
- SQLite fixtures prove replay safety, stale-event tombstones, and rollback after a post-apply
  failure.
- Signed-in local API checks prove preview → commit, duplicate replay, preview mismatch (409),
  canonical read-after-write, and future timestamp rejection (400).
- Independent read-only audits cover data integrity, responsive/accessibility behavior, and
  publish packaging.
- Publish only after those gates pass and the deployed Sites version reports ready.
