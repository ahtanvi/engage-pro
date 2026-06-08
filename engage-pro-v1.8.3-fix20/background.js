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
    history: [],
    telegramQueue: [],
    telegramQueueActive: false,
    telegramQueueIndex: 0,
    telegramQueueStats: { processed: 0, liked: 0, replied: 0, failed: 0 }
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
    // ==================== TELEGRAM QUEUE ====================
    case 'TELEGRAM_QUEUE_START':
      handleTelegramQueueStart(request);
      sendResponse({ success: true });
      break;
    case 'TELEGRAM_QUEUE_STOP':
      handleTelegramQueueStop();
      sendResponse({ success: true });
      break;
    case 'TELEGRAM_QUEUE_STATUS':
      handleTelegramQueueStatus(sendResponse);
      return true; // async
    case 'TELEGRAM_QUEUE_NEXT':
      handleTelegramQueueNext(request);
      sendResponse({ success: true });
      break;
    case 'TELEGRAM_QUEUE_UPDATE_STATS':
      updateTelegramQueueStats(request.data);
      sendResponse({ success: true });
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

// ==================== TELEGRAM QUEUE MANAGEMENT ====================

let telegramQueueState = {
  queue: [],
  active: false,
  currentIndex: 0,
  currentTabId: null,
  config: { autoLike: true, autoReply: true, speedMode: 'medium' },
  stats: { processed: 0, liked: 0, replied: 0, failed: 0 }
};

function handleTelegramQueueStart(request) {
  console.log('[engage-pro:bg] Telegram queue start received with', request.queue?.length, 'items');
  
  telegramQueueState.queue = request.queue || [];
  telegramQueueState.active = true;
  telegramQueueState.currentIndex = 0;
  telegramQueueState.config = request.config || { autoLike: true, autoReply: true, speedMode: 'medium' };
  telegramQueueState.stats = { processed: 0, liked: 0, replied: 0, failed: 0 };
  telegramQueueState.currentTabId = null;
  
  chrome.storage.local.set({
    telegramQueue: telegramQueueState.queue,
    telegramQueueActive: true,
    telegramQueueIndex: 0,
    telegramQueueStats: telegramQueueState.stats
  });
  
  // Start processing the first tweet
  processNextTelegramQueueItem();
}

function handleTelegramQueueStop() {
  console.log('[engage-pro:bg] Telegram queue stop requested');
  telegramQueueState.active = false;
  
  // Close the current Twitter tab if open
  if (telegramQueueState.currentTabId) {
    chrome.tabs.remove(telegramQueueState.currentTabId).catch(() => {});
    telegramQueueState.currentTabId = null;
  }
  
  chrome.storage.local.set({
    telegramQueueActive: false,
    telegramQueueIndex: telegramQueueState.currentIndex
  });
}

function handleTelegramQueueStatus(sendResponse) {
  chrome.storage.local.get(['telegramQueue', 'telegramQueueActive', 'telegramQueueIndex', 'telegramQueueStats'], (result) => {
    sendResponse({
      success: true,
      active: result.telegramQueueActive || false,
      total: result.telegramQueue?.length || 0,
      currentIndex: result.telegramQueueIndex || 0,
      remaining: (result.telegramQueue?.length || 0) - (result.telegramQueueIndex || 0),
      stats: result.telegramQueueStats || { processed: 0, liked: 0, replied: 0, failed: 0 }
    });
  });
  return true; // async
}

function handleTelegramQueueNext(request) {
  // Called by content script when it finishes engaging with a tweet
  console.log('[engage-pro:bg] Queue item completed, result:', request.result);
  
  if (request.result === 'success') {
    telegramQueueState.stats.processed++;
    if (request.liked) telegramQueueState.stats.liked++;
    if (request.replied) telegramQueueState.stats.replied++;
  } else {
    telegramQueueState.stats.failed++;
  }
  
  telegramQueueState.currentIndex++;
  
  chrome.storage.local.set({
    telegramQueueIndex: telegramQueueState.currentIndex,
    telegramQueueStats: telegramQueueState.stats
  });
  
  // Close current tab
  if (telegramQueueState.currentTabId) {
    chrome.tabs.remove(telegramQueueState.currentTabId).catch(() => {});
    telegramQueueState.currentTabId = null;
  }
  
  // Wait a bit then process next
  if (telegramQueueState.active && telegramQueueState.currentIndex < telegramQueueState.queue.length) {
    var delay = getQueueDelay();
    console.log('[engage-pro:bg] Waiting', delay, 'ms before next item');
    setTimeout(processNextTelegramQueueItem, delay);
  } else if (telegramQueueState.currentIndex >= telegramQueueState.queue.length) {
    console.log('[engage-pro:bg] Queue complete!');
    telegramQueueState.active = false;
    chrome.storage.local.set({ telegramQueueActive: false });
    
    // Notify sidepanel
    chrome.runtime.sendMessage({
      type: 'TELEGRAM_QUEUE_COMPLETE',
      stats: telegramQueueState.stats
    }).catch(() => {});
  }
}

