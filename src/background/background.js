// グローバル状態
let state = {
  isRecording: false,
  isPlaying: false,
  recordedEvents: [],
  currentTab: null,
  profiles: {},
};

let persistTimer = null;

function persistState(immediate = false) {
  const snapshot = {
    state: {
      isRecording: state.isRecording,
      isPlaying: state.isPlaying,
      recordedEvents: state.recordedEvents,
      currentTab: state.currentTab,
      profiles: state.profiles,
    }
  };

  if (immediate) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    chrome.storage.local.set(snapshot);
    return;
  }

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    chrome.storage.local.set(snapshot);
    persistTimer = null;
  }, 250);
}

// ストレージから状態を復元
chrome.storage.local.get(['state', 'profiles'], (result) => {
  if (result.state) {
    state = {
      ...state,
      ...result.state,
      profiles: result.state.profiles || result.profiles || {}
    };
  } else if (result.profiles) {
    state.profiles = result.profiles;
  }
  broadcastStatus();
});

// Popupからのメッセージ処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startRecording':
      handleStartRecording();
      break;
    case 'startPlayback':
      handleStartPlayback(message.loopCount);
      break;
    case 'stop':
      handleStop();
      break;
    case 'saveProfile':
      handleSaveProfile(message.profileName);
      break;
    case 'loadProfile':
      sendResponse({ ok: handleLoadProfile(message.profileName) });
      break;
    case 'deleteProfile':
      sendResponse({ ok: handleDeleteProfile(message.profileName) });
      break;
    case 'exportMacro':
      handleExportMacro();
      break;
    case 'importMacro':
      handleImportMacro(message.data);
      break;
    case 'getStatus':
      sendResponse({ status: getStatus() });
      break;
    case 'getProfiles':
      sendResponse({ profiles: state.profiles });
      break;
  }
});

// 録画開始
function handleStartRecording() {
  state.isRecording = true;
  state.recordedEvents = [];
  persistState();
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      state.currentTab = tabs[0].id;
      persistState();
      startRecordingOnTab(state.currentTab, 0);
    }
  });
  
  broadcastStatus('録画中');
}

function startRecordingOnTab(tabId, retryCount) {
  chrome.tabs.sendMessage(tabId, { action: 'startRecording' })
    .then(() => {
      console.log('[AutoWebClicker] Recording command delivered to content script');
    })
    .catch(() => {
      if (retryCount > 0) {
        console.warn('[AutoWebClicker] Content script did not respond; recording will not capture events');
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content-script/content-script.js']
      }).then(() => {
        return chrome.tabs.sendMessage(tabId, { action: 'startRecording' });
      }).then(() => {
        console.log('[AutoWebClicker] Content script injected and recording started');
      }).catch((error) => {
        console.error('[AutoWebClicker] Could not inject content script:', error);
      });
    });
}

// 再生開始
function handleStartPlayback(loopCount = 1) {
  if (state.recordedEvents.length === 0) {
    console.warn('再生するマクロが記録されていません');
    return;
  }
  
  state.isPlaying = true;
  persistState();
  
  // 再生時に現在のタブを確認
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      state.currentTab = tabs[0].id;
      persistState();
    }
    broadcastStatus('再生中');
    playback(state.recordedEvents, loopCount);
  });
}

// 停止
function handleStop() {
  state.isRecording = false;
  state.isPlaying = false;
  persistState();
  
  // コンテントスクリプトに停止を通知
  if (state.currentTab) {
    chrome.tabs.sendMessage(state.currentTab, { action: 'stopRecording' })
      .catch(() => console.log('Content script not available'));
  }
  
  broadcastStatus('停止中');
}

// プロファイル保存
function handleSaveProfile(profileName) {
  state.profiles[profileName] = [...state.recordedEvents];
  persistState(true);
  broadcastProfiles();
}

// プロファイル読み込み
function handleLoadProfile(profileName) {
  if (state.profiles[profileName]) {
    state.recordedEvents = [...state.profiles[profileName]];
    persistState(true);
    console.log(`プロファイル「${profileName}」を読み込みました`);
    return true;
  }
  return false;
}

// プロファイル削除
function handleDeleteProfile(profileName) {
  if (!Object.prototype.hasOwnProperty.call(state.profiles, profileName)) {
    return false;
  }
  delete state.profiles[profileName];
  persistState(true);
  broadcastProfiles();
  return true;
}

// マクロエクスポート
function handleExportMacro() {
  try {
    const dataStr = JSON.stringify(state.recordedEvents, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    if (chrome.downloads) {
      chrome.downloads.download({
        url: dataUri,
        filename: `macro-${Date.now()}.json`,
        saveAs: true
      });
    } else {
      console.error('Chrome downloads API not available');
    }
  } catch (error) {
    console.error('Export error:', error);
  }
}

// マクロインポート
function handleImportMacro(data) {
  if (Array.isArray(data)) {
    state.recordedEvents = data;
    persistState(true);
    console.log('マクロをインポートしました');
  }
}

// 再生実行
async function playback(events, loopCount) {
  for (let loop = 0; loop < loopCount; loop++) {
    for (const event of events) {
      if (!state.isPlaying) break;
      
      await executeEvent(event);
    }
    if (!state.isPlaying) break;
  }
  
  state.isPlaying = false;
  broadcastStatus('停止中');
}

// イベント実行 (CDPを利用)
async function executeEvent(event) {
  return new Promise((resolve) => {
    // CDP経由でマウスイベントを実行
    if (!state.currentTab || !state.isPlaying) {
      resolve();
      return;
    }
    
    try {
      chrome.debugger.attach({ tabId: state.currentTab }, '1.3', () => {
        if (chrome.runtime.lastError) {
          console.error('Debugger attach error:', chrome.runtime.lastError);
          resolve();
          return;
        }
        
        const params = {
          type: event.type,
          x: event.x,
          y: event.y,
          button: event.button || 'left'
        };
        
        chrome.debugger.sendCommand(
          { tabId: state.currentTab },
          'Input.dispatchMouseEvent',
          params,
          () => {
            if (chrome.runtime.lastError) {
              console.error('Debugger command error:', chrome.runtime.lastError);
            }
            setTimeout(resolve, event.delay || 50);
          }
        );
      });
    } catch (error) {
      console.error('Event execution error:', error);
      resolve();
    }
  });
}

// ステータス取得
function getStatus() {
  if (state.isRecording) return '録画中';
  if (state.isPlaying) return '再生中';
  return '停止中';
}

// ステータス配信
function broadcastStatus(status = getStatus()) {
  chrome.runtime.sendMessage({
    type: 'statusUpdate',
    status: status,
    data: {
      eventCount: state.recordedEvents.length
    }
  }).catch(() => {
    // Popupが開いていない場合はエラーになるがスキップ
  });
}

// プロファイルリスト配信
function broadcastProfiles() {
  chrome.runtime.sendMessage({
    type: 'profilesUpdate',
    profiles: state.profiles
  }).catch(() => {
    // Popupが開いていない場合はエラーになるがスキップ
  });
}

// コンテントスクリプトからのメッセージ受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'recordedEvent' && state.isRecording) {
    state.recordedEvents.push({
      type: message.event.type,
      x: message.event.x,
      y: message.event.y,
      button: message.event.button,
      timestamp: message.event.timestamp
    });
    persistState();
  }
});
