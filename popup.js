const DEFAULT_CONFIG = {
  threshold: 650000000000,
  armySizeThreshold: 0,
  hideInactive: true,
  enableTreasuryFilter: false,
  enableArmySizeFilter: false,
  enableAllianceFilter: false,
  allianceBlacklist: [],
  hideNoAttackAction: true,
  enableRefererOverride: true,
  refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars',
  scannerSoundEnabled: true,
  scannerSoundVolume: 100,
  autoFillLoginEnabled: false,
  autoFillLoginUsername: '',
  autoFillLoginEmail: '',
  autoFillLoginPassword: '',
  tweakSidebarListGroup: true,
  tweakClockTransparency: true,
  tweakGnrCountdown: true,
  tweakMainTopOffset: false
};

const CONFIG_KEY = 'config';
const LAST_SAVED_AT_KEY = 'configLastSavedAt';
let inMemoryConfig = normalizeConfig();
let lastSavedConfigSerialized = JSON.stringify(inMemoryConfig);

function normalizeConfig(rawConfig = {}) {
  const parsedVolume = parseInt(rawConfig.scannerSoundVolume, 10);
  return {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    scannerSoundVolume: Math.min(
      100,
      Math.max(0, Number.isFinite(parsedVolume) ? parsedVolume : DEFAULT_CONFIG.scannerSoundVolume)
    ),
    allianceBlacklist: Array.isArray(rawConfig.allianceBlacklist)
      ? rawConfig.allianceBlacklist.map((s) => String(s).trim()).filter(Boolean)
      : [],
    autoFillLoginEnabled: Boolean(rawConfig.autoFillLoginEnabled),
    autoFillLoginUsername: String(rawConfig.autoFillLoginUsername ?? ''),
    autoFillLoginEmail: String(rawConfig.autoFillLoginEmail ?? ''),
    autoFillLoginPassword: String(rawConfig.autoFillLoginPassword ?? '')
  };
}

async function getStoredConfig() {
  const localResult = await browser.storage.local.get(CONFIG_KEY);
  if (localResult?.[CONFIG_KEY]) {
    return normalizeConfig(localResult[CONFIG_KEY]);
  }

  return normalizeConfig();
}

async function setStoredConfig(config) {
  const normalizedConfig = normalizeConfig(config);
  const lastSavedAt = Date.now();
  await browser.storage.local.set({ [CONFIG_KEY]: normalizedConfig });
  await browser.storage.local.set({ [LAST_SAVED_AT_KEY]: lastSavedAt });
  updateLastSavedLabel(lastSavedAt);
  return normalizedConfig;
}

function formatLastSavedTimestamp(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'never';
  }
  return new Date(timestamp).toLocaleString();
}

function updateLastSavedLabel(timestamp) {
  const label = document.getElementById('lastSavedAt');
  label.textContent = `Last saved: ${formatLastSavedTimestamp(timestamp)}`;
}

function showSavedMessage(text) {
  const msg = document.getElementById('savedSettingsMsg');
  msg.textContent = text;
  msg.style.display = 'block';
  setTimeout(() => {
    msg.style.display = 'none';
    msg.textContent = '✓ Settings applied!';
  }, 1800);
}

async function loadSettings() {
  const config = await getStoredConfig();
  const lastSavedResult = await browser.storage.local.get(LAST_SAVED_AT_KEY);
  updateLastSavedLabel(lastSavedResult?.[LAST_SAVED_AT_KEY]);
  inMemoryConfig = config;
  lastSavedConfigSerialized = JSON.stringify(config);

  document.getElementById('hideInactive').checked = config.hideInactive;
  document.getElementById('allianceBlacklist').value = (config.allianceBlacklist || []).join('\n');
  document.getElementById('enableRefererOverride').checked = config.enableRefererOverride ?? true;
  document.getElementById('refererOverrideUrl').value =
    config.refererOverrideUrl || DEFAULT_CONFIG.refererOverrideUrl;
  document.getElementById('scannerSoundEnabled').checked = config.scannerSoundEnabled ?? true;
  document.getElementById('scannerSoundVolume').value =
    Number.isFinite(config.scannerSoundVolume) ? config.scannerSoundVolume : DEFAULT_CONFIG.scannerSoundVolume;
  document.getElementById('tweakSidebarListGroup').checked = config.tweakSidebarListGroup ?? false;
  document.getElementById('tweakClockTransparency').checked = config.tweakClockTransparency ?? false;
  document.getElementById('tweakGnrCountdown').checked = config.tweakGnrCountdown ?? false;
  document.getElementById('tweakMainTopOffset').checked = config.tweakMainTopOffset ?? false;
  document.getElementById('autoFillLoginEnabled').checked = config.autoFillLoginEnabled ?? false;
  document.getElementById('autoFillLoginUsername').value = config.autoFillLoginUsername ?? '';
  document.getElementById('autoFillLoginEmail').value = config.autoFillLoginEmail ?? '';
  document.getElementById('autoFillLoginPassword').value = config.autoFillLoginPassword ?? '';
}

