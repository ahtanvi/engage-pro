(function() {
  'use strict';

  console.log('[engage-pro:telegram] Telegram content script loaded - v1.8.3-fix17');

  // STATE
  let selectionMode = false;
  let startMessage = null;
  let endMessage = null;
  let tweetQueue = [];
  let autoScanMode = false;

  // SCROLL-LOCK STATE
  let scrollLockStart = null;
  let scrollLockEnd = null;

  // CLICK SELECTION STATE
  let clickSelectionMode = false;
  let clickStartElement = null;
  let clickEndElement = null;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ==================== AUTO SCAN ====================

  function autoScanAllTweetLinks() {
    console.log('[engage-pro:telegram] Auto-scanning entire page for tweet links...');
    var allLinks = [];
    
    var anchors = document.querySelectorAll('a[href*="x.com/"], a[href*="twitter.com/"]');
    anchors.forEach(function(a) {
      var href = a.getAttribute('href') || '';
      var match = href.match(/https?:\/\/(?:x\.com|twitter\.com)\/([^\/]+)\/status\/(\d+)/);
      if (match) {
        var exists = allLinks.some(function(l) { return l.tweetId === match[2]; });
        if (!exists) {
          allLinks.push({
            url: href,
            tweetId: match[2],
            username: match[1]
          });
        }
      }
    });
    
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode()) !== null) {
      var text = node.textContent || '';
      var urlRegex = /https?:\/\/(?:x\.com|twitter\.com)\/([^\/\s]+)\/status\/(\d+)/g;
      var m;
      while ((m = urlRegex.exec(text)) !== null) {
        var exists = allLinks.some(function(l) { return l.tweetId === m[2]; });
        if (!exists) {
          allLinks.push({
            url: 'https://x.com/' + m[1] + '/status/' + m[2],
            tweetId: m[2],
            username: m[1]
          });
        }
      }
    }
    
    var allElements = document.querySelectorAll('*');
    allElements.forEach(function(el) {
      var attrs = ['data-url', 'data-link', 'title', 'aria-label'];
      attrs.forEach(function(attr) {
        var val = el.getAttribute(attr);
        if (val) {
          var match = val.match(/https?:\/\/(?:x\.com|twitter\.com)\/([^\/\s]+)\/status\/(\d+)/);
          if (match) {
            var exists = allLinks.some(function(l) { return l.tweetId === match[2]; });
            if (!exists) {
              allLinks.push({
                url: 'https://x.com/' + match[1] + '/status/' + match[2],
                tweetId: match[2],
                username: match[1]
              });
            }
          }
        }
      });
    });
    
    console.log('[engage-pro:telegram] Auto-scan found', allLinks.length, 'tweet links');
    return allLinks;
  }

  // ==================== FIND ALL MESSAGE ELEMENTS ====================

  function findAllPossibleMessageElements() {
    var selectors = [
      // Telegram Web K specific - most common selectors first
      '.bubble',
      '.message',
      '.bubbles-group .bubble',
      '.bubbles-inner .bubble',
      '.chat-content .bubble',
      '[data-message-id]',
      '[data-msg-id]',
      '[data-mid]',
      '[data-peer-id]',
      '[class*="bubble"]',
      '[class*="message"]',
      '[class*="Bubble"]',
      '[class*="Message"]',
      '.bubbles-group > div',
      '.bubbles-inner > div',
      '.chat-content .bubbles > div',
      '.chat-content .bubbles-inner > div',
      '.history > div',
      '.chat-list > div',
      '[class*="chat"] [class*="item"]',
      '[class*="chat"] [class*="row"]',
      '[class*="chat"] > div > div',
      'div[role="listitem"]',
      'article',
      '.Message',
      '.message-group',
      '[class*="message-group"]',
      '.msg-content',
      '.message-content',
      '.chatbubble',
      '.chat-message',
    ];
    
    var allElements = [];
    var seen = new Set();
    
    for (var i = 0; i < selectors.length; i++) {
      try {
        var els = document.querySelectorAll(selectors[i]);
        if (els.length > 0) {
          console.log('[engage-pro:telegram] Selector', selectors[i], 'found', els.length, 'elements');
          for (var j = 0; j < els.length; j++) {
            var el = els[j];
            if (!seen.has(el)) {
              seen.add(el);
              allElements.push(el);
            }
          }
        }
      } catch (e) {}
    }
    
    if (allElements.length > 0) {
      console.log('[engage-pro:telegram] Total unique message elements found:', allElements.length);
      return allElements;
    }
    
    // Ultimate fallback: find all divs that look like messages
    console.log('[engage-pro:telegram] Using ultimate fallback - scanning all divs');
    var allDivs = document.querySelectorAll('div');
    var candidates = [];
    
    for (var i = 0; i < allDivs.length; i++) {
      var div = allDivs[i];
      var rect = div.getBoundingClientRect();
      var text = (div.textContent || '').trim();
      
      // Message-like criteria
      if (rect.height > 30 && rect.height < 600 && 
          rect.width > 100 && 
          text.length > 5 &&
          div.children.length >= 1) {
        
        // Check if it contains links or has message-like structure
        var hasLinks = div.querySelector('a') !== null;
        var hasText = text.length > 10;
        
        if (hasLinks || hasText) {
          candidates.push(div);
        }
      }
    }
    
    console.log('[engage-pro:telegram] Fallback found', candidates.length, 'candidate elements');
    return candidates;
  }

  function captureMessageAtViewport(type) {
    var scrollY = window.scrollY || window.pageYOffset;
    var viewportHeight = window.innerHeight;
    var viewportWidth = window.innerWidth;
    var viewportCenterX = viewportWidth / 2;
    var viewportCenterY = viewportHeight / 2;
    
    console.log('[engage-pro:telegram] Capturing', type, 'at center:', viewportCenterX, viewportCenterY);
    
    // STRATEGY 1: Try multiple points around viewport center
    var pointsToTry = [
        {x: viewportCenterX, y: viewportCenterY},
        {x: viewportCenterX, y: viewportCenterY - 50},
        {x: viewportCenterX, y: viewportCenterY + 50},
        {x: viewportCenterX, y: viewportCenterY - 100},
        {x: viewportCenterX, y: viewportCenterY + 100},
        {x: viewportCenterX, y: viewportHeight * 0.3},
        {x: viewportCenterX, y: viewportHeight * 0.7},
    ];
    
    for (var p = 0; p < pointsToTry.length; p++) {
        var point = pointsToTry[p];
        var elementAtPoint = document.elementFromPoint(point.x, point.y);
        
        if (elementAtPoint) {
            console.log('[engage-pro:telegram] elementFromPoint at', point.x, point.y, ':', 
                elementAtPoint.tagName, (elementAtPoint.className || '').substring(0, 50));
            
            var el = elementAtPoint;
            var foundBubble = null;
            var walkCount = 0;
            
            while (el && el !== document.body && el !== document.documentElement && walkCount < 25) {
                walkCount++;
                
                var className = (el.className || '').toString().toLowerCase();
                var isBubble = className.includes('bubble') || className.includes('message') || 
                              el.hasAttribute('data-message-id') || el.hasAttribute('data-msg-id') ||
                              el.hasAttribute('data-mid') || el.hasAttribute('data-peer-id');
                
                if (isBubble) {
                    foundBubble = el;
                    console.log('[engage-pro:telegram] Found bubble at level', walkCount, 'class:', className.substring(0, 50));
                    break;
                }
                
                el = el.parentElement;
            }
            
            if (foundBubble) {
                var rect = foundBubble.getBoundingClientRect();
                var result = {
                    element: foundBubble,
                    elementRef: foundBubble,
                    scrollY: scrollY,
                    viewportCenterX: viewportCenterX,
                    viewportCenterY: viewportCenterY,
                    elementTop: rect.top,
                    elementBottom: rect.bottom,
                    elementCenter: rect.top + rect.height / 2,
                    elementHeight: rect.height,
                    elementWidth: rect.width,
                    elementTagName: foundBubble.tagName,
                    elementClassName: foundBubble.className || '',
                    elementId: foundBubble.id || '',
                    elementDataId: foundBubble.getAttribute('data-message-id') || foundBubble.getAttribute('data-msg-id') || '',
                    elementTextPreview: (foundBubble.textContent || '').substring(0, 100),
                    type: type,
                    timestamp: Date.now(),
                    method: 'elementFromPoint'
                };
                console.log('[engage-pro:telegram] Captured', type, 'via elementFromPoint');
                return result;
            }
        }
    }
    
    // STRATEGY 2: Find all message elements and pick closest to center
    var messages = findAllPossibleMessageElements();
    console.log('[engage-pro:telegram] Fallback: Found', messages.length, 'message elements');
    
    if (messages.length === 0) {
        console.log('[engage-pro:telegram] No message elements found!');
        return null;
    }
    
    // Log elements for debugging
    for (var i = 0; i < Math.min(messages.length, 10); i++) {
        var rect = messages[i].getBoundingClientRect();
        console.log('[engage-pro:telegram] Element', i, 
            'tag=' + messages[i].tagName,
            'class=' + (messages[i].className || '').substring(0, 40),
            'top=' + rect.top.toFixed(0),
            'height=' + rect.height.toFixed(0));
    }
    
    var closest = null;
    var closestDist = Infinity;
    
    for (var i = 0; i < messages.length; i++) {
        var rect = messages[i].getBoundingClientRect();
        var msgCenter = rect.top + rect.height / 2;
        var dist = Math.abs(msgCenter - viewportCenterY);
        
        if (dist < closestDist) {
            closestDist = dist;
            closest = messages[i];
        }
    }
    
    if (closest) {
        var rect = closest.getBoundingClientRect();
        var result = {
            element: closest,
            elementRef: closest,
            scrollY: scrollY,
            viewportCenterX: viewportCenterX,
            viewportCenterY: viewportCenterY,
            elementTop: rect.top,
            elementBottom: rect.bottom,
            elementCenter: rect.top + rect.height / 2,
            elementHeight: rect.height,
            elementWidth: rect.width,
            elementTagName: closest.tagName,
            elementClassName: closest.className || '',
            elementId: closest.id || '',
            elementDataId: closest.getAttribute('data-message-id') || closest.getAttribute('data-msg-id') || '',
            elementTextPreview: (closest.textContent || '').substring(0, 100),
            type: type,
            timestamp: Date.now(),
            method: 'fallback'
        };
        
        console.log('[engage-pro:telegram] Captured', type, 'via fallback');
        return result;
    }
    
    console.log('[engage-pro:telegram] Could not find any suitable message element');
    return null;
  }

  // ==================== HIGHLIGHT FUNCTIONS ====================

  function highlightScrollLock(lockInfo, type) {
    if (!lockInfo || !lockInfo.element) return;
    var el = lockInfo.element;
    el.style.outline = type === 'start' ? '4px solid #22c55e' : '4px solid #ef4444';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = '8px';
    el.style.transition = 'outline 0.2s';
    el.style.position = 'relative';
    el.style.zIndex = '99999';
    el.style.boxShadow = type === 'start' ? '0 0 20px rgba(34, 197, 94, 0.5)' : '0 0 20px rgba(239, 68, 68, 0.5)';
    el.setAttribute('data-ep-scroll-lock', type);
  }

  function clearScrollLockHighlights() {
    var all = document.querySelectorAll('[data-ep-scroll-lock]');
    all.forEach(function(el) {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.borderRadius = '';
      el.style.transition = '';
      el.style.position = '';
      el.style.zIndex = '';
      el.style.boxShadow = '';
      el.style.backgroundColor = '';
      el.removeAttribute('data-ep-scroll-lock');
    });
  }

  function highlightRangeElements(startIdx, endIdx, messages) {
    clearHighlights();
    
    var minIdx = Math.min(startIdx, endIdx);
    var maxIdx = Math.max(startIdx, endIdx);
    
    console.log('[engage-pro:telegram] Highlighting range from', minIdx, 'to', maxIdx);
    
    for (var i = minIdx; i <= maxIdx; i++) {
      if (messages[i]) {
        messages[i].style.outline = '2px solid #3b82f6';
        messages[i].style.outlineOffset = '2px';
        messages[i].style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
        messages[i].setAttribute('data-ep-highlight', 'range');
      }
    }
  }

  function clearHighlights() {
    var all = document.querySelectorAll('[data-ep-highlight]');
    all.forEach(function(el) {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.borderRadius = '';
      el.style.transition = '';
      el.style.position = '';
      el.style.zIndex = '';
      el.style.boxShadow = '';
      el.style.backgroundColor = '';
      el.removeAttribute('data-ep-highlight');
    });
  }

  // ==================== EXTRACT LINKS FROM RANGE ====================
  
  function extractLinksFromScrollLockRange() {
    if (!scrollLockStart || !scrollLockEnd) {
      console.log('[engage-pro:telegram] No scroll-lock range set');
      return [];
    }
    
    var messages = findAllPossibleMessageElements();
    console.log('[engage-pro:telegram] Extracting range. Total messages in DOM:', messages.length);
    
    if (messages.length === 0) {
      console.log('[engage-pro:telegram] No messages in DOM, cannot extract range');
      return [];
    }
    
    // Try to find by object reference first (fastest)
    var startIdx = messages.indexOf(scrollLockStart.element);
    var endIdx = messages.indexOf(scrollLockEnd.element);
    
    console.log('[engage-pro:telegram] Direct reference lookup - startIdx:', startIdx, 'endIdx:', endIdx);
    
    // If direct reference fails, try to find by data attributes
    if (startIdx === -1 && scrollLockStart.elementDataId) {
      for (var i = 0; i < messages.length; i++) {
        var msgId = messages[i].getAttribute('data-message-id') || 
                    messages[i].getAttribute('data-msg-id') || 
                    messages[i].getAttribute('data-mid') || '';
        if (msgId === scrollLockStart.elementDataId) {
          startIdx = i;
          console.log('[engage-pro:telegram] Found start by data-id:', msgId, 'at index', i);
          break;
        }
      }
    }
    
    if (endIdx === -1 && scrollLockEnd.elementDataId) {
      for (var i = 0; i < messages.length; i++) {
        var msgId = messages[i].getAttribute('data-message-id') || 
                    messages[i].getAttribute('data-msg-id') || 
                    messages[i].getAttribute('data-mid') || '';
        if (msgId === scrollLockEnd.elementDataId) {
          endIdx = i;
          console.log('[engage-pro:telegram] Found end by data-id:', msgId, 'at index', i);
          break;
        }
      }
    }
    
    // If still not found, use fallback position/text matching
    if (startIdx === -1) {
      startIdx = findMessageIndexByFallback(messages, scrollLockStart);
    }
    if (endIdx === -1) {
      endIdx = findMessageIndexByFallback(messages, scrollLockEnd);
    }
    
    if (startIdx === -1 || endIdx === -1) {
      console.log('[engage-pro:telegram] Could not find start/end. Start:', startIdx, 'End:', endIdx);
      // Fallback: just extract from the stored elements directly
      var startLinks = extractTweetLinksFromElement(scrollLockStart.element);
      var endLinks = extractTweetLinksFromElement(scrollLockEnd.element);
      var combined = startLinks.concat(endLinks);
      var unique = [];
      combined.forEach(function(link) {
        if (!unique.some(function(l) { return l.tweetId === link.tweetId; })) {
          unique.push(link);
        }
      });
      console.log('[engage-pro:telegram] Fallback extracted', unique.length, 'links from start/end elements only');
      return unique;
    }
    
    highlightRangeElements(startIdx, endIdx, messages);
    
    var minIdx = Math.min(startIdx, endIdx);
    var maxIdx = Math.max(startIdx, endIdx);
    var allLinks = [];
    
    console.log('[engage-pro:telegram] Extracting links from range', minIdx, 'to', maxIdx, '(', (maxIdx - minIdx + 1), 'messages)');
    
    for (var i = minIdx; i <= maxIdx; i++) {
      if (i < 0 || i >= messages.length) continue;
      var msgLinks = extractTweetLinksFromElement(messages[i]);
      msgLinks.forEach(function(link) {
        var exists = allLinks.some(function(l) { return l.tweetId === link.tweetId; });
        if (!exists) allLinks.push(link);
      });
    }
    
    console.log('[engage-pro:telegram] Extracted', allLinks.length, 'links from range');
    return allLinks;
  }

  function findMessageIndexByFallback(messages, lockInfo) {
    var bestIdx = -1;
    var bestScore = 0;
    
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var score = 0;
      var rect = msg.getBoundingClientRect();
      
      var msgDataId = msg.getAttribute('data-message-id') || msg.getAttribute('data-msg-id') || '';
      if (msgDataId && msgDataId === lockInfo.elementDataId) {
        score += 100;
      }
      
      var msgCenter = rect.top + rect.height / 2;
      var posDiff = Math.abs(msgCenter - lockInfo.elementCenter);
      if (posDiff < 50) {
        score += 50 - posDiff;
      }
      
      var heightDiff = Math.abs(rect.height - lockInfo.elementHeight);
      var widthDiff = Math.abs(rect.width - lockInfo.elementWidth);
      if (heightDiff < 20 && widthDiff < 50) {
        score += 10;
      }
      
      if (msg.className && lockInfo.elementClassName) {
        var msgClasses = msg.className.split(' ').filter(function(c) { return c; });
        var lockClasses = lockInfo.elementClassName.split(' ').filter(function(c) { return c; });
        var commonClasses = msgClasses.filter(function(c) { return lockClasses.indexOf(c) !== -1; });
        score += commonClasses.length * 5;
      }
      
      var msgText = (msg.textContent || '').substring(0, 100);
      var lockText = lockInfo.elementTextPreview || '';
      if (msgText && lockText) {
        if (msgText.indexOf(lockText) !== -1 || lockText.indexOf(msgText) !== -1) {
          score += 20;
        }
        var msgWords = msgText.split(/\s+/).slice(0, 10);
        var lockWords = lockText.split(/\s+/).slice(0, 10);
        var commonWords = msgWords.filter(function(w) { return lockWords.indexOf(w) !== -1; });
        score += commonWords.length * 2;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    
    console.log('[engage-pro:telegram] Fallback finder best score:', bestScore, 'at index:', bestIdx);
    return bestScore >= 10 ? bestIdx : -1;
  }

  // ==================== TWEET LINK EXTRACTION ====================

  function extractTweetLinksFromElement(el) {
    var links = [];
    if (!el) return links;

    var anchors = el.querySelectorAll('a[href]');
    anchors.forEach(function(a) {
      var href = a.getAttribute('href') || '';
      var match = href.match(/https?:\/\/(?:x\.com|twitter\.com)\/([^\/]+)\/status\/(\d+)/);
      if (match) {
        var exists = links.some(function(l) { return l.tweetId === match[2]; });
        if (!exists) {
          links.push({
            url: href,
            tweetId: match[2],
            username: match[1]
          });
        }
      }
    });

    var text = el.textContent || '';
    var urlRegex = /https?:\/\/(?:x\.com|twitter\.com)\/([^\/\s]+)\/status\/(\d+)/g;
    var m;
    while ((m = urlRegex.exec(text)) !== null) {
      var exists = links.some(function(l) { return l.tweetId === m[2]; });
      if (!exists) {
        links.push({
          url: 'https://x.com/' + m[1] + '/status/' + m[2],
          tweetId: m[2],
          username: m[1]
        });
      }
    }

    return links;
  }

  // ==================== TAP/CLICK SELECTION (FIXED) ====================
  
  function onMessageTap(e) {
    if (!clickSelectionMode) return;
    
    console.log('[engage-pro:telegram] Tap detected at:', e.clientX, e.clientY, 'target:', e.target.tagName, e.target.className ? e.target.className.substring(0, 30) : '');
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Use the EXACT tapped element, walk up to find bubble
    var element = e.target;
    var bubble = null;
    
    // Walk up max 25 levels to find a message container
    var walkCount = 0;
    var el = element;
    
    while (el && el !== document.body && el !== document.documentElement && walkCount < 25) {
      walkCount++;
      
      var className = (el.className || '').toString().toLowerCase();
      var isBubble = className.includes('bubble') || className.includes('message') || 
                    el.hasAttribute('data-message-id') || el.hasAttribute('data-msg-id') ||
                    el.hasAttribute('data-mid') || el.hasAttribute('data-peer-id');
      
      if (isBubble) {
        bubble = el;
        console.log('[engage-pro:telegram] Found bubble at level', walkCount, 'class:', className.substring(0, 50));
        break;
      }
      
      el = el.parentElement;
    }
    
    // If no bubble found, try to find any message-like element
    if (!bubble) {
      var messages = findAllPossibleMessageElements();
      console.log('[engage-pro:telegram] Fallback: Found', messages.length, 'message elements');
      
      if (messages.length > 0) {
        // Find the element closest to the tap position
        var closest = null;
        var closestDist = Infinity;
        
        for (var i = 0; i < messages.length; i++) {
          var rect = messages[i].getBoundingClientRect();
          var msgCenterX = rect.left + rect.width / 2;
          var msgCenterY = rect.top + rect.height / 2;
          var dist = Math.sqrt(Math.pow(msgCenterX - e.clientX, 2) + Math.pow(msgCenterY - e.clientY, 2));
          
          if (dist < closestDist) {
            closestDist = dist;
            closest = messages[i];
          }
        }
        
        if (closest && closestDist < 200) {
          bubble = closest;
          console.log('[engage-pro:telegram] Selected closest message, distance:', closestDist.toFixed(0));
        }
      }
    }
    
    if (!bubble) {
      console.log('[engage-pro:telegram] No message bubble found for tap');
      return;
    }
    
    var scrollY = window.scrollY || window.pageYOffset;
    var rect = bubble.getBoundingClientRect();
    
    var result = {
      element: bubble,
      elementRef: bubble,
      scrollY: scrollY,
      elementTop: rect.top,
      elementBottom: rect.bottom,
      elementCenter: rect.top + rect.height / 2,
      elementHeight: rect.height,
      elementWidth: rect.width,
      elementTagName: bubble.tagName,
      elementClassName: bubble.className || '',
      elementId: bubble.id || '',
      elementDataId: bubble.getAttribute('data-message-id') || bubble.getAttribute('data-msg-id') || '',
      elementTextPreview: (bubble.textContent || '').substring(0, 100),
      type: 'tap',
      timestamp: Date.now(),
      method: 'tap'
    };
    
    if (!clickStartElement) {
      clickStartElement = result;
      highlightMessage(bubble, 'start');
      console.log('[engage-pro:telegram] Tap start set');
      showTapStatus('Start message selected. Tap another message to select end.', '#22c55e');
    } else if (!clickEndElement) {
      clickEndElement = result;
      highlightMessage(bubble, 'end');
      console.log('[engage-pro:telegram] Tap end set');
      showTapStatus('End message selected! Processing...', '#22c55e');
      
      setTimeout(function() {
        processSelection();
      }, 300);
    } else {
      // Reset and start over
      clearHighlights();
      clickStartElement = result;
      clickEndElement = null;
      highlightMessage(bubble, 'start');
      console.log('[engage-pro:telegram] Reset and new start set');
      showTapStatus('New start message selected. Tap another message to select end.', '#22c55e');
    }
  }

  function highlightMessage(el, type) {
    if (!el) return;
    el.style.outline = type === 'start' ? '4px solid #22c55e' : '4px solid #ef4444';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = '8px';
    el.style.transition = 'outline 0.2s';
    el.style.position = 'relative';
    el.style.zIndex = '99999';
    el.style.boxShadow = type === 'start' ? '0 0 20px rgba(34, 197, 94, 0.5)' : '0 0 20px rgba(239, 68, 68, 0.5)';
    el.setAttribute('data-ep-highlight', type);
  }

  // ==================== SELECTION UI ====================
  
  function showSelectionUI() {
    var existing = document.getElementById('ep-telegram-ui');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.id = 'ep-telegram-ui';
    div.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;min-width:340px;font-family:system-ui,sans-serif;color:#e2e8f0;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
    
    div.innerHTML = 
      '<div style="font-weight:600;font-size:14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;"></span>' +
      'Engage Pro - Telegram Queue</div>' +
      '<button id="ep-telegram-close" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;" title="Close">&times;</button>' +
      '</div>' +
      '<div id="ep-telegram-status" style="font-size:12px;color:#94a3b8;margin-bottom:12px;">' +
      '<b style="color:#e2e8f0;">Scroll-Lock:</b> Scroll to message, click Mark Start/End</div>' +
      '<div id="ep-telegram-count" style="font-size:11px;color:#64748b;margin-bottom:12px;display:none;max-height:150px;overflow-y:auto;"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button id="ep-telegram-mark-start" style="flex:1;padding:10px 12px;border-radius:6px;border:none;background:#22c55e;color:#fff;font-size:12px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(34,197,94,0.3);">1. Mark Start</button>' +
      '<button id="ep-telegram-mark-end" style="flex:1;padding:10px 12px;border-radius:6px;border:none;background:#ef4444;color:#fff;font-size:12px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(239,68,68,0.3);">2. Mark End</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
      '<button id="ep-telegram-auto" style="flex:1;padding:8px 12px;border-radius:6px;border:none;background:#10b981;color:#fff;font-size:12px;cursor:pointer;">Auto Scan All</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
      '<button id="ep-telegram-cancel" style="padding:8px 12px;border-radius:6px;border:1px solid #475569;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;">Cancel</button>' +
      '<button id="ep-telegram-start" style="flex:1;padding:8px 12px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:12px;cursor:pointer;display:none;font-weight:600;">3. Start Queue</button>' +
      '</div>';

    document.body.appendChild(div);

    var markStartBtn = document.getElementById('ep-telegram-mark-start');
    var markEndBtn = document.getElementById('ep-telegram-mark-end');
    var autoBtn = document.getElementById('ep-telegram-auto');
    var cancelBtn = document.getElementById('ep-telegram-cancel');
    var startBtn = document.getElementById('ep-telegram-start');
    var closeBtn = document.getElementById('ep-telegram-close');
    var statusDiv = document.getElementById('ep-telegram-status');
    var countDiv = document.getElementById('ep-telegram-count');

    // Mark Start handler
    markStartBtn.addEventListener('click', function() {
      console.log('[engage-pro:telegram] === MARK START CLICKED ===');
      
      var result = captureMessageAtViewport('start');
      if (!result) {
        if (statusDiv) statusDiv.innerHTML = '<span style="color:#ef4444;">Could not find a message. Try scrolling so a message is visible, then click again.</span>';
        console.log('[engage-pro:telegram] Mark Start failed - no message found');
        return;
      }
      
      if (scrollLockStart) {
        clearScrollLockHighlights();
      }
      
      scrollLockStart = result;
      highlightScrollLock(scrollLockStart, 'start');
      
      markStartBtn.style.opacity = '0.6';
      markStartBtn.textContent = 'Start Marked ✓';
      markStartBtn.style.background = '#166534';
      
      if (statusDiv) {
        if (scrollLockEnd) {
          statusDiv.innerHTML = '<span style="color:#22c55e;">Start marked!</span> Both start and end are set. Click <b style="color:#3b82f6;">Start Queue</b> to begin.';
          var links = extractLinksFromScrollLockRange();
          tweetQueue = links;
          renderQueueWithDeleteButtons();
          startBtn.style.display = 'inline-block';
        } else {
          statusDiv.innerHTML = '<span style="color:#22c55e;">Start marked!</span> Now scroll to the END message and click <b style="color:#ef4444;">Mark End</b>';
        }
      }
      
      console.log('[engage-pro:telegram] Start marked successfully');
    });

    // Mark End handler
    markEndBtn.addEventListener('click', function() {
      console.log('[engage-pro:telegram] === MARK END CLICKED ===');
      
      var result = captureMessageAtViewport('end');
      if (!result) {
        if (statusDiv) statusDiv.innerHTML = '<span style="color:#ef4444;">Could not find a message. Try scrolling so a message is visible, then click again.</span>';
        console.log('[engage-pro:telegram] Mark End failed - no message found');
        return;
      }
      
      if (scrollLockEnd) {
        var oldEnd = document.querySelectorAll('[data-ep-scroll-lock="end"]');
        oldEnd.forEach(function(el) {
          el.style.outline = '';
          el.style.boxShadow = '';
          el.removeAttribute('data-ep-scroll-lock');
        });
      }
      
      scrollLockEnd = result;
      highlightScrollLock(scrollLockEnd, 'end');
      
      markEndBtn.style.opacity = '0.6';
      markEndBtn.textContent = 'End Marked ✓';
      markEndBtn.style.background = '#991b1b';
      
      var links = extractLinksFromScrollLockRange();
      tweetQueue = links;
      renderQueueWithDeleteButtons();
      
      if (statusDiv) {
        statusDiv.innerHTML = '<span style="color:#ef4444;">End marked!</span> Range selected with ' + links.length + ' tweet link(s). Click <b style="color:#3b82f6;">Start Queue</b> to begin.';
      }
      
      startBtn.style.display = 'inline-block';
      
      console.log('[engage-pro:telegram] End marked successfully. Found', links.length, 'links');
    });

    // Auto Scan handler
    autoBtn.addEventListener('click', function() {
      autoScanAndQueue();
    });

    // Close button handler
    closeBtn.addEventListener('click', function() {
      hideSelectionUI();
      cancelSelection();
    });

    // Cancel handler
    cancelBtn.addEventListener('click', function() {
      cancelSelection();
    });

    // Start Queue handler
    startBtn.addEventListener('click', function() {
      startQueueEngagement();
    });
  }

  function hideSelectionUI() {
    var ui = document.getElementById('ep-telegram-ui');
    if (ui) ui.remove();
  }

  // ==================== AUTO SCAN ====================

  
  // ==================== QUEUE RENDERING WITH DELETE BUTTONS ====================
  
  function renderQueueWithDeleteButtons() {
    // Get DOM elements fresh each time (they may not exist if UI was recreated)
    var countDiv = document.getElementById('ep-telegram-count');
    var startBtn = document.getElementById('ep-telegram-start');
    var statusDiv = document.getElementById('ep-telegram-status');
    
    if (!countDiv) return;
    
    if (tweetQueue.length === 0) {
      countDiv.style.display = 'none';
      countDiv.innerHTML = '';
      return;
    }
    
    countDiv.style.display = 'block';
    var html = '<div style="font-weight:600;margin-bottom:6px;color:#3b82f6;">Captured Posts (' + tweetQueue.length + '):</div>';
    
    tweetQueue.forEach(function(link, index) {
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;margin:2px 0;background:#334155;border-radius:4px;font-size:11px;">' +
        '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">' +
        '<span style="color:#94a3b8;">@' + link.username + '</span> ' +
        '<span style="color:#64748b;">' + link.tweetId.substring(0, 8) + '...</span>' +
        '</div>' +
        '<button class="ep-delete-post" data-index="' + index + '" style="background:#ef4444;border:none;color:#fff;border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;margin-left:6px;">&times;</button>' +
        '</div>';
    });
    
    countDiv.innerHTML = html;
    
    // Add delete handlers
    var deleteButtons = countDiv.querySelectorAll('.ep-delete-post');
    deleteButtons.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(this.getAttribute('data-index'));
        if (!isNaN(idx) && idx >= 0 && idx < tweetQueue.length) {
          var removed = tweetQueue.splice(idx, 1)[0];
          console.log('[engage-pro:telegram] Deleted post @' + removed.username + ' from queue');
          renderQueueWithDeleteButtons();
          
          if (tweetQueue.length === 0) {
            if (startBtn) startBtn.style.display = 'none';
            if (statusDiv) statusDiv.innerHTML = '<span style="color:#ef4444;">All posts deleted. Select a new range.</span>';
          }
        }
      });
    });
  }

  function autoScanAndQueue() {
    console.log('[engage-pro:telegram] Running auto-scan...');
    var links = autoScanAllTweetLinks();
    
    var status = document.getElementById('ep-telegram-status');
    var count = document.getElementById('ep-telegram-count');
    var startBtn = document.getElementById('ep-telegram-start');
    
    if (links.length === 0) {
      if (status) status.innerHTML = '<span style="color:#ef4444;">No tweet links found on this page. Try scrolling to load more messages first.</span>';
      return;
    }
    
    tweetQueue = links;
    renderQueueWithDeleteButtons();
    
    if (status) status.innerHTML = '<span style="color:#10b981;">Auto-scan found ' + links.length + ' tweet link(s)!</span> Click <b style="color:#3b82f6;">Start Queue</b> to begin.';
    if (startBtn) startBtn.style.display = 'inline-block';
    
    console.log('[engage-pro:telegram] Auto-scan complete,', links.length, 'links ready');
  }

  // ==================== CANCEL ====================

  function cancelSelection() {
    selectionMode = false;
    startMessage = null;
    endMessage = null;
    scrollLockStart = null;
    scrollLockEnd = null;
    clickSelectionMode = false;
    clickStartElement = null;
    clickEndElement = null;
    clearHighlights();
    clearScrollLockHighlights();
    hideSelectionUI();
    document.removeEventListener('click', onMessageTap, true);
    document.removeEventListener('touchend', onMessageTap, true);
    console.log('[engage-pro:telegram] Selection cancelled');
  }

  // ==================== QUEUE ENGAGEMENT ====================

  async function startQueueEngagement() {
    if (tweetQueue.length === 0 && scrollLockStart && scrollLockEnd) {
      tweetQueue = extractLinksFromScrollLockRange();
    }
    
    if (tweetQueue.length === 0 && clickStartElement && clickEndElement) {
      var messages = findAllPossibleMessageElements();
      var startIdx = messages.indexOf(clickStartElement);
      var endIdx = messages.indexOf(clickEndElement);
      
      if (startIdx === -1 || endIdx === -1) {
        var startLinks = extractTweetLinksFromElement(clickStartElement);
        var endLinks = extractTweetLinksFromElement(clickEndElement);
        tweetQueue = startLinks.concat(endLinks);
        var unique = [];
        tweetQueue.forEach(function(link) {
          if (!unique.some(function(l) { return l.tweetId === link.tweetId; })) {
            unique.push(link);
          }
        });
        tweetQueue = unique;
      } else {
        var minIdx = Math.min(startIdx, endIdx);
        var maxIdx = Math.max(startIdx, endIdx);
        var allLinks = [];
        for (var i = minIdx; i <= maxIdx; i++) {
          if (i >= 0 && i < messages.length) {
            var msgLinks = extractTweetLinksFromElement(messages[i]);
            msgLinks.forEach(function(link) {
              var exists = allLinks.some(function(l) { return l.tweetId === link.tweetId; });
              if (!exists) allLinks.push(link);
            });
          }
        }
        tweetQueue = allLinks;
      }
    }
    
    console.log('[engage-pro:telegram] Queue built with', tweetQueue.length, 'tweets');

    if (tweetQueue.length === 0) {
      alert('No tweet links found! Try using Auto Scan or selecting a different range.');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'TELEGRAM_QUEUE_START',
      queue: tweetQueue,
      config: {
        autoLike: true,
        autoReply: true,
        speedMode: 'medium'
      }
    }).catch(function(err) {
      console.error('[engage-pro:telegram] Failed to send queue:', err);
    });

    var status = document.getElementById('ep-telegram-status');
    if (status) status.innerHTML = '<span style="color:#3b82f6;">Queue sent! Processing ' + tweetQueue.length + ' tweets...</span>';

    var startBtn = document.getElementById('ep-telegram-start');
    if (startBtn) startBtn.style.display = 'none';

    selectionMode = false;
    clickSelectionMode = false;
    document.removeEventListener('click', onMessageTap, true);
    document.removeEventListener('touchend', onMessageTap, true);
  }

  // ==================== MESSAGE HANDLER ====================

  chrome.runtime.onMessage.addListener(function(req, sender, sendResponse) {
    console.log('[engage-pro:telegram] Message received:', req.type);

    if (req.type === 'TELEGRAM_START_SELECTION') {
      selectionMode = true;
      startMessage = null;
      endMessage = null;
      scrollLockStart = null;
      scrollLockEnd = null;
      clickSelectionMode = false;
      clickStartElement = null;
      clickEndElement = null;
      tweetQueue = [];
      clearHighlights();
      clearScrollLockHighlights();
      showSelectionUI();
      sendResponse({ success: true, message: 'Selection UI opened. Use Mark Start/End buttons or Tap Select mode.' });
    } else if (req.type === 'TELEGRAM_CANCEL_SELECTION') {
      cancelSelection();
      sendResponse({ success: true });
    } else if (req.type === 'TELEGRAM_AUTO_SCAN') {
      var links = autoScanAllTweetLinks();
      sendResponse({ success: true, links: links, count: links.length });
    } else if (req.type === 'TELEGRAM_GET_QUEUE_STATUS') {
      sendResponse({
        success: true,
        selectionMode: selectionMode,
        hasStart: !!scrollLockStart || !!clickStartElement,
        hasEnd: !!scrollLockEnd || !!clickEndElement,
        queueLength: tweetQueue.length
      });
    } else if (req.type === 'TELEGRAM_GET_LINKS_PREVIEW') {
      if (scrollLockStart && scrollLockEnd) {
        var links = extractLinksFromScrollLockRange();
        sendResponse({ success: true, links: links, count: links.length });
      } else if (clickStartElement && clickEndElement) {
        var messages = findAllPossibleMessageElements();
        
        // Try to find by object reference first
        var startIdx = messages.indexOf(clickStartElement);
        var endIdx = messages.indexOf(clickEndElement);
        
        // If reference fails, try to find by data attributes
        if (startIdx === -1 && clickStartElement.elementDataId) {
          for (var i = 0; i < messages.length; i++) {
            var msgId = messages[i].getAttribute('data-message-id') || 
                        messages[i].getAttribute('data-msg-id') || 
                        messages[i].getAttribute('data-mid') || '';
            if (msgId === clickStartElement.elementDataId) {
              startIdx = i;
              console.log('[engage-pro:telegram] Click: Found start by data-id at index', i);
              break;
            }
          }
        }
        
        if (endIdx === -1 && clickEndElement.elementDataId) {
          for (var i = 0; i < messages.length; i++) {
            var msgId = messages[i].getAttribute('data-message-id') || 
                        messages[i].getAttribute('data-msg-id') || 
                        messages[i].getAttribute('data-mid') || '';
            if (msgId === clickEndElement.elementDataId) {
              endIdx = i;
              console.log('[engage-pro:telegram] Click: Found end by data-id at index', i);
              break;
            }
          }
        }
        
        var allLinks = [];
        if (startIdx !== -1 && endIdx !== -1) {
          var minIdx = Math.min(startIdx, endIdx);
          var maxIdx = Math.max(startIdx, endIdx);
          console.log('[engage-pro:telegram] Click: Extracting from range', minIdx, 'to', maxIdx);
          for (var i = minIdx; i <= maxIdx; i++) {
            if (i >= 0 && i < messages.length) {
              var msgLinks = extractTweetLinksFromElement(messages[i]);
              msgLinks.forEach(function(link) {
                var exists = allLinks.some(function(l) { return l.tweetId === link.tweetId; });
                if (!exists) allLinks.push(link);
              });
            }
          }
        } else {
          console.log('[engage-pro:telegram] Click: Could not find range, using fallback');
          var sLinks = extractTweetLinksFromElement(clickStartElement);
          var eLinks = extractTweetLinksFromElement(clickEndElement);
          allLinks = sLinks.concat(eLinks);
        }
        console.log('[engage-pro:telegram] Click: Extracted', allLinks.length, 'links');
        sendResponse({ success: true, links: allLinks, count: allLinks.length });
      } else if (tweetQueue.length > 0) {
        sendResponse({ success: true, links: tweetQueue, count: tweetQueue.length });
      } else {
        sendResponse({ success: false, error: 'No range selected or auto-scanned' });
      }
    }
    return true;
  });

  console.log('[engage-pro:telegram] Ready. v1.8.3-fix17. Methods: Scroll-Lock (Mark Start/End) or Tap Select (tap two messages). Auto-scan available.');
})();