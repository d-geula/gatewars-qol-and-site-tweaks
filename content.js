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

  /**
   * Check if a row is a valid player row (not a spacer, header, or secondary row).
   * Player rows have: actions element (even if empty for inactive) + treasury element.
   * Note: playerNameLink indicates active vs inactive, not row validity.
   */
  function isValidPlayerRow(row) {
    const actions = row.querySelector('#actions');
    const treasury = row.querySelector('td:nth-child(6) button x');
    
    // Player row = has actions element + has treasury element
    return !!(actions && treasury);
  }

  function filterRows(config) {
    const rows = document.querySelectorAll(
      'div > div > main > div:first-child > div > table:first-of-type > tbody > tr'
    );

    const normalizedAllianceBlacklist = (config.allianceBlacklist || [])
      .map(normalizeText)
      .filter((s) => s.length > 0);

    let totalPlayers = 0;
    let hiddenByFilter = 0;
    let visiblePlayers = 0;

    rows.forEach((row) => {
      // Skip non-player rows (spacers, secondary rows, header)
      if (!isValidPlayerRow(row)) {
        return;
      }

      totalPlayers++;
      row.style.display = '';

      let shouldHide = false;

      // Check for inactive player (no player name link OR no action buttons)
      if (config.hideInactive) {
        const firstTd = row.querySelector('td#name_titles') ?? row.querySelector('td:nth-child(1)');
        const playerNameLink = firstTd?.querySelector('a');
        const actions = row.querySelector('#actions');
        
        const noPlayerLink = !playerNameLink;
        const noActionButtons = actions && actions.children.length === 0;
        
        if (noPlayerLink || noActionButtons) {
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
        hiddenByFilter++;
      } else {
        visiblePlayers++;
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
      `[Battlefield Filter] ${visiblePlayers}/${totalPlayers} players visible ` +
      `(hidden ${hiddenByFilter} by filters: ${activeFilters.join(', ') || 'none'})`
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

  // ─── Scanner ─────────────────────────────────────────────────────────────────

  /**
   * Check if a row is a targetable player (can be interacted with).
   * Stricter than isValidPlayerRow: requires playerNameLink + action buttons.
   */
  function isTargetablePlayer(row) {
    if (!isValidPlayerRow(row)) return false;
    
    const firstTd = row.querySelector('td#name_titles') ?? row.querySelector('td:nth-child(1)');
    const playerNameLink = firstTd?.querySelector('a');
    const actions = row.querySelector('#actions');
    
    // Targetable = has player link + has action buttons
    return !!(playerNameLink && actions && actions.children.length > 0);
  }

  /**
   * Count targetable players that are currently visible (not hidden by filters).
   * Returns { total, visible, visiblePlayers[] } for debugging.
   */
  function countVisiblePlayers() {
    const rows = document.querySelectorAll(
      'div > div > main > div:first-child > div > table:first-of-type > tbody > tr'
    );

    let total = 0;
    let visible = 0;
    const visiblePlayers = [];

    for (const row of rows) {
      if (!isTargetablePlayer(row)) continue;
      total++;

      if (row.style.display !== 'none') {
        visible++;
        const firstTd = row.querySelector('td#name_titles') ?? row.querySelector('td:nth-child(1)');
        const name = firstTd?.querySelector('a')?.textContent?.trim() ?? 'Unknown';
        visiblePlayers.push(name);
      }
    }

    return { total, visible, visiblePlayers };
  }

  function getCurrentPageNumber() {
    const match = window.location.href.match(/[?&]page=(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  async function loadScannerState() {
    try {
      const result = await browser.storage.local.get('scannerState');
      return result.scannerState || null;
    } catch (error) {
      console.error('[Scanner] Error loading state:', error);
      return null;
    }
  }

  async function saveScannerState(state) {
    try {
      await browser.storage.local.set({ scannerState: state });
    } catch (error) {
      console.error('[Scanner] Error saving state:', error);
    }
  }

  async function clearScannerState() {
    try {
      await browser.storage.local.remove('scannerState');
    } catch (error) {
      console.error('[Scanner] Error clearing state:', error);
    }
  }

  function sendStatus(status, page, message = null) {
    try {
      browser.runtime.sendMessage({ type: 'scannerStatus', status, page, message });
    } catch {
      // Popup may be closed
    }
  }

  async function scanCurrentPage() {
    const state = await loadScannerState();
    if (!state?.active) {
      console.log('[Scanner] Not active, skipping');
      return;
    }

    const currentPage = getCurrentPageNumber();
    console.log(`[Scanner] Scanning page ${currentPage} (range: ${state.startPage}-${state.endPage})`);

    // Update state with current page
    state.currentPage = currentPage;
    await saveScannerState(state);
    sendStatus('scanning', currentPage);

    // Wait for DOM to settle, then apply filters and check
    // Random wait 1-3 seconds
    const waitTime = 1000 + Math.random() * 2000;
    console.log(`[Scanner] Waiting ${Math.round(waitTime)}ms before checking...`);

    setTimeout(async () => {
      // Re-check state in case user stopped
      const freshState = await loadScannerState();
      if (!freshState?.active) {
        console.log('[Scanner] Stopped during wait');
        return;
      }

      // Apply filters first
      filterRows(config);

      // Count visible valid players
      const { total, visible, visiblePlayers } = countVisiblePlayers();
      console.log(`[Scanner] Page ${currentPage}: ${visible}/${total} valid players visible`);
      if (visiblePlayers.length > 0) {
        console.log(`[Scanner] Visible players:`, visiblePlayers);
      }

      if (visible > 0) {
        // Found matches!
        console.log(`[Scanner] ✓ MATCH FOUND on page ${currentPage}!`);
        await clearScannerState();
        sendStatus('found', currentPage);
        return;
      }

      // No matches, check if we've reached the end
      if (currentPage >= freshState.endPage) {
        console.log(`[Scanner] Reached end of range (page ${currentPage})`);
        await clearScannerState();
        sendStatus('complete', currentPage);
        return;
      }

      // Navigate to next page
      const nextPage = currentPage + 1;
      console.log(`[Scanner] No matches, navigating to page ${nextPage}...`);
      
      const baseUrl = window.location.href.split('?')[0];
      window.location.href = `${baseUrl}?page=${nextPage}`;
    }, waitTime);
  }

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startScanner') {
      console.log(`[Scanner] Starting: pages ${message.startPage}-${message.endPage}`);
      
      const currentPage = getCurrentPageNumber();
      
      // If not on start page, navigate there first
      if (currentPage !== message.startPage) {
        console.log(`[Scanner] Navigating to start page ${message.startPage}`);
        const baseUrl = window.location.href.split('?')[0];
        window.location.href = `${baseUrl}?page=${message.startPage}`;
      } else {
        // Already on start page, begin scanning
        scanCurrentPage();
      }
      
      sendResponse({ success: true });
    } else if (message.action === 'stopScanner') {
      console.log('[Scanner] Stopped by user');
      clearScannerState();
      sendResponse({ success: true });
    }
    return true;
  });

  // On page load, check if we should continue scanning
  (async () => {
    // Wait a bit for DOM to be ready
    await new Promise(r => setTimeout(r, 1000));
    
    const state = await loadScannerState();
    if (state?.active) {
      console.log('[Scanner] Resuming scan after page load:', state);
      scanCurrentPage();
    }
  })();
})();