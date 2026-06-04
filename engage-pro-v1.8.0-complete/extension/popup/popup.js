(function() {
  'use strict';

  const state = {
    isRunning: false,
    platform: 'linkedin',
    speedMode: 'medium',
    operationMode: 'engagement',
    targetFollows: 50,
    autoLike: true,
    autoReply: true,
    autoFollow: false,
    stats: { likes: 0, replies: 0, follows: 0 }
  };

  const els = {
    statusIndicator: document.getElementById('statusIndicator'),
    statusDot: document.querySelector('.status-dot'),
    statusText: document.querySelector('.status-text'),
    tabs: document.querySelectorAll('.tab'),
    speedMode: document.getElementById('speedMode'),
    operationMode: document.getElementById('operationMode'),
    followerControls: document.getElementById('followerControls'),
    engagementToggles: document.getElementById('engagementToggles'),
    targetFollows: document.getElementById('targetFollows'),
    autoLike: document.getElementById('autoLike'),
    autoReply: document.getElementById('autoReply'),
    autoFollow: document.getElementById('autoFollow'),
    likesCount: document.getElementById('likesCount'),
    repliesCount: document.getElementById('repliesCount'),
    followsCount: document.getElementById('followsCount'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    settingsBtn: document.getElementById('settingsBtn')
  };

  async function loadState() {
    const stored = await chrome.storage.local.get([
      'isRunning', 'platform', 'speedMode', 'operationMode', 'targetFollows',
      'autoLike', 'autoReply', 'autoFollow', 'stats'
    ]);
    Object.assign(state, stored);
    updateUI();
  }

  function updateUI() {
    els.tabs.forEach(t => {
      t.classList.toggle('active', t.dataset.platform === state.platform);
    });
    els.speedMode.value = state.speedMode;
    els.operationMode.value = state.operationMode || 'engagement';
    els.targetFollows.value = state.targetFollows || 50;
    
    // Show/hide follower controls based on operation mode
    if (state.operationMode === 'followers') {
      els.followerControls.classList.remove('hidden');
      els.engagementToggles.classList.add('hidden');
    } else {
      els.followerControls.classList.add('hidden');
      els.engagementToggles.classList.remove('hidden');
    }
    
    els.autoLike.checked = state.autoLike;
    els.autoReply.checked = state.autoReply;
    els.autoFollow.checked = state.autoFollow;
    els.likesCount.textContent = state.stats?.likes || 0;
    els.repliesCount.textContent = state.stats?.replies || 0;
    els.followsCount.textContent = state.stats?.follows || 0;
    
    if (state.isRunning) {
      els.startBtn.classList.add('hidden');
      els.stopBtn.classList.remove('hidden');
      els.statusDot.classList.add('active');
      els.statusText.textContent = 'Running';
    } else {
      els.startBtn.classList.remove('hidden');
      els.stopBtn.classList.add('hidden');
      els.statusDot.classList.remove('active');
      els.statusText.textContent = 'Ready';
    }
  }

  async function saveState() {
    await chrome.storage.local.set(state);
  }

  function sendMessage(type, data = {}) {
    return chrome.runtime.sendMessage({ type, ...data });
  }

  els.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      state.platform = tab.dataset.platform;
      saveState();
      updateUI();
    });
  });

  els.speedMode.addEventListener('change', (e) => {
    state.speedMode = e.target.value;
    saveState();
  });

  els.operationMode.addEventListener('change', (e) => {
    state.operationMode = e.target.value;
    saveState();
    updateUI();
  });

  els.targetFollows.addEventListener('input', (e) => {
    state.targetFollows = parseInt(e.target.value) || 50;
    saveState();
  });

  els.targetFollows.addEventListener('change', (e) => {
    state.targetFollows = parseInt(e.target.value) || 50;
    saveState();
  });

  [els.autoLike, els.autoReply, els.autoFollow].forEach(toggle => {
    toggle.addEventListener('change', () => {
      state.autoLike = els.autoLike.checked;
      state.autoReply = els.autoReply.checked;
      state.autoFollow = els.autoFollow.checked;
      saveState();
    });
  });

  els.startBtn.addEventListener('click', async () => {
    // Ensure targetFollows is saved before starting - read directly from DOM
    var targetValue = parseInt(els.targetFollows.value);
    if (isNaN(targetValue) || targetValue < 1) {
      targetValue = 50;
    }
    state.targetFollows = targetValue;
    
    console.log('[engage-pro popup] Starting with targetFollows:', state.targetFollows);
    
    state.isRunning = true;
    await saveState();
    updateUI();
    
    // Send different message based on operation mode
    if (state.operationMode === 'followers') {
      await sendMessage('FOLLOWER_MODE_START', {
        platform: state.platform,
        speedMode: state.speedMode,
        targetFollows: state.targetFollows
      });
    } else {
      await sendMessage('ENGAGEMENT_START', {
        platform: state.platform,
        speedMode: state.speedMode,
        autoLike: state.autoLike,
        autoReply: state.autoReply,
        autoFollow: state.autoFollow
      });
    }
  });

  els.stopBtn.addEventListener('click', async () => {
    state.isRunning = false;
    await saveState();
    updateUI();
    
    // Send different stop message based on operation mode
    if (state.operationMode === 'followers') {
      await sendMessage('FOLLOWER_MODE_STOP');
    } else {
      await sendMessage('ENGAGEMENT_STOP');
    }
  });

  els.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage?.() || chrome.tabs.create({
      url: chrome.runtime.getURL('sidepanel/sidepanel.html')
    });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.stats) {
      state.stats = changes.stats.newValue;
      updateUI();
    }
    if (changes.isRunning !== undefined) {
      state.isRunning = changes.isRunning.newValue;
      updateUI();
    }
  });

  loadState();
})();