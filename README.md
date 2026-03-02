# Battlefield Highlighter
A Firefox WebExtension for GateWars that adds battlefield filtering, scanner automation, and quality-of-life UI tweaks.

## Installation (Temporary Add-on)
1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json` from this repository.
4. Keep Firefox open while using it (temporary add-ons unload when Firefox closes).

## Features
### Battlefield filters (inline on battlefield pages)
- Treasury threshold filter.
- Army size threshold filter.
- Hide inactive players (e.g. on vacation).
- Hide players with no attack action available (e.g., on PPT or set to peace).
- Alliance blacklist filter (exact name match, case-insensitive, one alliance per line in settings).
- Filters auto-apply and persist through extension storage.

### Scanner
- Inline scanner controls on battlefield pages (start page + end page, then Start/Stop).
- Scans page-by-page and applies your active filters before checking for matches.
- Stops immediately when at least one visible targetable player matches.
- Stops when it reaches the configured end page.
- Remembers scanner state across page loads and can resume after navigation/reload.
- Optional sound alerts for "match found" and "scan complete" with adjustable volume.

### Popup settings
- Referer override toggle + custom Referer URL.
- Scanner sound toggle + volume.
- Auto-fill login details on the root page (`https://main.gatewa.rs/`) when enabled.
- Alliance blacklist editor.
- Site tweak toggles (see below).
- Import/export settings as JSON.
- Last-saved timestamp and quick auto-apply behavior for most fields.

### Site tweaks
- Sidebar/site-links jump fix (prevents layout jump and hides the extra homepage link behavior).
- Clock transparency fix.
- GNR ascension countdown on base page.
- Main content top-offset tweak (helps with jumping on battlefield page, especially when auto-scanning).

### Profile page helpers
On player stats pages (`stats.php?id=...`), adds quick buttons to copy:
- Player name
- Treasury value
- Player ID

### Networking behavior
- Optionally overrides the `Referer` header on requests to `main.gatewa.rs`.
- Helps avoid unexpected login redirects on direct/manual page loads.
