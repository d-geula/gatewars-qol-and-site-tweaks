(async function () {
  const DEFAULT_CONFIG = {
    threshold: 0,
    armySizeThreshold: 0,
    hideInactive: true,
    enableTreasuryFilter: true,
    enableArmySizeFilter: false,
    enableAllianceFilter: false,
    allianceBlacklist: [],
    hideNoAttackAction: false,
    enableRefererOverride: true,
    refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars'
  };

  const ROW_SELECTOR = 'main table tbody tr';
  const PAGINATION_SELECTOR = 'ul.pagination.pagination-sm.justify-content-center';
  const INLINE_FILTERS_ID = 'bfh-inline-filters';
  const INLINE_STYLE_ID = 'bfh-inline-filters-style';
  const PENDING_CLASS = 'bfh-pending-filter';

  const pendingStyle = document.createElement('style');
  pendingStyle.textContent = `
    html.${PENDING_CLASS} ${ROW_SELECTOR} { visibility: hidden; }
  `;
  document.documentElement.classList.add(PENDING_CLASS);
  document.documentElement.appendChild(pendingStyle);

  async function waitForBody() {
    if (document.body) return;
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    });
  }

  async function getConfig() {
    try {
      const result = await browser.storage.local.get('config');
      return { ...DEFAULT_CONFIG, ...result.config };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async function waitForElement(selector) {
    const existing = document.querySelector(selector);
    if (existing) return existing;

    return await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function ensureInlineFilterStyles() {
    if (document.getElementById(INLINE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = INLINE_STYLE_ID;
    style.textContent = `
      #${INLINE_FILTERS_ID} {
        width: 100%;
        margin-top: 6px;
        border-collapse: collapse;
      }
      #${INLINE_FILTERS_ID} td {
        font-size: 12px;
        color: inherit;
        padding: 4px 2px;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
        align-items: center;
        justify-content: center;
        margin: 4px 0;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        line-height: 1;
        white-space: nowrap;
      }
      #${INLINE_FILTERS_ID} input[type="checkbox"] {
        margin: 0;
        cursor: pointer;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-input,
      #${INLINE_FILTERS_ID} .bfh-inline-textarea {
        font-size: 12px;
        padding: 2px 4px;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-input {
        width: 110px;
        height: 22px;
        box-sizing: border-box;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-textarea {
        width: 240px;
        height: 42px;
        resize: vertical;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-button {
        font-size: 12px;
        padding: 2px 8px;
        cursor: pointer;
        height: 22px;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-disabled {
        opacity: 0.6;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function getInlineFiltersContainer() {
    return document.getElementById(INLINE_FILTERS_ID);
  }

  function updateInlineInputStates(container) {
    const enableTreasury = container.querySelector('#bfh-inline-enableTreasury')?.checked;
    const treasuryInput = container.querySelector('#bfh-inline-threshold');
    if (treasuryInput) {
      treasuryInput.disabled = !enableTreasury;
    }

    const enableArmy = container.querySelector('#bfh-inline-enableArmy')?.checked;
    const armyInput = container.querySelector('#bfh-inline-armySize');
    if (armyInput) {
      armyInput.disabled = !enableArmy;
    }

    const enableAlliance = container.querySelector('#bfh-inline-enableAlliance')?.checked;
    const allianceLabel = container.querySelector('#bfh-inline-enableAlliance')?.closest('.bfh-inline-label');
    if (allianceLabel) {
      allianceLabel.classList.toggle('bfh-inline-disabled', !enableAlliance);
    }
  }

  function updateInlineFiltersUI(config) {
    const container = getInlineFiltersContainer();
    if (!container) return;

    container.querySelector('#bfh-inline-enableTreasury').checked = config.enableTreasuryFilter;
    container.querySelector('#bfh-inline-threshold').value = config.threshold;
    container.querySelector('#bfh-inline-enableArmy').checked = config.enableArmySizeFilter;
    container.querySelector('#bfh-inline-armySize').value = config.armySizeThreshold;
    container.querySelector('#bfh-inline-hideNoAttack').checked = config.hideNoAttackAction ?? false;
    container.querySelector('#bfh-inline-enableAlliance').checked = config.enableAllianceFilter;

    updateInlineInputStates(container);
  }

  function readInlineFiltersConfig(container) {
    return {
      enableTreasuryFilter: container.querySelector('#bfh-inline-enableTreasury').checked,
      threshold: parseInt(container.querySelector('#bfh-inline-threshold').value, 10) || 0,
      enableArmySizeFilter: container.querySelector('#bfh-inline-enableArmy').checked,
      armySizeThreshold: parseInt(container.querySelector('#bfh-inline-armySize').value, 10) || 0,
      hideNoAttackAction: container.querySelector('#bfh-inline-hideNoAttack').checked,
      enableAllianceFilter: container.querySelector('#bfh-inline-enableAlliance').checked
    };
  }

  async function saveInlineFilters(container) {
    const inlineConfig = readInlineFiltersConfig(container);
    const newConfig = { ...config, ...inlineConfig };
    config = newConfig;
    await browser.storage.local.set({ config: newConfig });
    filterRows(newConfig);
  }

  function buildInlineFiltersUI() {
    const table = document.createElement('table');
    table.id = INLINE_FILTERS_ID;
    table.innerHTML = `
      <tbody>
        <tr>
          <td align="middle">
            <div class="bfh-inline-row">
              <strong>Filters:</strong>
              <label class="bfh-inline-label">
                <input type="checkbox" id="bfh-inline-enableTreasury">
                Treasury &gt;=
              </label>
              <input type="number" id="bfh-inline-threshold" class="bfh-inline-input" min="0" step="100000" placeholder="500000">
              <label class="bfh-inline-label">
                <input type="checkbox" id="bfh-inline-enableArmy">
                Army &gt;=
              </label>
              <input type="number" id="bfh-inline-armySize" class="bfh-inline-input" min="0" step="100000" placeholder="0">
              <label class="bfh-inline-label">
                <input type="checkbox" id="bfh-inline-hideNoAttack">
                Hide no-attack
              </label>
              <label class="bfh-inline-label">
                <input type="checkbox" id="bfh-inline-enableAlliance">
                Alliance blacklist enabled
              </label>
            </div>
          </td>
        </tr>
        <tr>
          <td align="middle">
            <div class="bfh-inline-row">
              <strong>Scanner:</strong>
              <span class="bfh-inline-label">Start</span>
              <input type="number" id="bfh-inline-startPage" class="bfh-inline-input" min="1" max="2000" placeholder="1">
              <span class="bfh-inline-label">End</span>
              <input type="number" id="bfh-inline-endPage" class="bfh-inline-input" min="1" max="2000" placeholder="2000">
              <button type="button" class="bfh-inline-button" id="bfh-inline-startScanner" style="background: #4caf50; color: #fff; border: 0;">Start</button>
              <button type="button" class="bfh-inline-button" id="bfh-inline-stopScanner" style="background: #f44336; color: #fff; border: 0; display: none;">Stop</button>
            </div>
          </td>
        </tr>
      </tbody>
    `;
    return table;
  }

  function setupInlineFilterHandlers(container) {
    const autoApplyIds = [
      'bfh-inline-enableTreasury',
      'bfh-inline-threshold',
      'bfh-inline-enableArmy',
      'bfh-inline-armySize',
      'bfh-inline-hideNoAttack',
      'bfh-inline-enableAlliance'
    ];

    autoApplyIds.forEach((id) => {
      const input = container.querySelector(`#${id}`);
      input.addEventListener('change', () => saveInlineFilters(container));
    });

    container.querySelector('#bfh-inline-threshold').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveInlineFilters(container);
      }
    });
    container.querySelector('#bfh-inline-armySize').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveInlineFilters(container);
      }
    });

    container.querySelector('#bfh-inline-enableTreasury').addEventListener('change', () => {
      updateInlineInputStates(container);
    });
    container.querySelector('#bfh-inline-enableArmy').addEventListener('change', () => {
      updateInlineInputStates(container);
    });
    container.querySelector('#bfh-inline-enableAlliance').addEventListener('change', () => {
      updateInlineInputStates(container);
    });
  }

  function getInlineScannerElements() {
    const container = getInlineFiltersContainer();
    if (!container) return null;
    return {
      startInput: container.querySelector('#bfh-inline-startPage'),
      endInput: container.querySelector('#bfh-inline-endPage'),
      startButton: container.querySelector('#bfh-inline-startScanner'),
      stopButton: container.querySelector('#bfh-inline-stopScanner')
    };
  }

  function setInlineScannerRunning(running) {
    const elements = getInlineScannerElements();
    if (!elements) return;
    elements.startButton.style.display = running ? 'none' : 'inline-block';
    elements.stopButton.style.display = running ? 'inline-block' : 'none';
  }

  function updateInlineScannerProgress(currentPage, endPage) {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const nextPage = Math.min(currentPage + 1, endPage);
    elements.startInput.value = nextPage;
  }

  async function loadScannerPages() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const scannerResult = await browser.storage.local.get('scannerState');
    if (scannerResult.scannerState?.active) {
      return;
    }
    const result = await browser.storage.local.get('scannerPages');
    if (result.scannerPages?.endPage) {
      elements.endInput.value = result.scannerPages.endPage;
    }
  }

  async function saveScannerPages() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const endPage = parseInt(elements.endInput.value, 10);
    await browser.storage.local.set({
      scannerPages: { endPage: endPage || null }
    });
  }

  async function populateCurrentPage() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const result = await browser.storage.local.get('scannerState');
    if (result.scannerState?.active) {
      return;
    }
    const currentPage = getCurrentPageNumber();
    elements.startInput.value = currentPage + 1;
  }

  async function checkScannerState() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const result = await browser.storage.local.get('scannerState');
    if (result.scannerState?.active) {
      setInlineScannerRunning(true);
      updateInlineScannerProgress(
        result.scannerState.currentPage || result.scannerState.startPage,
        result.scannerState.endPage
      );
      elements.endInput.value = result.scannerState.endPage;
    }
  }

  async function startInlineScanner() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const startPage = parseInt(elements.startInput.value, 10);
    const endPage = parseInt(elements.endInput.value, 10);

    if (!startPage || !endPage || startPage < 1 || endPage > 2000 || startPage > endPage) {
      console.warn('[Scanner] Invalid page range.');
      return;
    }

    await browser.storage.local.set({
      scannerState: { active: true, startPage, endPage, currentPage: startPage }
    });

    await saveScannerPages();
    setInlineScannerRunning(true);

    const currentPage = getCurrentPageNumber();
    if (currentPage !== startPage) {
      const baseUrl = window.location.href.split('?')[0];
      window.location.href = `${baseUrl}?page=${startPage}`;
    } else {
      scanCurrentPage();
    }
  }

  async function stopInlineScanner() {
    await browser.storage.local.remove('scannerState');
    setInlineScannerRunning(false);
  }

  function setupInlineScannerHandlers() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    elements.startButton.addEventListener('click', startInlineScanner);
    elements.stopButton.addEventListener('click', stopInlineScanner);
    elements.endInput.addEventListener('change', saveScannerPages);

    elements.startInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        startInlineScanner();
      }
    });
    elements.endInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        startInlineScanner();
      }
    });
  }

  async function injectInlineFilters() {
    await waitForBody();
    ensureInlineFilterStyles();
    const pagination = await waitForElement(PAGINATION_SELECTOR);
    if (!pagination || getInlineFiltersContainer()) return;

    const table = buildInlineFiltersUI();
    const nav = pagination.closest('nav');
    if (nav?.parentElement) {
      nav.insertAdjacentElement('afterend', table);
    } else {
      pagination.insertAdjacentElement('afterend', table);
    }

    updateInlineFiltersUI(config);
    setupInlineFilterHandlers(table);
    setupInlineScannerHandlers();
    loadScannerPages();
    populateCurrentPage();
    checkScannerState();
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

  function getFirstTd(row) {
    return row.querySelector('td#name_titles') ?? row.querySelector('td:nth-child(1)');
  }

  /**
   * Check if a numeric cell value (reversed) fails to meet a threshold.
   * Returns true if should hide (value is unknown or below threshold).
   */
  function failsThreshold(row, cellIndex, threshold) {
    const el = row.querySelector(`td:nth-child(${cellIndex}) button x`);
    if (!el) return false;
    const text = el.textContent.trim();
    if (/^\?+$/.test(text)) return true;
    const value = parseReversedValue(text);
    return !isNaN(value) && value < threshold;
  }

  /**
   * Check if a row is a valid player row (not a spacer, header, or secondary row).
   * Player rows have: actions element (even if empty for inactive) + treasury element.
   */
  function isValidPlayerRow(row) {
    return !!(row.querySelector('#actions') && row.querySelector('td:nth-child(6) button x'));
  }

  /**
   * Check if a row has an attack action available (form with action="attack2.php").
   * Returns true if attack action exists, false otherwise.
   */
  function hasAttackAction(row) {
    const actions = row.querySelector('#actions');
    if (!actions) return false;
    // Look for forms with action="attack2.php" within the actions element only
    return !!actions.querySelector('form[action="attack2.php"]');
  }

  function filterRows(config) {
    const rows = document.querySelectorAll(ROW_SELECTOR);

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
        const firstTd = getFirstTd(row);
        const actions = row.querySelector('#actions');
        if (!firstTd?.querySelector('a') || actions?.children.length === 0) {
          shouldHide = true;
        }
      }

      // Check treasury value (column 6, reversed)
      if (!shouldHide && config.enableTreasuryFilter && failsThreshold(row, 6, config.threshold)) {
        shouldHide = true;
      }

      // Check army size (column 4, reversed)
      if (!shouldHide && config.enableArmySizeFilter && failsThreshold(row, 4, config.armySizeThreshold)) {
        shouldHide = true;
      }

      // Check alliance blacklist - alliance name is in td[1] as span.text-white (inside the brackets)
      if (!shouldHide && config.enableAllianceFilter && normalizedAllianceBlacklist.length > 0) {
        const firstTd = getFirstTd(row);
        // Preferred: the alliance "name/tag" span; fallback: parse first [...] block
        const spanText = firstTd?.querySelector('span.text-white')?.textContent;
        const bracketText = firstTd?.textContent?.match(/\[([\s\S]*?)\]/)?.[1];
        const allianceName = normalizeText(extractAllianceName(spanText ?? bracketText ?? ''));
        if (allianceName && normalizedAllianceBlacklist.includes(allianceName)) {
          shouldHide = true;
        }
      }

      // Check if player has attack action available (only if they pass other filters)
      if (!shouldHide && config.hideNoAttackAction && !hasAttackAction(row)) {
        shouldHide = true;
      }

      if (shouldHide) {
        row.style.display = 'none';
        hiddenByFilter++;
      } else {
        visiblePlayers++;
      }
    });

    if (pendingHide) {
      pendingHide = false;
      document.documentElement.classList.remove(PENDING_CLASS);
      pendingStyle.remove();
    }

    const activeFilters = [];
    if (config.hideInactive) activeFilters.push('inactive');
    if (config.enableTreasuryFilter) activeFilters.push(`treasury<${config.threshold.toLocaleString()}`);
    if (config.enableArmySizeFilter) activeFilters.push(`army<${config.armySizeThreshold.toLocaleString()}`);
    if (config.enableAllianceFilter && config.allianceBlacklist.length > 0) {
      activeFilters.push(`alliances: ${config.allianceBlacklist.length}`);
    }
    if (config.hideNoAttackAction) activeFilters.push('no-attack-action');
    
    console.log(
      `[Battlefield Filter] ${visiblePlayers}/${totalPlayers} players visible ` +
      `(hidden ${hiddenByFilter} by filters: ${activeFilters.join(', ') || 'none'})`
    );
  }

  // Cache config to avoid hitting storage on every DOM mutation
  let config = await getConfig();
  let pendingHide = true;

  // Listen for config changes from popup
  browser.storage.onChanged.addListener((changes) => {
    if (changes.config) {
      config = changes.config.newValue;
      filterRows(config);
      updateInlineFiltersUI(config);
    }
  });

  // Initial run
  await waitForBody();
  injectInlineFilters();
  filterRows(config);

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
    const actions = row.querySelector('#actions');
    return !!(getFirstTd(row)?.querySelector('a') && actions?.children.length > 0);
  }

  /**
   * Count targetable players that are currently visible (not hidden by filters).
   * Returns { total, visible, visiblePlayers[] } for debugging.
   */
  function countVisiblePlayers() {
    const rows = document.querySelectorAll(ROW_SELECTOR);
    let total = 0;
    let visible = 0;
    const visiblePlayers = [];

    for (const row of rows) {
      if (!isTargetablePlayer(row)) continue;
      total++;
      if (row.style.display !== 'none') {
        visible++;
        visiblePlayers.push(getFirstTd(row)?.querySelector('a')?.textContent?.trim() ?? 'Unknown');
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
    updateInlineScannerProgress(currentPage, state.endPage);

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
        setInlineScannerRunning(false);
        return;
      }

      // No matches, check if we've reached the end
      if (currentPage >= freshState.endPage) {
        console.log(`[Scanner] Reached end of range (page ${currentPage})`);
        await clearScannerState();
        sendStatus('complete', currentPage);
        setInlineScannerRunning(false);
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
    if (message.action === 'applyFilters') {
      config = message.config || config;
      filterRows(config);
      updateInlineFiltersUI(config);
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

  // On page load, check if we should continue scanning
  (async () => {
    // Wait a bit for DOM to be ready
    await new Promise(r => setTimeout(r, 1000));
    
    const state = await loadScannerState();
    if (state?.active) {
      console.log('[Scanner] Resuming scan after page load:', state);
      setInlineScannerRunning(true);
      updateInlineScannerProgress(state.currentPage || state.startPage, state.endPage);
      scanCurrentPage();
    }
  })();
})();