function updateTelegramQueueStats(data) {
  telegramQueueState.stats = { ...telegramQueueState.stats, ...data };
  chrome.storage.local.set({ telegramQueueStats: telegramQueueState.stats });
}

function getQueueDelay() {
  // Speed-based delays between tweets
  var speed = telegramQueueState.config.speedMode || 'medium';
  switch (speed) {
    case 'slow': return 8000 + Math.random() * 7000;  // 8-15s
    case 'fast': return 3000 + Math.random() * 2000;   // 3-5s
    default: return 5000 + Math.random() * 5000;     // 5-10s (medium)
  }
}

function processNextTelegramQueueItem() {
  if (!telegramQueueState.active) return;
  if (telegramQueueState.currentIndex >= telegramQueueState.queue.length) {
    console.log('[engage-pro:bg] Queue complete');
    telegramQueueState.active = false;
    chrome.storage.local.set({ telegramQueueActive: false });
    return;
  }
  
  var item = telegramQueueState.queue[telegramQueueState.currentIndex];
  if (!item || !item.url) {
    console.log('[engage-pro:bg] Invalid queue item, skipping');
    telegramQueueState.currentIndex++;
    chrome.storage.local.set({ telegramQueueIndex: telegramQueueState.currentIndex });
    setTimeout(processNextTelegramQueueItem, 1000);
    return;
  }
  
  console.log('[engage-pro:bg] Opening tweet', telegramQueueState.currentIndex + 1, 'of', telegramQueueState.queue.length, ':', item.url);
  
  // Open tweet in new tab
  chrome.tabs.create({ url: item.url, active: false }, (tab) => {
    if (!tab || !tab.id) {
      console.error('[engage-pro:bg] Failed to create tab');
      telegramQueueState.currentIndex++;
      setTimeout(processNextTelegramQueueItem, 2000);
      return;
    }
    
    telegramQueueState.currentTabId = tab.id;
    
    // Wait for page to load then inject engagement
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Wait for page and content script to fully load
        console.log('[engage-pro:bg] Page loaded, waiting 5 seconds for content script...');
        setTimeout(() => {
          engageTelegramQueueItem(tab.id, item);
        }, 5000);
      }
    });
  });
}

function engageTelegramQueueItem(tabId, item) {
  console.log('[engage-pro:bg] Engaging with tweet in tab', tabId);
  
  // Get AI backend config
  chrome.storage.local.get(['aiBackend'], (result) => {
    var aiConfig = result.aiBackend || {};
    
    var config = {
      autoLike: telegramQueueState.config.autoLike,
      autoReply: telegramQueueState.config.autoReply,
      aiBackendUrl: aiConfig.url || '',
      aiApiKey: aiConfig.apiKey || '',
      aiEnabled: aiConfig.enabled || false,
      speedMode: telegramQueueState.config.speedMode || 'medium',
      tweetUrl: item.url,
      tweetId: item.tweetId,
      username: item.username
    };
    
    // First, ping the content script to check if it's ready
    function pingContentScript(attempt) {
      attempt = attempt || 1;
      console.log('[engage-pro:bg] Pinging content script, attempt', attempt);
      
      chrome.tabs.sendMessage(tabId, { type: 'PING' }).then(() => {
        console.log('[engage-pro:bg] Content script is ready!');
        // Now send the actual engagement message
        sendEngageMessage(config);
      }).catch((err) => {
        console.log('[engage-pro:bg] Content script not ready yet:', err.message);
        if (attempt < 10) {
          setTimeout(() => pingContentScript(attempt + 1), 1000);
        } else {
          console.error('[engage-pro:bg] Content script never became ready');
          handleTelegramQueueNext({ result: 'error', error: 'Content script not ready after 10 attempts' });
        }
      });
    }
    
    function sendEngageMessage(config) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TELEGRAM_QUEUE_ENGAGE',
        config: config
      }).then(() => {
        console.log('[engage-pro:bg] Engage message sent successfully');
      }).catch((err) => {
        console.error('[engage-pro:bg] Failed to send engage message:', err.message);
        handleTelegramQueueNext({ result: 'error', error: 'Failed to send engage message: ' + err.message });
      });
    }
    
    // Start pinging
    pingContentScript(1);
  });
}