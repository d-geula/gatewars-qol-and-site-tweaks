const DEFAULT_CONFIG = {
    threshold: 500000,
    armySizeThreshold: 0,
    hideInactive: true,
    enableTreasuryFilter: true,
    enableArmySizeFilter: false
  };
  
  async function loadSettings() {
    const result = await browser.storage.local.get('config');
    const config = { ...DEFAULT_CONFIG, ...result.config };
  
    document.getElementById('threshold').value = config.threshold;
    document.getElementById('armySizeThreshold').value = config.armySizeThreshold;
    document.getElementById('hideInactive').checked = config.hideInactive;
    document.getElementById('enableTreasuryFilter').checked = config.enableTreasuryFilter;
    document.getElementById('enableArmySizeFilter').checked = config.enableArmySizeFilter;
  }
  
  async function saveSettings() {
    const config = {
      threshold: parseInt(document.getElementById('threshold').value, 10) || 0,
      armySizeThreshold: parseInt(document.getElementById('armySizeThreshold').value, 10) || 0,
      hideInactive: document.getElementById('hideInactive').checked,
      enableTreasuryFilter: document.getElementById('enableTreasuryFilter').checked,
      enableArmySizeFilter: document.getElementById('enableArmySizeFilter').checked
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