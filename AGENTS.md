# AGENTS.md
Agent guidance for `battlefield-highlighter`.

## Project Overview
- This repository is a Firefox WebExtension (Manifest V2) for `main.gatewa.rs`.
- It has no package manager setup (`package.json`, `pyproject.toml`, etc. are absent).
- Runtime code is plain JavaScript loaded directly by Firefox.
- Main scripts:
  - `background.js`: background listeners, referer override, scanner sounds.
  - `content.js`: battlefield filtering, inline UI injection, scanner logic, site tweaks.
  - `popup.js`: popup settings UI logic, storage normalization, import/export.
  - `popup.html`: popup markup and inline styles.
  - `manifest.json`: extension metadata and script wiring.

## Source of Truth
- Infer behavior from current code, not external assumptions.
- Keep compatibility with existing Manifest V2 behavior unless migration is requested.
- Preserve storage compatibility (`config` key and existing fields).

## Build, Lint, Test Commands
This repo currently has no formal build/lint/test toolchain.

### Build
- No build step exists.
- Local run workflow (manual):
  1) Open `about:debugging` in Firefox.
  2) Choose "This Firefox".
  3) Click "Load Temporary Add-on".
  4) Select `manifest.json` from this repository.

### Lint
- No lint config is committed in this repo.
- Optional ad-hoc syntax check with Bun (single file or multiple scripts):
  - Single file: `bun build "content.js" --target=browser --outdir "/tmp/bfh-bun-check"`
  - Multiple files: `bun build "content.js" "popup.js" "background.js" --target=browser --outdir "/tmp/bfh-bun-check"`
- Optional ad-hoc lint (only if ESLint is available in your environment):
  - `bunx eslint "*.js"`
- Do not add lint tooling/config unless explicitly requested.

### Tests
- No automated test framework is configured.
- There is no `npm test`, `pytest`, or equivalent single command.
- "Run a single test" currently means running one manual scenario.

### Single Test Guidance (Manual Scenarios)
- Filter scenario: open a battlefield page, toggle one filter, verify row visibility updates.
- Scanner scenario: set range to pages 1-2, start scanner, verify stop/completion behavior.
- Popup persistence scenario: change one setting, close/reopen popup, verify value persists.
- Referer scenario: toggle referer override and inspect request headers in DevTools.

### Imports and Modules
- Runtime scripts are plain browser scripts (not ESM/CommonJS modules).
- Do not add bundler/module-specific import systems unless explicitly requested.

### Variables and Declarations
- Prefer `const`; use `let` only when reassignment is required.
- Do not use `var`.
- Keep config/selectors/constants near the top of each file.
- Use `UPPER_SNAKE_CASE` for true constants (`DEFAULT_CONFIG`, key prefixes, selector IDs).

### Naming
- Use `camelCase` for variables, object fields, and functions.
- Prefer clear verb-based function names (`loadSettings`, `applySiteTweaks`, `scanCurrentPage`).
- Keep injected IDs/classes namespaced with `bfh-` when possible.
- Keep storage key names stable and explicit.

### Types and Data Handling
- JavaScript only (no TypeScript in this repo).
- Normalize values at input/storage boundaries:
  - `String(...)` for text
  - `parseInt(..., 10)` for integers
  - `Boolean(...)` for toggles
- Validate and clamp numeric ranges where needed (for example scanner volume 0-100).
- Merge defaults defensively (`{ ...DEFAULT_CONFIG, ...storedConfig }`).

### Error Handling
- Wrap extension API/storage interactions in `try/catch` where failure is recoverable.
- Silent catches are acceptable only when intentionally ignoring expected failures.
- If ignoring is non-obvious, leave a short comment explaining why.
- Log actionable runtime issues with clear prefixes like `[Scanner]` and `[Battlefield Filter]`.
- Avoid throwing uncaught errors for recoverable UI/storage flows.

### DOM and UI Mutation
- Always guard selector lookups and null cases before use.
- Prefer helper functions for repeated DOM parsing/query logic.
- Namespace injected style IDs/classes (`bfh-...`) to avoid collisions.
- Limit DOM writes to required updates to reduce reflow churn.
- Keep battlefield-specific behavior gated by page checks.

### Configuration and Storage
- Use `browser.storage.local` with stable keys.
- Preserve `config` object shape and backward compatibility for old stored data.
- Normalize imported/merged config before persisting.
- When adding config fields:
  - Add defaults in each relevant `DEFAULT_CONFIG`.
  - Include field in popup load/save/normalization paths.
  - Ensure background/content logic handles missing legacy values safely.

### Messaging Contracts
- Keep payloads explicit (`type`/`action` plus minimal required fields).
- Maintain compatibility with existing message contracts.
- Handle absent receivers gracefully (popup closed or content script unavailable).

### Comments and Documentation
- Keep comments concise and high-signal.
- Comment non-obvious intent, invariants, or tricky selectors.
- Do not add comments that simply restate obvious code.

### File-Specific Notes
- `content.js` is large/stateful: prefer focused helpers over more inlined complexity.
- `popup.js` is the source of truth for settings normalization and persistence UX.
- `background.js` should remain lightweight; avoid page-DOM responsibilities there.

## Change Checklist for Agents
Before finishing a change:
- Confirm extension still loads via `manifest.json`.
- Manually verify affected behavior on the target page flow.
- Check for accidental selector/storage-key regressions.
- Keep changes minimal and style-consistent with nearby code.
- Add tooling only if explicitly requested.

## When Unsure
- Prefer consistency with existing patterns over introducing new architecture.
- Prefer small, reversible edits.
- Ask user for their input on the matter.
