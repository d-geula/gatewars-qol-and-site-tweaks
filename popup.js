const DEFAULT_CONFIG = {
  threshold: 500000,
  armySizeThreshold: 0,
  hideInactive: true,
  enableTreasuryFilter: true,
  enableArmySizeFilter: false,
  enableAllianceFilter: false,
  allianceBlacklist: []
};
  
  async function loadSettings() {
    const result = await browser.storage.local.get('config');
    const config = { ...DEFAULT_CONFIG, ...result.config };
  
    document.getElementById('threshold').value = config.threshold;
    document.getElementById('armySizeThreshold').value = config.armySizeThreshold;
    document.getElementById('hideInactive').checked = config.hideInactive;
    document.getElementById('enableTreasuryFilter').checked = config.enableTreasuryFilter;
    document.getElementById('enableArmySizeFilter').checked = config.enableArmySizeFilter;
    document.getElementById('enableAllianceFilter').checked = config.enableAllianceFilter;
    document.getElementById('allianceBlacklist').value = (config.allianceBlacklist || []).join('\n');
  }
  
  async function saveSettings() {
    const allianceBlacklistText = document.getElementById('allianceBlacklist').value.trim();
    const allianceBlacklist = allianceBlacklistText
      ? allianceBlacklistText.split('\n').map(line => line.trim()).filter(line => line.length > 0)
      : [];
    
    const config = {
      threshold: parseInt(document.getElementById('threshold').value, 10) || 0,
      armySizeThreshold: parseInt(document.getElementById('armySizeThreshold').value, 10) || 0,
      hideInactive: document.getElementById('hideInactive').checked,
      enableTreasuryFilter: document.getElementById('enableTreasuryFilter').checked,
      enableArmySizeFilter: document.getElementById('enableArmySizeFilter').checked,
      enableAllianceFilter: document.getElementById('enableAllianceFilter').checked,
      allianceBlacklist: allianceBlacklist
    };
  
    await browser.storage.local.set({ config });
  
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => {
      msg.style.display = 'none';
    }, 1500);
  }
  
  document.getElementById('save').addEventListener('click', saveSettings);
  loadSettings();