// グローバル状態
let state = {
  isRecording: false,
  isPlaying: false,
  recordedEvents: [],
  currentTab: null,
  profiles: {},
};

// ストレージから状態を復元
chrome.storage.local.get(['profiles'], (result) => {
  if (result.profiles) {
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
      handleLoadProfile(message.profileName);
      break;
    case 'deleteProfile':
      handleDeleteProfile(message.profileName);
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
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      state.currentTab = tabs[0].id;
      // コンテントスクリプトに録画開始を通知
      chrome.tabs.sendMessage(state.currentTab, { action: 'startRecording' })
        .catch(() => console.log('Content script not available'));
    }
  });
  
  broadcastStatus('録画中');
}

// 再生開始
function handleStartPlayback(loopCount = 1) {
  if (state.recordedEvents.length === 0) {
    console.warn('再生するマクロが記録されていません');
    return;
  }
  
  state.isPlaying = true;
  broadcastStatus('再生中');
  
  playback(state.recordedEvents, loopCount);
}

// 停止
function handleStop() {
  state.isRecording = false;
  state.isPlaying = false;
  
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
  chrome.storage.local.set({ profiles: state.profiles });
  broadcastProfiles();
}

// プロファイル読み込み
function handleLoadProfile(profileName) {
  if (state.profiles[profileName]) {
    state.recordedEvents = [...state.profiles[profileName]];
    console.log(`プロファイル「${profileName}」を読み込みました`);
  }
}

// プロファイル削除
function handleDeleteProfile(profileName) {
  delete state.profiles[profileName];
  chrome.storage.local.set({ profiles: state.profiles });
  broadcastProfiles();
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
  }
});
