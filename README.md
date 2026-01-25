# About
A Firefox-based browser add-on that enhances and modiefies the gatewa.rs site.

# Features
### Filters
Adds filters to the battlefield pages for:
- Treasury (Naquadah amount).
- Army size.
- Active/inactive players (interactable).
- Attackable players (not on PPT or at peace).
- An alliance blacklist.

### Auto scan
Set a page range and start scanning for players that meet your filter thresholds.
- Optionally, will play a suble sound when a player is found or when the scanner reaches the end of the search range to alert you if you're doing something else.

### Site tweaks
These are mostly minor tweaks to the site's UI injected by the add-on. They include:
- A "fix" to stop the site links element from changing size or randomly including a link to the homepage on page loads (helps when auto scanning on a second monitor).
- A very minor fix to the game clock element that, by default, has an ugly, not quite transparent enough, overlay on it. This just makes it fully transparent.
- A nice little QoL addition to the GNR section in the command centre that adds a small countdown to ascension.

### Misc
To enable the scanner to work, as well as just generally being nice, the add-on modifies the `Referer` header being sent to the site to stop the site from ejecting you to the login screen if you interact with it through the address bar (or just an "unapproved" way).
