// 実行コンテキスト確認
console.log('[AutoWebClicker] Content script loaded');

let isRecording = false;
let lastRecordedTime = 0;
const SAMPLING_INTERVAL = 100; // サンプリング間隔 (ミリ秒)

// バックグラウンドからのメッセージ受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startRecording':
      startRecording();
      break;
    case 'stopRecording':
      stopRecording();
      break;
  }
});

// 録画開始
function startRecording() {
  isRecording = true;
  lastRecordedTime = Date.now();
  console.log('[AutoWebClicker] Recording started');
  
  // マウスイベントリスナー追加
  document.addEventListener('mousedown', handleMouseEvent, true);
  document.addEventListener('mouseup', handleMouseEvent, true);
  document.addEventListener('mousemove', handleMouseEvent, true);
}

// 録画停止
function stopRecording() {
  isRecording = false;
  console.log('[AutoWebClicker] Recording stopped');
  
  // マウスイベントリスナー削除
  document.removeEventListener('mousedown', handleMouseEvent, true);
  document.removeEventListener('mouseup', handleMouseEvent, true);
  document.removeEventListener('mousemove', handleMouseEvent, true);
}

// マウスイベント処理
function handleMouseEvent(event) {
  if (!isRecording) return;
  
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
  chrome.runtime.sendMessage({
    type: 'recordedEvent',
    event: eventData
  });
}
