const DEFAULT_CONFIG = {
  hideInactive: true,
  enableTreasuryFilter: false,
  threshold: 0,
  enableArmySizeFilter: false,
  armySizeThreshold: 0,
  hideNoAttackAction: false,
  enableRefererOverride: true,
  refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars'
};

const CONFIG_KEY = 'config';
const REFERER_RULE_ID = 1;
const REFERER_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'xmlhttprequest',
  'script',
  'image',
  'stylesheet',
  'font',
  'media',
  'object',
  'ping',
  'other'
];

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
    console.warn('[Referer Override] Falling back to defaults.', error);
    return normalizeConfig();
  }
}

function buildRefererRule(config) {
  return {
    id: REFERER_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'referer',
          operation: 'set',
          value: config.refererOverrideUrl
        }
      ]
    },
    condition: {
      urlFilter: '||main.gatewa.rs/',
      resourceTypes: REFERER_RESOURCE_TYPES
    }
  };
}

async function syncRefererRule() {
  const config = await getConfig();

  try {
    const addRules = [];
    if (config.enableRefererOverride && config.refererOverrideUrl) {
      addRules.push(buildRefererRule(config));
    }

    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [REFERER_RULE_ID],
      addRules
    });
  } catch (error) {
    console.error('[Referer Override] Failed to sync rule.', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  syncRefererRule();
});

chrome.runtime.onStartup.addListener(() => {
  syncRefererRule();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[CONFIG_KEY]) {
    syncRefererRule();
  }
});

syncRefererRule();
