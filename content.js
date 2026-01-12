(async function () {
  const DEFAULT_CONFIG = {
    threshold: 0,
    armySizeThreshold: 0,
    hideInactive: true,
    enableTreasuryFilter: true,
    enableArmySizeFilter: false,
    enableAllianceFilter: false,
    allianceBlacklist: []
  };

  async function getConfig() {
    try {
      const result = await browser.storage.local.get('config');
      return { ...DEFAULT_CONFIG, ...result.config };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  function parseReversedValue(text) {
    const cleaned = text.replace(/,/g, '');
    const reversed = cleaned.split('').reverse().join('');
    return parseInt(reversed, 10);
  }

  function normalizeText(text) {
    return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function extractAllianceName(rawText) {
    const raw = String(rawText ?? '').trim();
    if (!raw) return '';

    // Most common: "ALLIANCE - Title" (title may be absent)
    const spacedHyphen = raw.indexOf(' - ');
    if (spacedHyphen >= 0) return raw.slice(0, spacedHyphen).trim();

    // Fallback: if there is a hyphen but no spaces around it, split on first hyphen.
    const anyHyphen = raw.indexOf('-');
    if (anyHyphen >= 0) return raw.slice(0, anyHyphen).trim();

    return raw;
  }

  function filterRows(config) {
    const rows = document.querySelectorAll(
      'div > div > main > div:first-child > div > table:first-of-type > tbody > tr'
    );

    const normalizedAllianceBlacklist = (config.allianceBlacklist || [])
      .map(normalizeText)
      .filter((s) => s.length > 0);

    let hiddenCount = 0;
    let shownCount = 0;

    rows.forEach((row) => {
      row.style.display = '';

      let shouldHide = false;

      // Check for inactive player (empty #actions or player name is not a link)
      if (config.hideInactive) {
        const actions = row.querySelector('#actions');
        const hasNoActions = actions && actions.children.length === 0;
        
        // Check if player name is not a link (fully inactive players)
        const firstTd = row.querySelector('td#name_titles') ?? row.querySelector('td:nth-child(1)');
        const playerNameLink = firstTd?.querySelector('a');
        const hasNoPlayerNameLink = firstTd && !playerNameLink;
        
        if (hasNoActions || hasNoPlayerNameLink) {
          shouldHide = true;
        }
      }

      // Check treasury value - it's inside td button x
      if (!shouldHide && config.enableTreasuryFilter) {
        const treasuryElement = row.querySelector('td:nth-child(6) button x');
        
        if (treasuryElement) {
          const text = treasuryElement.textContent.trim();
          
          // Hide rows with question marks (unknown values)
          if (/^\?+$/.test(text)) {
            shouldHide = true;
          } else {
            const actualValue = parseReversedValue(text);

            if (!isNaN(actualValue) && actualValue < config.threshold) {
              shouldHide = true;
            }
          }
        }
      }

      // Check army size - it's inside td[4] button x (also reversed)
      if (!shouldHide && config.enableArmySizeFilter) {
        const armySizeElement = row.querySelector('td:nth-child(4) button x');
        
        if (armySizeElement) {
          const text = armySizeElement.textContent.trim();
          
          // Hide rows with question marks (unknown values)
          if (/^\?+$/.test(text)) {
            shouldHide = true;
          } else {
            const actualValue = parseReversedValue(text);

            if (!isNaN(actualValue) && actualValue < config.armySizeThreshold) {
              shouldHide = true;
            }
          }
        }
      }

      // Check alliance blacklist - alliance name is in td[1] as span.text-white (inside the brackets)
      if (!shouldHide && config.enableAllianceFilter && normalizedAllianceBlacklist.length > 0) {
        const firstTd = row.querySelector('td#name_titles') ?? row.querySelector('td:nth-child(1)');
        if (firstTd) {
          // Preferred: the alliance "name/tag" span in the bracket section (when present)
          const allianceSpan = firstTd.querySelector('span.text-white');
          const spanText = allianceSpan?.textContent;

          // Fallback: parse the first [...] block, allowing newlines inside
          const bracketMatch = firstTd.textContent?.match(/\[([\s\S]*?)\]/);
          const bracketText = bracketMatch ? bracketMatch[1] : null;

          const rawAllianceText = spanText ?? bracketText ?? '';
          const allianceNameOnly = extractAllianceName(rawAllianceText);
          const normalizedAllianceName = normalizeText(allianceNameOnly);

          if (normalizedAllianceName) {
            // Exact match (case-insensitive) on the alliance name only (before any " - Title" suffix).
            if (normalizedAllianceBlacklist.includes(normalizedAllianceName)) {
              shouldHide = true;
            }
          }
        }
      }

      if (shouldHide) {
        row.style.display = 'none';
        hiddenCount++;
      } else {
        shownCount++;
      }
    });

    const activeFilters = [];
    if (config.hideInactive) activeFilters.push('inactive');
    if (config.enableTreasuryFilter) activeFilters.push(`treasury<${config.threshold.toLocaleString()}`);
    if (config.enableArmySizeFilter) activeFilters.push(`army<${config.armySizeThreshold.toLocaleString()}`);
    if (config.enableAllianceFilter && config.allianceBlacklist.length > 0) {
      activeFilters.push(`alliances: ${config.allianceBlacklist.length}`);
    }
    
    console.log(
      `[Battlefield Filter] Showing ${shownCount}, hidden ${hiddenCount} ` +
      `(filters: ${activeFilters.join(', ') || 'none'})`
    );
  }

  // Cache config to avoid hitting storage on every DOM mutation
  let config = await getConfig();

  // Listen for config changes from popup
  browser.storage.onChanged.addListener((changes) => {
    if (changes.config) {
      config = changes.config.newValue;
      filterRows(config);
    }
  });

  // Initial run
  setTimeout(() => filterRows(config), 500);

  // Re-run on DOM changes
  const observer = new MutationObserver(() => filterRows(config));

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();