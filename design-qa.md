# v6 design QA

## Review method

Source-level responsive and accessibility review of the landing page, tracker, and shared visual
system. The Sites workflow does not use browser screenshots or scripted DOM/click QA; runtime
verification is limited to the retained dev server, signed-in API routes, and production build.

## Resolved findings

- Replaced the literal archive/reel treatment with a calmer cinematic intelligence desk.
- Reduced poster-first mobile height and added a fixed, mode-aware watched action.
- Kept sign-out available on mobile.
- Made filtered era collapse/expand controls truthful and reversible.
- Added accessible names and native cancel handling to all dialogs.
- Kept full-screen detail and Intel close controls fixed within the safe area.
- Raised mobile filters, episode controls, completion checks, and related controls to 44px targets.
- Replaced ambiguous “clear mission”, “verified”, and “dossier” copy with direct watch actions and
  evidence-calibrated state labels.
- Serialized complete preference/progress mutations and suppressed success/undo after partial
  receipt batches.

## Visual hierarchy

1. Compact mode switcher.
2. Next-up title or exact episode with the primary watched action.
3. Deadline, pace, speed, and daily budget.
4. Budget-fitting nightly plan.
5. Era route and saved history.
6. Searchable, filterable watch library.
7. On-demand provenance and matching details in Intel.

## Current gate

Static review has no known blocking visual or accessibility issue. Final acceptance still requires
the complete verification command, independent read-only re-audit, and a ready deployment on the
official Sites project.