async function saveSettings(showMessage = true) {
  const blacklistText = document.getElementById('allianceBlacklist').value.trim();
  const config = {
    ...inMemoryConfig,
    hideInactive: document.getElementById('hideInactive').checked,
    allianceBlacklist: blacklistText ? blacklistText.split('\n').map((s) => s.trim()).filter(Boolean) : [],
    enableRefererOverride: document.getElementById('enableRefererOverride').checked,
    refererOverrideUrl: document.getElementById('refererOverrideUrl').value.trim(),
    scannerSoundEnabled: document.getElementById('scannerSoundEnabled').checked,
    scannerSoundVolume: Math.min(
      100,
      Math.max(0, parseInt(document.getElementById('scannerSoundVolume').value, 10) || 0)
    ),
    tweakSidebarListGroup: document.getElementById('tweakSidebarListGroup').checked,
    tweakClockTransparency: document.getElementById('tweakClockTransparency').checked,
    tweakGnrCountdown: document.getElementById('tweakGnrCountdown').checked,
    tweakMainTopOffset: document.getElementById('tweakMainTopOffset').checked,
    autoFillLoginEnabled: document.getElementById('autoFillLoginEnabled').checked,
    autoFillLoginUsername: document.getElementById('autoFillLoginUsername').value,
    autoFillLoginEmail: document.getElementById('autoFillLoginEmail').value,
    autoFillLoginPassword: document.getElementById('autoFillLoginPassword').value
  };

  const normalizedConfig = normalizeConfig(config);
  const serialized = JSON.stringify(normalizedConfig);
  if (serialized === lastSavedConfigSerialized) {
    if (showMessage) {
      showSavedMessage('✓ Settings unchanged.');
    }
    return;
  }

  await setStoredConfig(normalizedConfig);
  inMemoryConfig = normalizedConfig;
  lastSavedConfigSerialized = serialized;
  await applyFiltersToPage(normalizedConfig);

  if (showMessage) {
    showSavedMessage('✓ Settings applied!');
  }
}

async function applyFiltersToPage(config) {
  const activeTab = await getActiveNormalTab();
  if (!activeTab?.id) return;

  try {
    await browser.tabs.sendMessage(activeTab.id, { action: 'applyFilters', config });
  } catch {
    // Content script may not be available on this tab.
  }
}

function setupCheckboxAutoApply(ids) {
  ids.forEach((id) => {
    document.getElementById(id).addEventListener('change', () => saveSettings(false));
  });
}

function setupTextInputAutoApply(ids) {
  ids.forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener('change', () => saveSettings(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveSettings(false);
      }
    });
  });
}

// Auto-apply filters on number input changes (numeric stepper) and Enter key
function setupNumberInputAutoApply(inputId) {
  const input = document.getElementById(inputId);
  input.addEventListener('change', () => saveSettings(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveSettings(false);
    }
  });
}

async function exportSettings() {
  const config = await getStoredConfig();
  const exportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    config
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'battlefield-highlighter-settings.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  showSavedMessage('✓ Settings exported.');
}

async function importSettingsFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const incomingConfig = parsed?.config ?? parsed;
  if (!incomingConfig || typeof incomingConfig !== 'object' || Array.isArray(incomingConfig)) {
    throw new Error('Invalid settings format.');
  }

  const existingConfig = await getStoredConfig();
  const mergedConfig = normalizeConfig({ ...existingConfig, ...incomingConfig });
  await setStoredConfig(mergedConfig);
  await loadSettings();
  await applyFiltersToPage(mergedConfig);
  showSavedMessage('✓ Settings imported.');
}

setupCheckboxAutoApply([
  'hideInactive',
  'enableRefererOverride',
  'scannerSoundEnabled',
  'autoFillLoginEnabled',
  'tweakSidebarListGroup',
  'tweakClockTransparency',
  'tweakGnrCountdown',
  'tweakMainTopOffset'
]);
setupNumberInputAutoApply('scannerSoundVolume');
setupTextInputAutoApply([
  'refererOverrideUrl',
  'autoFillLoginUsername',
  'autoFillLoginEmail',
  'autoFillLoginPassword'
]);

document.getElementById('allianceBlacklist').addEventListener('change', () => saveSettings(false));
document.getElementById('saveSettings').addEventListener('click', () => saveSettings(true));
document.getElementById('exportSettings').addEventListener('click', exportSettings);
document.getElementById('importSettings').addEventListener('click', () => {
  document.getElementById('importSettingsInput').click();
});
document.getElementById('importSettingsInput').addEventListener('change', async (event) => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await importSettingsFromFile(file);
  } catch {
    showSavedMessage('✗ Import failed. Invalid JSON.');
  } finally {
    input.value = '';
  }
});

loadSettings();

async function getActiveNormalTab() {
  try {
    const currentWindow = await browser.windows.getCurrent();
    const normalWindows = await browser.windows.getAll({ windowTypes: ['normal'] });
    const candidateWindows = normalWindows.filter(
      (win) => win.id != null && win.id !== currentWindow?.id
    );
    const focusedWindow = candidateWindows.find((win) => win.focused);
    const targetWindow = focusedWindow || candidateWindows[0];

    if (targetWindow?.id != null) {
      const tabs = await browser.tabs.query({ active: true, windowId: targetWindow.id });
      if (tabs.length > 0) {
        if (tabs[0].url && !tabs[0].url.startsWith('moz-extension://')) {
          return tabs[0];
        }
      }
    }
  } catch {
    // Fall through to fallback lookup.
  }

  // Fallback: any Battlefield tab in a normal window.
  const battlefieldTabs = await browser.tabs.query({
    url: ['*://*.gatewa.rs/battlefield.php*', '*://*.gatewa.rs/battlefieldE.php*'],
    windowType: 'normal'
  });
  return battlefieldTabs[0] || null;
}
