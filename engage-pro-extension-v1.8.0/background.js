chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRunning: false,
    platform: 'linkedin',
    speedMode: 'medium',
    operationMode: 'engagement',
    targetFollows: 50,
    autoLike: true,
    autoReply: false,
    autoFollow: false,
    stats: { likes: 0, replies: 0, follows: 0 },
    sessionStart: null,
    settings: {
      linkedInLike: true,
      linkedInReply: false,
      twitterLike: true,
      twitterReply: false,
      dailyLimit: 50,
      engagementDelay: 30
    },
    queue: [],
    history: []
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'START_ENGAGEMENT':
      handleStart(request);
      sendResponse({ success: true });
      break;
    case 'STOP_ENGAGEMENT':
      handleStop();
      sendResponse({ success: true });
      break;
    case 'FOLLOWER_MODE_START':
      handleFollowerStart(request);
      sendResponse({ success: true });
      break;
    case 'FOLLOWER_MODE_STOP':
      handleFollowerStop(request.reason);
      sendResponse({ success: true });
      break;
    case 'UPDATE_STATS':
      updateStats(request.data);
      sendResponse({ success: true });
      break;
    case 'GET_STATUS':
      sendResponse({ isRunning: false });
      break;
  }
  return true;
});

function handleStart(config) {
  // Include AI backend config in the start message
  chrome.storage.local.get(['aiBackend'], (result) => {
    var aiConfig = result.aiBackend || {};
    
    var fullConfig = {
      ...config,
      aiBackendUrl: aiConfig.url || '',
      aiApiKey: aiConfig.apiKey || '',
      aiEnabled: aiConfig.enabled || false
    };
    
    chrome.storage.local.set({
      isRunning: true,
      sessionStart: Date.now(),
      operationMode: 'engagement',
      ...fullConfig
    });
    
    chrome.alarms.create('engagementTick', { periodInMinutes: 0.5 });
    
    chrome.tabs.query({ url: ['*://*.linkedin.com/*', '*://*.x.com/*', '*://*.twitter.com/*'] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'ENGAGEMENT_START',
          config: fullConfig
        }).catch(() => {});
      });
    });
  });
}

function handleStop() {
  chrome.storage.local.set({ isRunning: false, sessionStart: null });
  chrome.alarms.clear('engagementTick');
  
  chrome.tabs.query({ url: ['*://*.linkedin.com/*', '*://*.x.com/*', '*://*.twitter.com/*'] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'ENGAGEMENT_STOP' }).catch(() => {});
    });
  });
}

function handleFollowerStart(config) {
  // Ensure targetFollows is properly set in config
  var targetFollows = config.targetFollows || config.config?.targetFollows || 50;
  
  console.log('[engage-pro] handleFollowerStart called with targetFollows:', targetFollows, 'full config:', JSON.stringify(config));
  
  chrome.storage.local.set({
    isRunning: true,
    sessionStart: Date.now(),
    operationMode: 'followers',
    targetFollows: targetFollows,
    ...config
  });
  
  chrome.alarms.create('followerTick', { periodInMinutes: 0.5 });
  
  chrome.tabs.query({ url: ['*://*.x.com/*', '*://*.twitter.com/*'] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'FOLLOWER_MODE_START',
        config: {
          targetFollows: targetFollows,
          speedMode: config.speedMode || config.config?.speedMode || 'medium'
        }
      }).catch(() => {});
    });
  });
}

function handleFollowerStop(reason) {
  chrome.storage.local.set({ isRunning: false, sessionStart: null });
  chrome.alarms.clear('followerTick');
  
  // Log the stop reason if provided
  if (reason) {
    console.log('[engage-pro] Follower mode stopped. Reason:', reason);
  }
  
  chrome.tabs.query({ url: ['*://*.x.com/*', '*://*.twitter.com/*'] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'FOLLOWER_MODE_STOP',
        reason: reason || 'manual'
      }).catch(() => {});
    });
  });
}

function updateStats(data) {
  chrome.storage.local.get('stats', ({ stats }) => {
    const updated = {
      likes: (stats?.likes || 0) + (data.likes || 0),
      replies: (stats?.replies || 0) + (data.replies || 0),
      follows: (stats?.follows || 0) + (data.follows || 0)
    };
    chrome.storage.local.set({ stats: updated });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'engagementTick') {
    chrome.storage.local.get('isRunning', ({ isRunning }) => {
      if (!isRunning) chrome.alarms.clear('engagementTick');
    });
  }
  if (alarm.name === 'followerTick') {
    chrome.storage.local.get('isRunning', ({ isRunning }) => {
      if (!isRunning) chrome.alarms.clear('followerTick');
    });
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });