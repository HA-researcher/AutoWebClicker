// ステータス定数
const STATUS = {
  IDLE: '停止中',
  RECORDING: '録画中',
  PLAYING: '再生中',
};

// DOM要素の取得
const recordBtn = document.getElementById('recordBtn');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDisplay = document.getElementById('status');
const loopCountInput = document.getElementById('loopCount');
const profileNameInput = document.getElementById('profileName');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');
const profilesList = document.getElementById('profilesList');

// ボタンイベントリスナー
recordBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startRecording' });
});

playBtn.addEventListener('click', () => {
  const loopCount = parseInt(loopCountInput.value) || 1;
  chrome.runtime.sendMessage({ 
    action: 'startPlayback',
    loopCount: loopCount 
  });
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
});

saveBtn.addEventListener('click', () => {
  const profileName = profileNameInput.value.trim();
  if (!profileName) {
    alert('プロファイル名を入力してください');
    return;
  }
  chrome.runtime.sendMessage({ 
    action: 'saveProfile',
    profileName: profileName
  });
});

loadBtn.addEventListener('click', () => {
  const profileName = profileNameInput.value.trim();
  if (!profileName) {
    alert('プロファイル名を入力してください');
    return;
  }
  chrome.runtime.sendMessage({ 
    action: 'loadProfile',
    profileName: profileName
  });
});

exportBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'exportMacro' });
});

importBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        chrome.runtime.sendMessage({ 
          action: 'importMacro',
          data: data
        });
      } catch (error) {
        alert('ファイル形式が正しくありません');
      }
    };
    reader.readAsText(file);
  }
});

// バックグラウンドスクリプトからのメッセージ受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'statusUpdate') {
    updateUI(message.status, message.data);
  } else if (message.type === 'profilesUpdate') {
    loadProfilesList(message.profiles);
  }
});

// UI更新関数
function updateUI(status, data = {}) {
  statusDisplay.textContent = status;
  
  switch (status) {
    case STATUS.IDLE:
      recordBtn.disabled = false;
      playBtn.disabled = true;
      stopBtn.disabled = true;
      statusDisplay.style.color = '#e74c3c';
      break;
    case STATUS.RECORDING:
      recordBtn.disabled = true;
      playBtn.disabled = true;
      stopBtn.disabled = false;
      statusDisplay.style.color = '#e74c3c';
      break;
    case STATUS.PLAYING:
      recordBtn.disabled = true;
      playBtn.disabled = true;
      stopBtn.disabled = false;
      statusDisplay.style.color = '#27ae60';
      break;
  }
}

// プロファイルリスト読み込み
function loadProfilesList(profiles) {
  profilesList.innerHTML = '';
  Object.keys(profiles).forEach(name => {
    const item = document.createElement('div');
    item.className = 'profile-item';
    item.innerHTML = `
      <span>${name}</span>
      <button onclick="deleteProfile('${name}')">削除</button>
    `;
    profilesList.appendChild(item);
  });
}

// プロファイル削除
function deleteProfile(name) {
  if (confirm(`プロファイル「${name}」を削除しますか？`)) {
    chrome.runtime.sendMessage({ 
      action: 'deleteProfile',
      profileName: name
    });
  }
}

// 初期化
window.addEventListener('load', () => {
  chrome.runtime.sendMessage({ action: 'getStatus' });
  chrome.runtime.sendMessage({ action: 'getProfiles' });
});
