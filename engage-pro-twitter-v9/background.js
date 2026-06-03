chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRunning: false,
    platform: 'linkedin',
    speedMode: 'medium',
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
  chrome.storage.local.set({
    isRunning: true,
    sessionStart: Date.now(),
    ...config
  });
  
  chrome.alarms.create('engagementTick', { periodInMinutes: 0.5 });
  
  chrome.tabs.query({ url: ['*://*.linkedin.com/*', '*://*.x.com/*', '*://*.twitter.com/*'] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'ENGAGEMENT_START',
        config
      }).catch(() => {});
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
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });