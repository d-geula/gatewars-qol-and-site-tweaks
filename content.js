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
    refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars',
    tweakSidebarListGroup: false,
    tweakClockTransparency: false,
    tweakGnrCountdown: false
  };

  const ROW_SELECTOR = 'main table tbody tr';
  const PAGINATION_SELECTOR = 'ul.pagination.pagination-sm.justify-content-center';
  const SIDEBAR_LIST_GROUP_SELECTOR = 'div.list-group:nth-child(1)';
  const CLOCK_CELL_SELECTOR = '.table-gametime > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1)';
  const SITE_TWEAKS_STYLE_ID = 'bfh-site-tweaks-style';
  const CLOCK_TRANSPARENT_CLASS = 'bfh-clock-transparent';
  const GNR_COUNTDOWN_CLASS = 'bfh-gnr-countdown';
  const GNR_TABLE_SELECTOR = 'table.table.table-rank';
  const INLINE_FILTERS_ID = 'bfh-inline-filters';
  const INLINE_STYLE_ID = 'bfh-inline-filters-style';
  const PENDING_CLASS = 'bfh-pending-filter';
  const INLINE_WRAPPER_CLASS = 'bfh-inline-wrap';
  const SCANNER_STATE_PREFIX = 'scannerState:';
  const SCANNER_PAGES_PREFIX = 'scannerPages:';

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

  function ensureSiteTweaksStyles() {
    if (document.getElementById(SITE_TWEAKS_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SITE_TWEAKS_STYLE_ID;
    style.textContent = `
      html.${CLOCK_TRANSPARENT_CLASS} ${CLOCK_CELL_SELECTOR} {
        background: rgba(0, 0, 0, 0) !important;
        background-color: rgba(0, 0, 0, 0) !important;
      }
      .${GNR_COUNTDOWN_CLASS} {
        font-size: 11px;
        color: #9aa0a6;
        margin-top: 2px;
        white-space: nowrap;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function applySidebarListGroupTweak(enabled) {
    const listGroup = document.querySelector(SIDEBAR_LIST_GROUP_SELECTOR);
    if (!listGroup) return;

    if (enabled) {
      listGroup.classList.remove('lg-2');
      listGroup.classList.add('lg-1');
    } else {
      listGroup.classList.remove('lg-1');
      listGroup.classList.add('lg-2');
    }

    const listItems = listGroup.querySelectorAll('a.list-group-item');
    listItems.forEach((item) => {
      if (!isHomePageListItem(item)) return;
      item.style.display = enabled ? 'none' : '';
    });
  }

  function applyClockTransparencyTweak(enabled) {
    ensureSiteTweaksStyles();
    if (enabled) {
      document.documentElement.classList.add(CLOCK_TRANSPARENT_CLASS);
    } else {
      document.documentElement.classList.remove(CLOCK_TRANSPARENT_CLASS);
    }
  }

  function isBasePage() {
    return window.location.pathname.endsWith('/base.php');
  }

  function isBattlefieldPage() {
    return window.location.pathname.includes('/battlefield');
  }

  function formatTurnDuration(totalMinutes) {
    if (totalMinutes <= 0) return '0m';

    const weeks = Math.floor(totalMinutes / (7 * 24 * 60));
    const days = Math.floor((totalMinutes % (7 * 24 * 60)) / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = Math.round(totalMinutes % 60);

    const parts = [];
    if (weeks > 0) parts.push(`${weeks}w`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ');
  }

  function parseTurnGain(text) {
    const match = String(text ?? '').match(/([+-]?\d+)\s*\/\s*turn/i);
    return match ? parseInt(match[1], 10) : null;
  }

  function getGnrRowData() {
    const buttonSelector = 'div.hidden-md-down:nth-child(1) > table:nth-child(2) > tbody:nth-child(1) > tr:nth-child(8) > td:nth-child(2) > button:nth-child(1)';
    const perTurnSelector = 'div.hidden-md-down:nth-child(1) > table:nth-child(2) > tbody:nth-child(1) > tr:nth-child(8) > td:nth-child(3)';

    const scoreButton = document.querySelector(buttonSelector);
    const perTurnCell = document.querySelector(perTurnSelector);
    if (scoreButton && perTurnCell) {
      return { perTurnCell, scoreButton };
    }

    const fallbackButton = document.querySelector('button.btn.btn-sm.btn-neutral.p-0');
    const fallbackRow = fallbackButton?.closest('tr');
    const fallbackPerTurn = fallbackRow?.querySelector('td:nth-child(3)') ?? fallbackRow?.querySelector('td[align="right"]');
    if (fallbackButton && fallbackPerTurn && /\/\s*turn/i.test(fallbackPerTurn.textContent || '')) {
      return { perTurnCell: fallbackPerTurn, scoreButton: fallbackButton };
    }

    return null;
  }

  function applyGnrCountdownTweak(enabled) {
    const existing = document.querySelector(`.${GNR_COUNTDOWN_CLASS}`);
    if (!enabled || !isBasePage()) {
      existing?.remove();
      return;
    }

    const rowData = getGnrRowData();
    if (!rowData) {
      existing?.remove();
      return;
    }

    const scoreText = rowData.scoreButton.textContent?.trim().replace(/,/g, '');
    const currentScore = parseInt(scoreText || '', 10);
    const perTurn = parseTurnGain(rowData.perTurnCell.textContent);
    if (!Number.isFinite(currentScore) || !Number.isFinite(perTurn)) {
      existing?.remove();
      return;
    }

    let countdownText = '';
    if (currentScore >= 1000) {
      countdownText = 'Ascend ready (>= 1,000)';
    } else if (perTurn <= 0) {
      countdownText = 'No gain this turn';
    } else {
      const remaining = 1000 - currentScore;
      const turnsNeeded = Math.ceil(remaining / perTurn);
      const minutesNeeded = turnsNeeded * 30;
      countdownText = `Ascend in ${formatTurnDuration(minutesNeeded)} (${turnsNeeded} turns)`;
    }

    const countdown = existing || document.createElement('div');
    countdown.className = GNR_COUNTDOWN_CLASS;
    countdown.textContent = countdownText;
    if (!existing) {
      rowData.perTurnCell.appendChild(countdown);
    }
  }

  function applySiteTweaks(config, { includeGnrCountdown = false } = {}) {
    if (config.tweakSidebarListGroup) {
      applySidebarListGroupTweak(true);
    } else {
      applySidebarListGroupTweak(false);
    }

    if (config.tweakClockTransparency) {
      applyClockTransparencyTweak(true);
    } else {
      applyClockTransparencyTweak(false);
    }

    // GNR countdown only runs once per page load or config change, not on every DOM mutation
    if (includeGnrCountdown) {
      if (config.tweakGnrCountdown) {
        applyGnrCountdownTweak(true);
      } else {
        applyGnrCountdownTweak(false);
      }
    }
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
      .${INLINE_WRAPPER_CLASS} {
        width: 100%;
        flex-basis: 100%;
        flex: 0 0 100%;
        max-width: 100%;
        display: flex;
        justify-content: center;
        margin-top: 6px;
        clear: both;
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
    `;
    document.documentElement.appendChild(style);
  }

  function getInlineFiltersContainer() {
    return document.getElementById(INLINE_FILTERS_ID);
  }

  async function getTabId() {
    if (getTabId.cached !== undefined) {
      return getTabId.cached;
    }
    try {
      const result = await browser.runtime.sendMessage({ type: 'getTabId' });
      const tabId = Number.isFinite(result?.tabId) ? result.tabId : null;
      getTabId.cached = tabId;
      return tabId;
    } catch {
      getTabId.cached = null;
      return null;
    }
  }

  async function getScannerStorageKeys() {
    const tabId = await getTabId();
    const suffix = Number.isFinite(tabId) ? String(tabId) : 'global';
    return {
      stateKey: `${SCANNER_STATE_PREFIX}${suffix}`,
      pagesKey: `${SCANNER_PAGES_PREFIX}${suffix}`
    };
  }

  function findInlineInsertionParent() {
    const parentXPath = '/html/body/div/div/main/div[1]/div/form/div';
    const parentNode = document.evaluate(
      parentXPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    return parentNode || null;
  }

  function updateInlineInputStates(container) {
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
    const { stateKey, pagesKey } = await getScannerStorageKeys();
    const scannerResult = await browser.storage.local.get(stateKey);
    if (scannerResult[stateKey]?.active) {
      return;
    }
    const result = await browser.storage.local.get(pagesKey);
    if (result[pagesKey]?.endPage) {
      elements.endInput.value = result[pagesKey].endPage;
    }
  }

  async function saveScannerPages() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const { pagesKey } = await getScannerStorageKeys();
    const endPage = parseInt(elements.endInput.value, 10);
    await browser.storage.local.set({
      [pagesKey]: { endPage: endPage || null }
    });
  }

  async function populateCurrentPage() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const { stateKey } = await getScannerStorageKeys();
    const result = await browser.storage.local.get(stateKey);
    if (result[stateKey]?.active) {
      return;
    }
    const currentPage = getCurrentPageNumber();
    elements.startInput.value = currentPage + 1;
  }

  async function checkScannerState() {
    const elements = getInlineScannerElements();
    if (!elements) return;
    const { stateKey } = await getScannerStorageKeys();
    const result = await browser.storage.local.get(stateKey);
    if (result[stateKey]?.active) {
      setInlineScannerRunning(true);
      const currentPage = getCurrentPageNumber();
      updateInlineScannerProgress(currentPage, result[stateKey].endPage);
      elements.endInput.value = result[stateKey].endPage;
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

    const { stateKey } = await getScannerStorageKeys();
    await browser.storage.local.set({
      [stateKey]: { active: true, startPage, endPage, currentPage: startPage }
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
    const { stateKey } = await getScannerStorageKeys();
    await browser.storage.local.remove(stateKey);
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
    // Only inject on battlefield pages
    if (!isBattlefieldPage()) return;

    await waitForBody();
    ensureInlineFilterStyles();
    const pagination = await waitForElement(PAGINATION_SELECTOR);
    if (!pagination || getInlineFiltersContainer()) return;

    const table = buildInlineFiltersUI();
    const wrapper = document.createElement('div');
    wrapper.className = INLINE_WRAPPER_CLASS;
    wrapper.appendChild(table);

    const insertionParent = findInlineInsertionParent();
    const nav = pagination.closest('nav');
    if (insertionParent) {
      const computed = window.getComputedStyle(insertionParent);
      if (computed.display === 'flex' || computed.display === 'inline-flex') {
        insertionParent.style.flexWrap = 'wrap';
        if (!insertionParent.style.rowGap) {
          insertionParent.style.rowGap = '6px';
        }
      }
      insertionParent.appendChild(wrapper);
    } else if (nav?.parentElement) {
      nav.insertAdjacentElement('afterend', wrapper);
    } else {
      pagination.insertAdjacentElement('afterend', wrapper);
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

  function isHomePageListItem(item) {
    if (!item) return false;
    const text = normalizeText(item.textContent || '');
    if (text.includes('home page')) return true;
    if (item.querySelector('.fa-home')) return true;
    const href = item.getAttribute('href') || '';
    return href.includes('gatewa.rs') && href.includes('base.php');
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
    // Only run on battlefield pages
    if (!isBattlefieldPage()) {
      // Still need to remove pending hide class on non-battlefield pages
      if (pendingHide) {
        pendingHide = false;
        document.documentElement.classList.remove(PENDING_CLASS);
        pendingStyle.remove();
      }
      return;
    }

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
      applySiteTweaks(config, { includeGnrCountdown: true });
    }
  });

  // Initial run
  await waitForBody();
  injectInlineFilters();
  applySiteTweaks(config, { includeGnrCountdown: true });
  filterRows(config);

  // Re-run on DOM changes (excludes GNR countdown - that's a one-time calculation)
  const observer = new MutationObserver(() => {
    filterRows(config);
    applySiteTweaks(config);
  });

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
      const { stateKey } = await getScannerStorageKeys();
      const result = await browser.storage.local.get(stateKey);
      return result[stateKey] || null;
    } catch (error) {
      console.error('[Scanner] Error loading state:', error);
      return null;
    }
  }

  async function saveScannerState(state) {
    try {
      const { stateKey } = await getScannerStorageKeys();
      await browser.storage.local.set({ [stateKey]: state });
    } catch (error) {
      console.error('[Scanner] Error saving state:', error);
    }
  }

  async function clearScannerState() {
    try {
      const { stateKey } = await getScannerStorageKeys();
      await browser.storage.local.remove(stateKey);
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
      applySiteTweaks(config);
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
      const currentPage = getCurrentPageNumber();
      updateInlineScannerProgress(currentPage, state.endPage);
      scanCurrentPage();
    }
  })();
})();