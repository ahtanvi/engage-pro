(function() {
  'use strict';

  const state = {
    isRunning: false,
    activeTab: 'dashboard',
    stats: { likes: 0, replies: 0, follows: 0 },
    sessionStart: null,
    settings: {
      linkedInLike: true,
      linkedInReply: true,
      twitterLike: true,
      twitterReply: true,
      dailyLimit: 50,
      engagementDelay: 30
    }
  };

  const els = {
    navTabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    masterToggle: document.getElementById('masterToggle'),
    masterControl: document.getElementById('masterControl'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    totalLikes: document.getElementById('totalLikes'),
    totalReplies: document.getElementById('totalReplies'),
    totalFollows: document.getElementById('totalFollows'),
    sessionTime: document.getElementById('sessionTime'),
    currentTask: document.getElementById('currentTask'),
    currentTaskText: document.getElementById('currentTaskText'),
    closeBtn: document.getElementById('closeBtn')
  };

  async function loadState() {
    const stored = await chrome.storage.local.get([
      'isRunning', 'stats', 'sessionStart', 'settings', 'activeTab'
    ]);
    Object.assign(state, stored);
    updateUI();
    if (state.isRunning) startSessionTimer();
  }

  function updateUI() {
    els.navTabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === state.activeTab);
    });
    els.tabContents.forEach(c => {
      c.classList.toggle('active', c.id === state.activeTab + 'Tab');
    });

    els.masterToggle.classList.toggle('running', state.isRunning);
    els.masterControl.classList.toggle('running', state.isRunning);
    els.statusDot.classList.toggle('active', state.isRunning);
    els.statusText.textContent = state.isRunning ? 'Running' : 'Idle';
    els.statusText.classList.toggle('active', state.isRunning);

    els.totalLikes.textContent = state.stats?.likes || 0;
    els.totalReplies.textContent = state.stats?.replies || 0;
    els.totalFollows.textContent = state.stats?.follows || 0;

    updatePipeline();
  }

  function updatePipeline() {
    const steps = ['Scan', 'Analyze', 'Engage', 'Verify'];
    const icons = ['○', '○', '○', '○'];
    
    if (state.isRunning) {
      const activeStep = Math.floor(Date.now() / 3000) % 4;
      steps.forEach((step, i) => {
        const el = document.getElementById('step' + step);
        if (el) {
          el.classList.toggle('active', i === activeStep);
          el.classList.toggle('done', i < activeStep);
          el.textContent = i < activeStep ? '✓' : (i === activeStep ? '●' : '○');
        }
      });
    }
  }

  let timerInterval;
  function startSessionTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (state.sessionStart && state.isRunning) {
        const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        els.sessionTime.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }

  function stopSessionTimer() {
    if (timerInterval) clearInterval(timerInterval);
    els.sessionTime.textContent = '00:00';
  }

  async function saveState() {
    await chrome.storage.local.set(state);
  }

  els.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeTab = tab.dataset.tab;
      saveState();
      updateUI();
    });
  });

  els.masterToggle.addEventListener('click', async () => {
    state.isRunning = !state.isRunning;
    if (state.isRunning) {
      state.sessionStart = Date.now();
      startSessionTimer();
    } else {
      state.sessionStart = null;
      stopSessionTimer();
    }
    await saveState();
    updateUI();
    
    chrome.runtime.sendMessage({
      type: state.isRunning ? 'START_ENGAGEMENT' : 'STOP_ENGAGEMENT'
    });
  });

  els.closeBtn.addEventListener('click', () => {
    window.close();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.stats) {
      state.stats = changes.stats.newValue;
      updateUI();
    }
    if (changes.isRunning !== undefined) {
      state.isRunning = changes.isRunning.newValue;
      if (state.isRunning) startSessionTimer();
      else stopSessionTimer();
      updateUI();
    }
  });

  if (state.isRunning) startSessionTimer();
  loadState();
})();