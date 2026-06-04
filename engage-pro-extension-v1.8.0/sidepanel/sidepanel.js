(function() {
  'use strict';

  const state = {
    isRunning: false,
    activeTab: 'dashboard',
    operationMode: 'engagement',
    targetFollows: 50,
    followerSpeed: 'medium',
    stats: { likes: 0, replies: 0, follows: 0 },
    sessionStart: null,
    isPaused: false,
    settings: {
      linkedInLike: true,
      linkedInReply: true,
      twitterLike: true,
      twitterReply: true,
      dailyLimit: 50,
      engagementDelay: 30
    },
    // AI Backend settings
    aiBackend: {
      enabled: false,
      url: 'http://localhost:3000',
      apiKey: '',
      model: 'gemini-1.5-flash'
    },
    // AI Preview
    aiPreview: {
      tweetText: '',
      generatedReply: '',
      isGenerating: false
    },
    // Advanced settings
    advanced: {
      debugMode: false,
      scrollSpeed: 800,
      maxScrollAttempts: 10,
      replyDelayMult: 1.5
    }
  };

  const els = {
    navTabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    masterToggle: document.getElementById('masterToggle'),
    masterControl: document.getElementById('masterControl'),
    pauseBtn: document.getElementById('pauseBtn'),
    skipBtn: document.getElementById('skipBtn'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    totalLikes: document.getElementById('totalLikes'),
    totalReplies: document.getElementById('totalReplies'),
    totalFollows: document.getElementById('totalFollows'),
    sessionTime: document.getElementById('sessionTime'),
    currentTask: document.getElementById('currentTask'),
    currentTaskText: document.getElementById('currentTaskText'),
    closeBtn: document.getElementById('closeBtn'),
    sidepanelOperationMode: document.getElementById('sidepanelOperationMode'),
    followerSettings: document.getElementById('followerSettings'),
    sidepanelTargetFollows: document.getElementById('sidepanelTargetFollows'),
    followerSpeed: document.getElementById('followerSpeed')
  };

  async function loadState() {
    const stored = await chrome.storage.local.get([
      'isRunning', 'stats', 'sessionStart', 'settings', 'activeTab',
      'operationMode', 'targetFollows', 'followerSpeed', 'aiBackend', 'aiPreview', 'advanced'
    ]);
    Object.assign(state, stored);
    
    // Sync advanced settings from content script if available
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_ADVANCED_SETTINGS' });
        if (response && response.success && response.advanced) {
          state.advanced = { ...state.advanced, ...response.advanced };
        }
        
        // Check version compatibility
        const versionResponse = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VERSION' });
        if (versionResponse && versionResponse.success) {
          console.log('[engage-pro] Content script version:', versionResponse.version);
          if (versionResponse.version !== '1.8.0') {
            showToast('Warning: Content script version mismatch. Please reload the page.');
          }
        }
      }
    } catch (e) {
      // Content script not loaded on this page, use stored settings
    }
    
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
    
    // Show/hide pause button
    if (els.pauseBtn) {
      els.pauseBtn.style.display = state.isRunning ? 'inline-flex' : 'none';
      els.pauseBtn.textContent = state.isPaused ? '▶' : '⏸';
      els.pauseBtn.title = state.isPaused ? 'Resume' : 'Pause';
    }
    
    // Show/hide skip button
    if (els.skipBtn) {
      els.skipBtn.style.display = state.isRunning ? 'inline-flex' : 'none';
    }

    els.totalLikes.textContent = state.stats?.likes || 0;
    els.totalReplies.textContent = state.stats?.replies || 0;
    els.totalFollows.textContent = state.stats?.follows || 0;

    // Update operation mode controls
    if (els.sidepanelOperationMode) {
      els.sidepanelOperationMode.value = state.operationMode || 'engagement';
    }
    if (els.followerSettings) {
      els.followerSettings.style.display = (state.operationMode === 'followers') ? 'block' : 'none';
    }
    if (els.sidepanelTargetFollows) {
      els.sidepanelTargetFollows.value = state.targetFollows || 50;
    }
    if (els.followerSpeed) {
      els.followerSpeed.value = state.followerSpeed || 'medium';
    }

    // Update current task text based on mode
    if (els.currentTaskText) {
      if (state.isRunning) {
        if (state.operationMode === 'followers') {
          els.currentTaskText.textContent = 'Following accounts from follower list...';
        } else {
          els.currentTaskText.textContent = 'Scanning feed for engagement targets...';
        }
        els.currentTask.classList.remove('hidden');
      } else {
        els.currentTask.classList.add('hidden');
      }
    }

    updatePipeline();

    // Update AI Backend settings UI
    updateAIBackendUI();
    updateAIPreviewUI();
    updateAdvancedUI();
  }

  function updateAIBackendUI() {
    const aiEnabled = document.getElementById('aiEnabled');
    const aiUrl = document.getElementById('aiUrl');
    const aiKey = document.getElementById('aiKey');
    const aiModel = document.getElementById('aiModel');
    const aiStatus = document.getElementById('aiStatus');

    if (aiEnabled) aiEnabled.checked = state.aiBackend?.enabled || false;
    if (aiUrl) aiUrl.value = state.aiBackend?.url || 'http://localhost:3000';
    if (aiKey) aiKey.value = state.aiBackend?.apiKey || '';
    if (aiModel) aiModel.value = state.aiBackend?.model || 'gemini-1.5-flash';
    
    if (aiStatus) {
      if (state.aiBackend?.enabled) {
        aiStatus.textContent = 'AI Backend Enabled';
        aiStatus.className = 'status-badge status-active';
      } else {
        aiStatus.textContent = 'AI Backend Disabled';
        aiStatus.className = 'status-badge status-inactive';
      }
    }
  }

  function updateAIPreviewUI() {
    const previewTweet = document.getElementById('previewTweet');
    const previewReply = document.getElementById('previewReply');
    const previewGenerateBtn = document.getElementById('previewGenerateBtn');
    const previewSpinner = document.getElementById('previewSpinner');

    if (previewTweet) previewTweet.value = state.aiPreview?.tweetText || '';
    if (previewReply) previewReply.value = state.aiPreview?.generatedReply || '';
    
    if (previewGenerateBtn && previewSpinner) {
      if (state.aiPreview?.isGenerating) {
        previewGenerateBtn.disabled = true;
        previewSpinner.style.display = 'inline-block';
      } else {
        previewGenerateBtn.disabled = false;
        previewSpinner.style.display = 'none';
      }
    }
  }

  function updateAdvancedUI() {
    const debugMode = document.getElementById('debugMode');
    const scrollSpeed = document.getElementById('scrollSpeed');
    const maxScrollAttempts = document.getElementById('maxScrollAttempts');
    const replyDelayMult = document.getElementById('replyDelayMult');

    if (debugMode) debugMode.checked = state.advanced?.debugMode || false;
    if (scrollSpeed) scrollSpeed.value = state.advanced?.scrollSpeed || 800;
    if (maxScrollAttempts) maxScrollAttempts.value = state.advanced?.maxScrollAttempts || 10;
    if (replyDelayMult) replyDelayMult.value = state.advanced?.replyDelayMult || 1.5;
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

  async function refreshFeed() {
    const feedList = document.getElementById('feedList');
    if (!feedList) return;
    
    feedList.innerHTML = '<div class="empty-state"><div class="empty-state-desc">Loading tweets...</div></div>';
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        feedList.innerHTML = '<div class="empty-state"><div class="empty-state-desc">No active tab found</div></div>';
        return;
      }
      
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_ALL_TWEETS' });
      if (response && response.tweets && response.tweets.length > 0) {
        feedList.innerHTML = response.tweets.slice(0, 10).map((t, idx) => `
          <div class="setting-row" style="flex-direction: column; align-items: stretch; padding: 0.75rem; border-bottom: 1px solid #334155;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
              <div style="font-size: 0.8rem; color: #94a3b8;">@${escapeHtml(t.authorHandle)} ${t.engaged ? '✓ Engaged' : ''}</div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn-xs btn-ghost" onclick="likeTweet('${escapeHtml(t.text.replace(/'/g, "\'"))}')" ${t.engaged ? 'disabled' : ''}>Like</button>
                <button class="btn-xs btn-ghost" onclick="replyToTweet('${escapeHtml(t.text.replace(/'/g, "\'"))}')" ${t.engaged ? 'disabled' : ''}>Reply</button>
              </div>
            </div>
            <div style="font-size: 0.875rem; color: #e2e8f0;">${escapeHtml(t.text.substring(0, 120))}${t.text.length > 120 ? '...' : ''}</div>
          </div>
        `).join('');
      } else {
        feedList.innerHTML = '<div class="empty-state"><div class="empty-state-desc">No tweets found on current page</div></div>';
      }
    } catch (e) {
      feedList.innerHTML = '<div class="empty-state"><div class="empty-state-desc">Unable to load tweets. Make sure you are on Twitter/X.</div></div>';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function likeTweet(tweetText) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'LIKE_TWEET',
          tweetText: tweetText
        });
        if (response && response.success) {
          showToast('Tweet liked!');
          refreshFeed();
        } else {
          showToast('Failed: ' + (response?.error || 'Unknown error'));
        }
      }
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  }

  async function replyToTweet(tweetText) {
    // Populate the quick reply fields
    const quickTweetText = document.getElementById('quickTweetText');
    if (quickTweetText) {
      quickTweetText.value = tweetText;
    }
    // Switch to AI tab
    state.activeTab = 'ai';
    await saveState();
    updateUI();
    showToast('Tweet text copied to Quick Reply');
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

  // Operation mode change handler
  if (els.sidepanelOperationMode) {
    els.sidepanelOperationMode.addEventListener('change', (e) => {
      state.operationMode = e.target.value;
      saveState();
      updateUI();
    });
  }

  // Target follows change handler
  if (els.sidepanelTargetFollows) {
    els.sidepanelTargetFollows.addEventListener('input', (e) => {
      state.targetFollows = parseInt(e.target.value) || 50;
      saveState();
    });
    els.sidepanelTargetFollows.addEventListener('change', (e) => {
      state.targetFollows = parseInt(e.target.value) || 50;
      saveState();
    });
  }

  // Follower speed change handler
  if (els.followerSpeed) {
    els.followerSpeed.addEventListener('change', (e) => {
      state.followerSpeed = e.target.value;
      saveState();
    });
  }

  els.masterToggle.addEventListener('click', async () => {
    state.isRunning = !state.isRunning;
    
    // Ensure targetFollows is saved before starting
    if (state.isRunning && state.operationMode === 'followers' && els.sidepanelTargetFollows) {
      state.targetFollows = parseInt(els.sidepanelTargetFollows.value) || 50;
    }
    
    if (state.isRunning) {
      state.sessionStart = Date.now();
      startSessionTimer();
    } else {
      state.sessionStart = null;
      stopSessionTimer();
    }
    await saveState();
    updateUI();
    
    // Send appropriate message based on operation mode
    if (state.operationMode === 'followers') {
      chrome.runtime.sendMessage({
        type: state.isRunning ? 'FOLLOWER_MODE_START' : 'FOLLOWER_MODE_STOP',
        config: {
          targetFollows: state.targetFollows,
          speedMode: state.followerSpeed || 'medium'
        }
      });
    } else {
      // Include AI backend config in engagement start
      var engagementConfig = {
        autoLike: true,
        autoReply: true,
        autoFollow: false,
        speedMode: state.followerSpeed || 'medium',
        dailyLimit: state.settings?.dailyLimit || 50
      };
      
      // Add AI backend config if enabled
      if (state.aiBackend?.enabled) {
        engagementConfig.aiBackendUrl = state.aiBackend.url;
        engagementConfig.aiApiKey = state.aiBackend.apiKey;
        engagementConfig.aiEnabled = true;
      }
      
      chrome.runtime.sendMessage({
        type: state.isRunning ? 'START_ENGAGEMENT' : 'STOP_ENGAGEMENT',
        config: engagementConfig
      });
    }
  });

  els.closeBtn.addEventListener('click', () => {
    window.close();
  });

  // AI Backend settings handlers
  document.addEventListener('DOMContentLoaded', () => {
    const refreshFeedBtn = document.getElementById('refreshFeed');
    if (refreshFeedBtn) {
      refreshFeedBtn.addEventListener('click', refreshFeed);
    }
    
    const aiEnabled = document.getElementById('aiEnabled');
    const aiUrl = document.getElementById('aiUrl');
    const aiKey = document.getElementById('aiKey');
    const aiModel = document.getElementById('aiModel');
    const saveAIBtn = document.getElementById('saveAIBackend');
    const testAIBtn = document.getElementById('testAIBackend');

    if (saveAIBtn) {
      saveAIBtn.addEventListener('click', async () => {
        state.aiBackend = {
          enabled: aiEnabled?.checked || false,
          url: aiUrl?.value?.trim() || 'http://localhost:3000',
          apiKey: aiKey?.value?.trim() || '',
          model: aiModel?.value || 'gemini-1.5-flash'
        };
        await saveState();
        updateUI();
        showToast('AI Backend settings saved');
      });
    }

    if (testAIBtn) {
      testAIBtn.addEventListener('click', async () => {
        const url = aiUrl?.value?.trim() || 'http://localhost:3000';
        const key = aiKey?.value?.trim() || '';
        
        if (!key) {
          showToast('Please enter your API key first');
          return;
        }
        
        try {
          // Step 1: Test health endpoint (no auth needed)
          const healthRes = await fetch(`${url}/health`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          }).catch(() => null);
          
          if (!healthRes || !healthRes.ok) {
            showToast('Cannot connect to backend. Is it running?');
            return;
          }
          
          // Step 2: Test with auth - call a protected endpoint to verify key works
          const res = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': key
            },
            body: JSON.stringify({
              tweetText: 'Test connection',
              tweetAuthor: 'test',
              useCache: false
            })
          });
          
          if (res.status === 401) {
            showToast('API key is invalid or expired');
            return;
          }
          
          if (res.ok) {
            const data = await res.json();
            if (data.reply) {
              showToast('Backend + API key working! Reply generated.');
            } else if (data.error) {
              showToast(`Connected but AI error: ${data.error}`);
            } else {
              showToast('Backend connection successful!');
            }
          } else {
            const data = await res.json().catch(() => ({}));
            showToast(`Backend error: ${data.error || res.statusText}`);
          }
        } catch (err) {
          showToast('Cannot connect to backend. Is it running?');
        }
      });
    }

    // AI Preview handlers
    const previewTweet = document.getElementById('previewTweet');
    const previewGenerateBtn = document.getElementById('previewGenerateBtn');
    const previewUseBtn = document.getElementById('previewUseBtn');

    if (previewGenerateBtn) {
      previewGenerateBtn.addEventListener('click', async () => {
        const tweetText = previewTweet?.value?.trim();
        if (!tweetText) {
          showToast('Enter a tweet text to generate a reply');
          return;
        }

        // Read fresh values from DOM in case user changed them without saving
        const aiEnabled = document.getElementById('aiEnabled');
        const aiUrl = document.getElementById('aiUrl');
        const aiKey = document.getElementById('aiKey');
        
        const backendEnabled = state.aiBackend?.enabled || aiEnabled?.checked || false;
        const backendUrl = state.aiBackend?.url || aiUrl?.value?.trim() || 'http://localhost:3000';
        const backendKey = state.aiBackend?.apiKey || aiKey?.value?.trim() || '';
        
        if (!backendEnabled) {
          showToast('Enable AI Backend toggle first, then click Save Settings');
          return;
        }
        
        if (!backendKey) {
          showToast('Enter your API key first, then click Save Settings');
          return;
        }

        state.aiPreview.isGenerating = true;
        state.aiPreview.tweetText = tweetText;
        await saveState();
        updateUI();

        try {
          const res = await fetch(`${backendUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': backendKey
            },
            body: JSON.stringify({
              tweetText: tweetText,
              tweetAuthor: 'preview_user',
              useCache: true
            })
          });

          const data = await res.json();
          if (data.reply) {
            state.aiPreview.generatedReply = data.reply;
            showToast('Reply generated!');
          } else {
            showToast(data.error || 'Failed to generate reply');
          }
        } catch (err) {
          showToast('Error: ' + err.message);
        } finally {
          state.aiPreview.isGenerating = false;
          await saveState();
          updateUI();
        }
      });
    }

    if (previewUseBtn) {
      previewUseBtn.addEventListener('click', () => {
        const reply = state.aiPreview?.generatedReply;
        if (!reply) {
          showToast('Generate a reply first');
          return;
        }
        
        // Send to content script to use this reply
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'EXECUTE_TASK',
              replyText: reply
            });
          }
        });
        showToast('Reply sent to current tab');
      });
    }

    // Quick Reply handler
    const quickReplyBtn = document.getElementById('quickReplyBtn');
    if (quickReplyBtn) {
      quickReplyBtn.addEventListener('click', () => {
        const tweetText = document.getElementById('quickTweetText')?.value?.trim();
        const replyText = document.getElementById('quickReplyText')?.value?.trim();
        
        if (!tweetText || !replyText) {
          showToast('Enter both tweet text and your reply');
          return;
        }
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'TWEET_REPLY',
              tweetText: tweetText,
              replyText: replyText
            }, (response) => {
              if (response && response.success) {
                showToast('Reply posted successfully!');
              } else {
                showToast('Failed: ' + (response?.error || 'Unknown error'));
              }
            });
          }
        });
      });
    }

    // Daily limit update handler
    const updateLimitBtn = document.getElementById('updateLimitBtn');
    if (updateLimitBtn) {
      updateLimitBtn.addEventListener('click', async () => {
        const dailyLimit = document.getElementById('dailyLimit');
        if (dailyLimit) {
          const limit = parseInt(dailyLimit.value) || 50;
          state.settings = state.settings || {};
          state.settings.dailyLimit = limit;
          await saveState();
          
          // Send to content script
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'SET_DAILY_LIMIT',
                dailyLimit: limit
              });
            }
          });
          showToast('Daily limit updated to ' + limit);
        }
      });
    }

    // Advanced settings handlers
    const debugMode = document.getElementById('debugMode');
    const scrollSpeed = document.getElementById('scrollSpeed');
    const maxScrollAttempts = document.getElementById('maxScrollAttempts');
    const replyDelayMult = document.getElementById('replyDelayMult');
    const resetStatsBtn = document.getElementById('resetStats');
    const clearCacheBtn = document.getElementById('clearCache');

    if (debugMode) {
      debugMode.addEventListener('change', async () => {
        state.advanced = state.advanced || {};
        state.advanced.debugMode = debugMode.checked;
        await saveState();
        // Send to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'SET_CONFIG',
              config: { debugMode: debugMode.checked }
            });
          }
        });
        showToast('Debug mode ' + (debugMode.checked ? 'enabled' : 'disabled'));
      });
    }

    if (scrollSpeed) {
      scrollSpeed.addEventListener('change', async () => {
        state.advanced = state.advanced || {};
        state.advanced.scrollSpeed = parseInt(scrollSpeed.value) || 800;
        await saveState();
        // Send to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'SET_CONFIG',
              config: { scrollSpeed: parseInt(scrollSpeed.value) || 800 }
            });
          }
        });
      });
    }

    if (maxScrollAttempts) {
      maxScrollAttempts.addEventListener('change', async () => {
        state.advanced = state.advanced || {};
        state.advanced.maxScrollAttempts = parseInt(maxScrollAttempts.value) || 10;
        await saveState();
        // Send to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'SET_CONFIG',
              config: { maxScrollAttempts: parseInt(maxScrollAttempts.value) || 10 }
            });
          }
        });
      });
    }

    if (replyDelayMult) {
      replyDelayMult.addEventListener('change', async () => {
        state.advanced = state.advanced || {};
        state.advanced.replyDelayMult = parseFloat(replyDelayMult.value) || 1.5;
        await saveState();
        // Send to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'SET_CONFIG',
              config: { replyDelayMult: parseFloat(replyDelayMult.value) || 1.5 }
            });
          }
        });
      });
    }

    if (resetStatsBtn) {
      resetStatsBtn.addEventListener('click', async () => {
        state.stats = { likes: 0, replies: 0, follows: 0 };
        state.sessionStart = null;
        await saveState();
        updateUI();
        showToast('Session stats reset');
      });
    }

    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        // Send message to content script to clear tweet cache
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_CACHE' });
          }
        });
        showToast('Tweet cache cleared');
      });
    }

    // Export stats handler
    const exportStatsBtn = document.getElementById('exportStats');
    if (exportStatsBtn) {
      exportStatsBtn.addEventListener('click', async () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'EXPORT_STATS' }, (response) => {
              if (response && response.success && response.data) {
                // Create and download JSON file
                const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `engage-pro-stats-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Stats exported to JSON');
              } else {
                showToast('Failed to export stats');
              }
            });
          }
        });
      });
    }

    // Import stats handler
    const importStatsBtn = document.getElementById('importStats');
    const importStatsFile = document.getElementById('importStatsFile');
    if (importStatsBtn && importStatsFile) {
      importStatsBtn.addEventListener('click', () => {
        importStatsFile.click();
      });
      
      importStatsFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: 'IMPORT_STATS',
                  data: data
                }, (response) => {
                  if (response && response.success) {
                    showToast('Stats imported successfully');
                  } else {
                    showToast('Import failed: ' + (response?.error || 'Unknown error'));
                  }
                });
              }
            });
          } catch (err) {
            showToast('Invalid JSON file');
          }
        };
        reader.readAsText(file);
        importStatsFile.value = ''; // Reset for re-import
      });
    }
  });

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

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