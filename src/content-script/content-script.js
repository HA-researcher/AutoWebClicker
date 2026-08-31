// 実行コンテキスト確認
try {
  console.log('[AutoWebClicker] Content script loaded');
} catch (e) {
  // コンソール不可の環境でも実行継続
}

let isRecording = false;
let lastRecordedTime = 0;
const SAMPLING_INTERVAL = 100; // サンプリング間隔 (ミリ秒)

// バックグラウンドからのメッセージ受信
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        case 'startRecording':
          startRecording();
          sendResponse({ ok: true });
          break;
        case 'stopRecording':
          stopRecording();
          sendResponse({ ok: true });
          break;
      }
    } catch (error) {
      console.error('[AutoWebClicker] Message handler error:', error);
      sendResponse({ ok: false });
    }
  });
}

// 録画開始
function startRecording() {
  try {
    isRecording = true;
    lastRecordedTime = Date.now();
    console.log('[AutoWebClicker] Recording started');
    
    // マウスイベントリスナー追加
    document.addEventListener('mousedown', handleMouseEvent, true);
    document.addEventListener('mouseup', handleMouseEvent, true);
    document.addEventListener('mousemove', handleMouseEvent, true);
  } catch (error) {
    console.error('[AutoWebClicker] Start recording error:', error);
    isRecording = false;
  }
}

// 録画停止
function stopRecording() {
  try {
    isRecording = false;
    console.log('[AutoWebClicker] Recording stopped');
    
    // マウスイベントリスナー削除
    document.removeEventListener('mousedown', handleMouseEvent, true);
    document.removeEventListener('mouseup', handleMouseEvent, true);
    document.removeEventListener('mousemove', handleMouseEvent, true);
  } catch (error) {
    console.error('[AutoWebClicker] Stop recording error:', error);
  }
}

// マウスイベント処理
function handleMouseEvent(event) {
  if (!isRecording) return;
  
  try {
    // サンプリング (mousemoveは高頻度なため)
    const now = Date.now();
    if (event.type === 'mousemove' && now - lastRecordedTime < SAMPLING_INTERVAL) {
      return;
    }
    
    lastRecordedTime = now;
    
    const eventData = {
      type: event.type,
      x: event.clientX,
      y: event.clientY,
      button: event.button === 0 ? 'left' : event.button === 2 ? 'right' : 'middle',
      timestamp: now
    };
    
    // バックグラウンドスクリプトに送信
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'recordedEvent',
        event: eventData
      }).catch(error => {
        // メッセージ送信失敗時は無視
      });
    }
  } catch (error) {
    console.error('[AutoWebClicker] Mouse event handler error:', error);
  }
}
