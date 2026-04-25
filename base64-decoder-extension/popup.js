"use strict";

const toggleEl = document.getElementById('enableToggle');
const pwInput  = document.getElementById('pwInput');
const eyeBtn   = document.getElementById('eyeBtn');
const saveBtn  = document.getElementById('saveBtn');
const statusEl = document.getElementById('statusMsg');
const pwField  = document.getElementById('pwField');

chrome.storage.local.get(['pikpakEnabled','pikpakPassword'], data => {
  toggleEl.checked = !!data.pikpakEnabled;
  pwInput.value    = data.pikpakPassword || '';
  syncField();
});

toggleEl.addEventListener('change', syncField);

function syncField() {
  const on = toggleEl.checked;
  pwInput.disabled = !on;
  eyeBtn.disabled  = !on;
  pwField.style.opacity = on ? '1' : '0.5';
}

eyeBtn.addEventListener('click', () => {
  const hide = pwInput.type === 'password';
  pwInput.type       = hide ? 'text' : 'password';
  eyeBtn.textContent = hide ? '🙈' : '👁';
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    pikpakEnabled:  toggleEl.checked,
    pikpakPassword: pwInput.value.trim()
  }, () => {
    statusEl.textContent = '✓ 저장되었습니다';
    statusEl.className   = 'status show ok';
    setTimeout(() => { statusEl.className = 'status'; }, 2400);
  });
});
