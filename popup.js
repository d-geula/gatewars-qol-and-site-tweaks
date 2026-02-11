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
  tweakSidebarListGroup: true,
  tweakClockTransparency: true,
  tweakGnrCountdown: true
};

async function loadSettings() {
  const result = await browser.storage.local.get('config');
  const config = { ...DEFAULT_CONFIG, ...result.config };

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
}

async function saveSettings(showMessage = true) {
  const blacklistText = document.getElementById('allianceBlacklist').value.trim();
  const result = await browser.storage.local.get('config');
  const config = {
    ...DEFAULT_CONFIG,
    ...result.config,
    hideInactive: document.getElementById('hideInactive').checked,
    allianceBlacklist: blacklistText ? blacklistText.split('\n').map(s => s.trim()).filter(Boolean) : [],
    enableRefererOverride: document.getElementById('enableRefererOverride').checked,
    refererOverrideUrl: document.getElementById('refererOverrideUrl').value.trim(),
    scannerSoundEnabled: document.getElementById('scannerSoundEnabled').checked,
    scannerSoundVolume: Math.min(
      100,
      Math.max(0, parseInt(document.getElementById('scannerSoundVolume').value, 10) || 0)
    ),
    tweakSidebarListGroup: document.getElementById('tweakSidebarListGroup').checked,
    tweakClockTransparency: document.getElementById('tweakClockTransparency').checked,
    tweakGnrCountdown: document.getElementById('tweakGnrCountdown').checked
  };

  await browser.storage.local.set({ config });
  await applyFiltersToPage(config);

  if (showMessage) {
    const msg = document.getElementById('savedSettingsMsg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 1500);
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

// Auto-apply settings on checkbox changes
document.getElementById('hideInactive').addEventListener('change', () => saveSettings(false));
document.getElementById('enableRefererOverride').addEventListener('change', () => saveSettings(false));
document.getElementById('scannerSoundEnabled').addEventListener('change', () => saveSettings(false));
document.getElementById('tweakSidebarListGroup').addEventListener('change', () => saveSettings(false));
document.getElementById('tweakClockTransparency').addEventListener('change', () => saveSettings(false));
document.getElementById('tweakGnrCountdown').addEventListener('change', () => saveSettings(false));

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

setupNumberInputAutoApply('scannerSoundVolume');

// Auto-apply referer URL on Enter key
document.getElementById('refererOverrideUrl').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveSettings(false);
  }
});

document.getElementById('allianceBlacklist').addEventListener('change', () => saveSettings(false));
document.getElementById('saveSettings').addEventListener('click', () => saveSettings(true));
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
