(async function () {
  const DEFAULT_CONFIG = {
    hideInactive: true,
    enableTreasuryFilter: false,
    threshold: 0,
    enableArmySizeFilter: false,
    armySizeThreshold: 0,
    hideNoAttackAction: false,
    stabilizeSiteLayout: true,
    transparentGameTimePanel: true,
    enableSkillTargetUpgrades: false,
    enableRefererOverride: true,
    refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars'
  };

  const CONFIG_KEY = 'config';
  const ROW_SELECTOR = 'main table tbody tr';
  const PAGINATION_SELECTOR = 'ul.pagination.pagination-sm.justify-content-center';
  const INLINE_FILTERS_ID = 'bfh-inline-filters';
  const INLINE_STYLE_ID = 'bfh-inline-filters-style';
  const SITE_LAYOUT_STYLE_ID = 'bfh-stabilize-site-layout-style';
  const GAME_TIME_PANEL_STYLE_ID = 'bfh-transparent-game-time-panel-style';
  const SKILL_UPGRADES_STYLE_ID = 'bfh-skill-target-upgrades-style';
  const SKILL_UPGRADE_STATE_KEY = 'bfh-skill-target-upgrade';
  const FORUMS_LINK_SELECTOR = 'a[href="https://talk.gatewa.rs"], a[href="https://talk.gatewa.rs/"]';
  const HEADER_BANNER_SECTION_SELECTOR = 'nav.navbar.navbar-inverse.fixed-top > section';
  const HEADER_BANNER_SELECTOR = `${HEADER_BANNER_SECTION_SELECTOR} > img[src*="banner-"]`;
  const GAME_TIME_CELL_SELECTOR = 'table.table-gametime td[style*="background"]';
  const PENDING_CLASS = 'bfh-pending-filter';
  const FILTER_STORM_WINDOW_MS = 5000;
  const FILTER_STORM_THRESHOLD = 20;
  const FILTER_STORM_WARN_COOLDOWN_MS = 10000;

  const pendingStyle = document.createElement('style');
  pendingStyle.textContent = `
    html.${PENDING_CLASS} ${ROW_SELECTOR} {
      visibility: hidden;
    }
  `;
  document.documentElement.classList.add(PENDING_CLASS);
  document.documentElement.appendChild(pendingStyle);

  let lastFilterSummary = '';
  let filterPassTimestamps = [];
  let lastStormWarningAt = 0;

  function normalizeConfig(rawConfig = {}) {
    return {
      ...DEFAULT_CONFIG,
      ...rawConfig,
      hideInactive: Boolean(rawConfig.hideInactive ?? DEFAULT_CONFIG.hideInactive),
      enableTreasuryFilter: Boolean(rawConfig.enableTreasuryFilter),
      threshold: Math.max(0, parseInt(rawConfig.threshold, 10) || 0),
      enableArmySizeFilter: Boolean(rawConfig.enableArmySizeFilter),
      armySizeThreshold: Math.max(0, parseInt(rawConfig.armySizeThreshold, 10) || 0),
      hideNoAttackAction: Boolean(rawConfig.hideNoAttackAction),
      stabilizeSiteLayout: Boolean(rawConfig.stabilizeSiteLayout ?? DEFAULT_CONFIG.stabilizeSiteLayout),
      transparentGameTimePanel: Boolean(rawConfig.transparentGameTimePanel ?? DEFAULT_CONFIG.transparentGameTimePanel),
      enableSkillTargetUpgrades: Boolean(
        rawConfig.enableSkillTargetUpgrades ?? DEFAULT_CONFIG.enableSkillTargetUpgrades
      ),
      enableRefererOverride: Boolean(rawConfig.enableRefererOverride ?? DEFAULT_CONFIG.enableRefererOverride),
      refererOverrideUrl: String(rawConfig.refererOverrideUrl ?? DEFAULT_CONFIG.refererOverrideUrl).trim() ||
        DEFAULT_CONFIG.refererOverrideUrl
    };
  }

  async function getConfig() {
    try {
      const result = await chrome.storage.local.get(CONFIG_KEY);
      return normalizeConfig(result?.[CONFIG_KEY]);
    } catch (error) {
      console.warn('[Battlefield Filter] Falling back to defaults.', error);
      return normalizeConfig();
    }
  }

  async function saveConfig(nextConfig) {
    const normalizedConfig = normalizeConfig(nextConfig);
    await chrome.storage.local.set({ [CONFIG_KEY]: normalizedConfig });
    return normalizedConfig;
  }

  function isBattlefieldPage() {
    return window.location.pathname.includes('/battlefield');
  }

  function isTrainingPage() {
    return window.location.pathname.endsWith('/train.php');
  }

  function applySiteLayoutStabilization(config) {
    const existingStyle = document.getElementById(SITE_LAYOUT_STYLE_ID);

    if (!config.stabilizeSiteLayout) {
      existingStyle?.remove();
      return;
    }

    if (existingStyle) return;

    const style = document.createElement('style');
    style.id = SITE_LAYOUT_STYLE_ID;
    style.textContent = `
      ${FORUMS_LINK_SELECTOR} {
        display: none !important;
      }
      @media (min-width: 909px) {
      nav.navbar.navbar-inverse.fixed-top {
        height: 90px !important;
        min-height: 90px !important;
        max-height: 90px !important;
      }
      nav.hidden-xs-down.sidebar > .list-group.mx-auto.lg-2 {
        height: 90px !important;
        min-height: 90px !important;
        max-height: 90px !important;
      }
      main.mine {
        margin-top: 110px !important;
      }
      ${HEADER_BANNER_SECTION_SELECTOR} {
        flex: 0 0 728px !important;
        width: 728px !important;
        height: 88px !important;
        min-height: 88px !important;
        max-height: 88px !important;
        max-width: 728px !important;
      }
      ${HEADER_BANNER_SELECTOR} {
        display: block !important;
        width: 728px !important;
        height: 88px !important;
        max-height: 88px !important;
      }
      main.mine nav[aria-label="Page navigation top"] {
        margin-top: 3px !important;
      }
      }
      @media (max-width: 908px) {
      ${HEADER_BANNER_SECTION_SELECTOR} {
        flex: 0 0 auto !important;
        width: calc(100vw - 180px) !important;
        max-width: none !important;
      }
      ${HEADER_BANNER_SELECTOR} {
        display: block !important;
        width: 100% !important;
        height: auto !important;
        max-width: none !important;
      }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function applyGameTimePanelTransparency(config) {
    const existingStyle = document.getElementById(GAME_TIME_PANEL_STYLE_ID);

    if (!config.transparentGameTimePanel) {
      existingStyle?.remove();
      return;
    }

    if (existingStyle) return;

    const style = document.createElement('style');
    style.id = GAME_TIME_PANEL_STYLE_ID;
    style.textContent = `
      ${GAME_TIME_CELL_SELECTOR} {
        background: rgba(0, 0, 0, 0) !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureSkillUpgradeStyles() {
    if (document.getElementById(SKILL_UPGRADES_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = SKILL_UPGRADES_STYLE_ID;
    style.textContent = `
      .bfh-skill-target-controls {
        display: grid;
        gap: 3px;
        margin-top: 5px;
        font-size: 12px;
      }
      .bfh-skill-target-main {
        display: flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
      }
      .bfh-skill-target-input {
        box-sizing: border-box;
        width: 58px;
        height: 28px;
        padding: 3px 5px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
      }
      .bfh-skill-target-button {
        min-width: 68px;
        height: 28px;
        padding: 3px 8px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        cursor: pointer;
      }
      .bfh-skill-target-button:disabled {
        cursor: default;
        opacity: 0.45;
      }
      .bfh-skill-target-status {
        color: #c8d3df;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function readSkillUpgradeState() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SKILL_UPGRADE_STATE_KEY) || 'null');
    } catch (error) {
      console.warn('[Skill Upgrade] Ignoring invalid saved progress.', error);
      return null;
    }
  }

  function saveSkillUpgradeState(state) {
    if (state) {
      window.sessionStorage.setItem(SKILL_UPGRADE_STATE_KEY, JSON.stringify(state));
    } else {
      window.sessionStorage.removeItem(SKILL_UPGRADE_STATE_KEY);
    }
  }

  function parseSkillLevel(row) {
    const match = row?.textContent.match(/\bLevel\s+(\d+)\b/i);
    return match ? parseInt(match[1], 10) : null;
  }

  function findSkillRow(submitName) {
    const forms = document.querySelectorAll(`form[action="train2.php"] input[name="${submitName}"]`);
    for (const submit of forms) {
      const row = submit.closest('tr');
      if (row && row.getClientRects().length > 0) return row;
    }
    return forms[0]?.closest('tr') || null;
  }

  function getSkillTargetControls(submitName) {
    return document.querySelector(`.bfh-skill-target-controls[data-submit-name="${submitName}"]`);
  }

  function setSkillUpgradeStatus(submitName, message) {
    const status = getSkillTargetControls(submitName)?.querySelector('.bfh-skill-target-status');
    if (status) {
      status.textContent = message;
    }
  }

  function updateSkillUpgradeButtons(activeSubmitName = null) {
    document.querySelectorAll('.bfh-skill-target-controls').forEach((controls) => {
      const button = controls.querySelector('.bfh-skill-target-button');
      const isActive = controls.dataset.submitName === activeSubmitName;
      button.textContent = isActive ? 'Cancel' : 'Upgrade';
      button.disabled = Boolean(activeSubmitName) && !isActive;
    });
  }

  function submitNextSkillUpgrade(state) {
    const row = findSkillRow(state.submitName);
    const currentLevel = parseSkillLevel(row);
    const submit = row?.querySelector(`input[name="${state.submitName}"]`);

    if (currentLevel === null || !submit?.form) {
      saveSkillUpgradeState(null);
      updateSkillUpgradeButtons();
      setSkillUpgradeStatus(state.submitName, 'Stopped: upgrade control not found.');
      return;
    }

    if (Number.isInteger(state.lastLevel) && currentLevel <= state.lastLevel) {
      saveSkillUpgradeState(null);
      updateSkillUpgradeButtons();
      setSkillUpgradeStatus(
        state.submitName,
        `Stopped at level ${currentLevel}; the last upgrade did not complete.`
      );
      return;
    }

    if (currentLevel >= state.targetLevel) {
      saveSkillUpgradeState(null);
      updateSkillUpgradeButtons();
      setSkillUpgradeStatus(state.submitName, `Target level ${state.targetLevel} reached.`);
      return;
    }

    saveSkillUpgradeState({ ...state, lastLevel: currentLevel });
    updateSkillUpgradeButtons(state.submitName);
    setSkillUpgradeStatus(state.submitName, `Upgrading ${currentLevel} → ${currentLevel + 1}…`);
    window.setTimeout(() => submit.form.requestSubmit(submit), 500);
  }

  function buildSkillTargetControls(skill) {
    const controls = document.createElement('div');
    controls.className = 'bfh-skill-target-controls';
    controls.dataset.submitName = skill.submitName;
    controls.innerHTML = `
      <div class="bfh-skill-target-main">
        <span>Target</span>
        <input
          type="number"
          class="bfh-skill-target-input"
          aria-label="Target level"
          min="${skill.currentLevel + 1}"
          step="1"
          value="${skill.currentLevel + 1}"
        >
        <button type="button" class="bfh-skill-target-button">Upgrade</button>
      </div>
      <span class="bfh-skill-target-status"></span>
    `;

    const input = controls.querySelector('.bfh-skill-target-input');
    const button = controls.querySelector('.bfh-skill-target-button');
    button.addEventListener('click', () => {
      const activeState = readSkillUpgradeState();
      if (activeState) {
        if (activeState.submitName === skill.submitName) {
          saveSkillUpgradeState(null);
          updateSkillUpgradeButtons();
          setSkillUpgradeStatus(skill.submitName, 'Upgrade cancelled.');
        }
        return;
      }

      const targetLevel = parseInt(input.value, 10);
      if (!Number.isInteger(targetLevel) || targetLevel <= skill.currentLevel) {
        setSkillUpgradeStatus(skill.submitName, `Choose a level above ${skill.currentLevel}.`);
        return;
      }

      const state = { submitName: skill.submitName, targetLevel };
      saveSkillUpgradeState(state);
      submitNextSkillUpgrade(state);
    });

    return controls;
  }

  async function injectSkillTargetUpgrades(config) {
    if (!isTrainingPage() || !config.enableSkillTargetUpgrades) return;

    await waitForBody();
    await waitForElement('form[action="train2.php"] input[name="antispyupgrade"]');
    ensureSkillUpgradeStyles();

    const skills = [
      { submitName: 'spyupgrade' },
      { submitName: 'antispyupgrade' }
    ];

    skills.forEach((skill) => {
      const row = findSkillRow(skill.submitName);
      const currentLevel = parseSkillLevel(row);
      const levelCell = row?.querySelector('td:nth-child(2)');
      if (!levelCell || currentLevel === null || levelCell.querySelector('.bfh-skill-target-controls')) return;

      levelCell.appendChild(buildSkillTargetControls({ ...skill, currentLevel }));
    });

    const activeState = readSkillUpgradeState();
    if (activeState) {
      submitNextSkillUpgrade(activeState);
    }
  }

  function ensureInlineStyles() {
    if (document.getElementById(INLINE_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = INLINE_STYLE_ID;
    style.textContent = `
      #${INLINE_FILTERS_ID} {
        display: block;
        width: 100%;
        margin: 10px 0;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        background: rgba(12, 16, 22, 0.82);
        color: #f3f5f8;
        font-size: 12px;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-label {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-input {
        width: 112px;
        padding: 4px 6px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
      }
      #${INLINE_FILTERS_ID} .bfh-inline-summary {
        margin-left: auto;
        color: #c8d3df;
        white-space: nowrap;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function getInlineFiltersContainer() {
    return document.getElementById(INLINE_FILTERS_ID);
  }

  function findInlineInsertionParent() {
    const parentXPath = '/html/body/div/div/main/div[1]/div/form/div';
    return document.evaluate(
      parentXPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  }

  function buildInlineFiltersUI() {
    const wrapper = document.createElement('div');
    wrapper.id = INLINE_FILTERS_ID;
    wrapper.innerHTML = `
      <div class="bfh-inline-row">
        <strong>Filters:</strong>
        <label class="bfh-inline-label">
          <input type="checkbox" id="bfh-hideInactive">
          Hide inactive
        </label>
        <label class="bfh-inline-label">
          <input type="checkbox" id="bfh-enableTreasury">
          Treasury &gt;=
        </label>
        <input type="number" id="bfh-threshold" class="bfh-inline-input" min="0" step="100000" placeholder="0">
        <label class="bfh-inline-label">
          <input type="checkbox" id="bfh-enableArmy">
          Army &gt;=
        </label>
        <input type="number" id="bfh-armySizeThreshold" class="bfh-inline-input" min="0" step="100000" placeholder="0">
        <label class="bfh-inline-label">
          <input type="checkbox" id="bfh-hideNoAttackAction">
          Hide no-attack
        </label>
        <span class="bfh-inline-summary" id="bfh-inline-summary"></span>
      </div>
    `;
    return wrapper;
  }

  function updateInlineInputStates(container) {
    container.querySelector('#bfh-threshold').disabled =
      !container.querySelector('#bfh-enableTreasury').checked;
    container.querySelector('#bfh-armySizeThreshold').disabled =
      !container.querySelector('#bfh-enableArmy').checked;
  }

  function updateInlineFiltersUI(config) {
    const container = getInlineFiltersContainer();
    if (!container) return;

    container.querySelector('#bfh-hideInactive').checked = config.hideInactive;
    container.querySelector('#bfh-enableTreasury').checked = config.enableTreasuryFilter;
    container.querySelector('#bfh-threshold').value = config.threshold;
    container.querySelector('#bfh-enableArmy').checked = config.enableArmySizeFilter;
    container.querySelector('#bfh-armySizeThreshold').value = config.armySizeThreshold;
    container.querySelector('#bfh-hideNoAttackAction').checked = config.hideNoAttackAction;
    updateInlineInputStates(container);
  }

  function readInlineFiltersConfig(container) {
    return {
      hideInactive: container.querySelector('#bfh-hideInactive').checked,
      enableTreasuryFilter: container.querySelector('#bfh-enableTreasury').checked,
      threshold: parseInt(container.querySelector('#bfh-threshold').value, 10) || 0,
      enableArmySizeFilter: container.querySelector('#bfh-enableArmy').checked,
      armySizeThreshold: parseInt(container.querySelector('#bfh-armySizeThreshold').value, 10) || 0,
      hideNoAttackAction: container.querySelector('#bfh-hideNoAttackAction').checked
    };
  }

  function parseReversedValue(text) {
    return parseInt(String(text).replace(/,/g, '').split('').reverse().join(''), 10);
  }

  function getFirstTd(row) {
    return row.querySelector('td#name_titles') || row.querySelector('td:nth-child(1)');
  }

  function isValidPlayerRow(row) {
    return Boolean(row.querySelector('#actions') && row.querySelector('td:nth-child(6) button x'));
  }

  function hasAttackAction(row) {
    const actions = row.querySelector('#actions');
    return Boolean(actions && actions.querySelector('form[action="attack2.php"]'));
  }

  function failsThreshold(row, cellIndex, threshold) {
    const valueNode = row.querySelector(`td:nth-child(${cellIndex}) button x`);
    if (!valueNode) return false;

    const rawText = valueNode.textContent.trim();
    if (/^\?+$/.test(rawText)) return true;

    const numericValue = parseReversedValue(rawText);
    return !Number.isNaN(numericValue) && numericValue < threshold;
  }

  function updateSummary(text) {
    const summary = document.getElementById('bfh-inline-summary');
    if (summary) {
      summary.textContent = text;
    }
  }

  function isRelevantMutationNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.closest(`#${INLINE_FILTERS_ID}`)) return false;

    return (
      node.matches(ROW_SELECTOR) ||
      node.matches('main') ||
      node.matches('main table') ||
      node.matches('main table tbody') ||
      node.matches(PAGINATION_SELECTOR) ||
      Boolean(node.querySelector(ROW_SELECTOR)) ||
      Boolean(node.querySelector('main table tbody')) ||
      Boolean(node.querySelector(PAGINATION_SELECTOR))
    );
  }

  function shouldRefilter(mutations) {
    return mutations.some((mutation) => {
      if (isRelevantMutationNode(mutation.target)) {
        return true;
      }

      return (
        Array.from(mutation.addedNodes).some(isRelevantMutationNode) ||
        Array.from(mutation.removedNodes).some(isRelevantMutationNode)
      );
    });
  }

  function recordFilterPass() {
    const now = Date.now();
    filterPassTimestamps.push(now);
    filterPassTimestamps = filterPassTimestamps.filter(
      (timestamp) => now - timestamp <= FILTER_STORM_WINDOW_MS
    );

    if (
      filterPassTimestamps.length >= FILTER_STORM_THRESHOLD &&
      now - lastStormWarningAt >= FILTER_STORM_WARN_COOLDOWN_MS
    ) {
      lastStormWarningAt = now;
      console.warn(
        `[Battlefield Filter] High refilter rate detected: ${filterPassTimestamps.length} passes in ` +
        `${Math.round(FILTER_STORM_WINDOW_MS / 1000)}s.`
      );
    }
  }

  function clearPendingState() {
    if (document.documentElement.classList.contains(PENDING_CLASS)) {
      document.documentElement.classList.remove(PENDING_CLASS);
      pendingStyle.remove();
    }
  }

  function filterRows(config) {
    if (!isBattlefieldPage()) {
      clearPendingState();
      return;
    }

    const rows = document.querySelectorAll(ROW_SELECTOR);
    let totalPlayers = 0;
    let visiblePlayers = 0;

    rows.forEach((row) => {
      if (!isValidPlayerRow(row)) {
        return;
      }

      totalPlayers += 1;
      row.style.display = '';

      let shouldHide = false;

      if (config.hideInactive) {
        const firstTd = getFirstTd(row);
        const actions = row.querySelector('#actions');
        if (!firstTd?.querySelector('a') || actions?.children.length === 0) {
          shouldHide = true;
        }
      }

      if (!shouldHide && config.enableTreasuryFilter && failsThreshold(row, 6, config.threshold)) {
        shouldHide = true;
      }

      if (!shouldHide && config.enableArmySizeFilter && failsThreshold(row, 4, config.armySizeThreshold)) {
        shouldHide = true;
      }

      if (!shouldHide && config.hideNoAttackAction && !hasAttackAction(row)) {
        shouldHide = true;
      }

      if (shouldHide) {
        row.style.display = 'none';
      } else {
        visiblePlayers += 1;
      }
    });

    clearPendingState();
    updateSummary(`${visiblePlayers}/${totalPlayers} visible`);

    const nextSummary = `${visiblePlayers}/${totalPlayers} visible`;
    if (nextSummary !== lastFilterSummary) {
      lastFilterSummary = nextSummary;
      console.log(`[Battlefield Filter] ${nextSummary}.`);
    }
  }

  async function saveInlineFilters(container) {
    config = await saveConfig({
      ...config,
      ...readInlineFiltersConfig(container)
    });
    updateInlineFiltersUI(config);
    filterRows(config);
  }

  function setupInlineFilterHandlers(container) {
    const ids = [
      'bfh-hideInactive',
      'bfh-enableTreasury',
      'bfh-threshold',
      'bfh-enableArmy',
      'bfh-armySizeThreshold',
      'bfh-hideNoAttackAction'
    ];

    ids.forEach((id) => {
      const input = container.querySelector(`#${id}`);
      input.addEventListener('change', () => {
        updateInlineInputStates(container);
        saveInlineFilters(container);
      });
    });

    ['bfh-threshold', 'bfh-armySizeThreshold'].forEach((id) => {
      container.querySelector(`#${id}`).addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveInlineFilters(container);
        }
      });
    });
  }

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

  async function waitForElement(selector, timeoutMs = 1500) {
    const existing = document.querySelector(selector);
    if (existing) return existing;

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          window.clearTimeout(timeoutId);
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function injectInlineFilters() {
    if (!isBattlefieldPage()) {
      clearPendingState();
      return;
    }

    await waitForBody();
    ensureInlineStyles();

    const pagination = await waitForElement(PAGINATION_SELECTOR);
    if (getInlineFiltersContainer()) {
      return;
    }

    const container = buildInlineFiltersUI();
    const insertionParent = findInlineInsertionParent();
    const nav = pagination?.closest('nav');

    if (insertionParent) {
      insertionParent.insertAdjacentElement('afterend', container);
    } else if (nav?.parentElement) {
      nav.insertAdjacentElement('afterend', container);
    } else if (pagination) {
      pagination.insertAdjacentElement('afterend', container);
    } else {
      document.querySelector('main')?.prepend(container);
    }

    updateInlineFiltersUI(config);
    setupInlineFilterHandlers(container);
  }

  let config = await getConfig();
  let filterScheduled = false;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[CONFIG_KEY]) {
      config = normalizeConfig(changes[CONFIG_KEY].newValue || {});
      applySiteLayoutStabilization(config);
      applyGameTimePanelTransparency(config);
      injectSkillTargetUpgrades(config);
      updateInlineFiltersUI(config);
      filterRows(config);
    }
  });

  await injectInlineFilters();
  await injectSkillTargetUpgrades(config);
  applySiteLayoutStabilization(config);
  applyGameTimePanelTransparency(config);
  filterRows(config);

  const observer = new MutationObserver((mutations) => {
    if (filterScheduled) return;
    if (!shouldRefilter(mutations)) return;

    filterScheduled = true;
    requestAnimationFrame(() => {
      filterScheduled = false;
      recordFilterPass();
      filterRows(config);
    });
  });

  await waitForBody();
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
