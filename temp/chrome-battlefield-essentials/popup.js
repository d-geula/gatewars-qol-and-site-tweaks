const DEFAULT_CONFIG = {
  hideInactive: true,
  enableTreasuryFilter: false,
  threshold: 0,
  enableArmySizeFilter: false,
  armySizeThreshold: 0,
  hideNoAttackAction: false,
  stabilizeSiteLayout: true,
  transparentGameTimePanel: true,
  enableRefererOverride: true,
  refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars'
};

const CONFIG_KEY = 'config';

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
    enableRefererOverride: Boolean(rawConfig.enableRefererOverride ?? DEFAULT_CONFIG.enableRefererOverride),
    refererOverrideUrl: String(rawConfig.refererOverrideUrl ?? DEFAULT_CONFIG.refererOverrideUrl).trim() ||
      DEFAULT_CONFIG.refererOverrideUrl
  };
}

async function getConfig() {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return normalizeConfig(result?.[CONFIG_KEY]);
}

async function saveConfig(nextConfig) {
  const normalizedConfig = normalizeConfig(nextConfig);
  await chrome.storage.local.set({ [CONFIG_KEY]: normalizedConfig });
  return normalizedConfig;
}

function setStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  window.clearTimeout(setStatus.timeoutId);
  setStatus.timeoutId = window.setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

function readForm(config) {
  return {
    ...config,
    stabilizeSiteLayout: document.getElementById('stabilizeSiteLayout').checked,
    transparentGameTimePanel: document.getElementById('transparentGameTimePanel').checked,
    enableRefererOverride: document.getElementById('enableRefererOverride').checked,
    refererOverrideUrl: document.getElementById('refererOverrideUrl').value.trim()
  };
}

function writeForm(config) {
  document.getElementById('stabilizeSiteLayout').checked = config.stabilizeSiteLayout;
  document.getElementById('transparentGameTimePanel').checked = config.transparentGameTimePanel;
  document.getElementById('enableRefererOverride').checked = config.enableRefererOverride;
  document.getElementById('refererOverrideUrl').value = config.refererOverrideUrl;
}

async function initialize() {
  let config = await getConfig();
  writeForm(config);

  document.getElementById('stabilizeSiteLayout').addEventListener('change', async () => {
    config = await saveConfig(readForm(config));
    writeForm(config);
    setStatus('Saved');
  });

  document.getElementById('transparentGameTimePanel').addEventListener('change', async () => {
    config = await saveConfig(readForm(config));
    writeForm(config);
    setStatus('Saved');
  });

  document.getElementById('enableRefererOverride').addEventListener('change', async () => {
    config = await saveConfig(readForm(config));
    writeForm(config);
    setStatus('Saved');
  });

  document.getElementById('refererOverrideUrl').addEventListener('change', async () => {
    config = await saveConfig(readForm(config));
    writeForm(config);
    setStatus('Saved');
  });

  document.getElementById('refererOverrideUrl').addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    config = await saveConfig(readForm(config));
    writeForm(config);
    setStatus('Saved');
  });
}

initialize().catch((error) => {
  console.error('[Popup] Failed to initialize.', error);
  setStatus('Failed to load settings');
});
