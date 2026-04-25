;(function () {
  'use strict';
  if (window.__B64D_V2__) return;
  window.__B64D_V2__ = true;

  let btnHost = null, popupHost = null;
  let savedText = '', savedRect = null, lastMouse = { x: 0, y: 0 };
  const BTN_SIZE = 28, POPUP_W = 340, Z = '2147483647';

  const esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function hasChromeRuntime() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && typeof chrome.runtime.sendMessage === 'function';
  }

  function isOurElement(e) {
    const path = e.composedPath ? e.composedPath() : [];
    return path.some(n => n === btnHost || n === popupHost);
  }

  function getSelection_() {
    const sel = window.getSelection();
    const text = sel && sel.toString ? sel.toString().trim() : '';
    if (text) return { text, rect: sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null };
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' ||
        (a.tagName === 'INPUT' && /^(text|search|url|tel|password|email)$/i.test(a.type)))) {
      const { selectionStart: s, selectionEnd: e } = a;
      if (typeof s === 'number' && typeof e === 'number' && e > s)
        return { text: a.value.slice(s, e).trim(), rect: null };
    }
    return { text: '', rect: null };
  }

  function isLikelyBase64(text) {
    const s = text.trim().replace(/\s+/g, '');
    return s.length >= 8 && /^[A-Za-z0-9+/=_-]+$/.test(s);
  }

  function detectUrl(text) {
    try {
      const u = new URL(text.trim());
      if (['http:','https:','ftp:'].includes(u.protocol)) return u.href;
    } catch {}
    return null;
  }

  /* ── 게시글 추천 버튼 판별 ──────────────────────────────────────────
     게시글 추천 컨테이너:
       <div class="... shadow-md bg-zinc-200 ...">   ← 미추천
       <div class="... shadow-md bg-orange-500 ..."> ← 추천됨
     댓글 추천 컨테이너:
       <div class="... gap-1">                       ← shadow-md 없음

     핵심 구분자: 부모 div에 shadow-md 클래스 존재 여부
  ────────────────────────────────────────────────────────────────── */
  function isPostUpvoteButton(btn) {
    // 버튼의 부모 컨테이너(upvote + 카운터 + downvote 를 감싸는 div)에
    // shadow-md 가 있으면 게시글 추천 버튼, 없으면 댓글 추천 버튼
    const parent = btn.parentElement;
    if (!parent) return false;
    const cls = String(parent.className || '');
    return cls.includes('shadow-md');
  }

  function isAlreadyUpvoted(btn) {
    const parent = btn.parentElement;
    if (!parent) return false;
    const cls = String(parent.className || '');
    // 추천 후 컨테이너: bg-orange-500 (또는 bg-orange-{숫자})
    return /\bbg-orange-/.test(cls);
  }

  function findPostUpvoteButton() {
    const allBtns = document.querySelectorAll('button');
    for (const btn of allBtns) {
      if (btn.disabled) continue;
      const svg = btn.querySelector('svg[icon-name="upvote-outline"]');
      if (!svg) continue;
      if (!isPostUpvoteButton(btn)) continue;  // 댓글 버튼 제외
      if (isAlreadyUpvoted(btn)) continue;     // 이미 추천한 경우 제외
      return btn;
    }
    return null;
  }

  function dispatchRealClick(targetBtn) {
    ['pointerover','mouseover','pointerenter','mouseenter',
     'pointerdown','mousedown','pointerup','mouseup','click'].forEach(type =>
      targetBtn.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        view: window, button: 0, buttons: 1
      }))
    );
  }

  function tryUpvote() {
    try {
      const btn = findPostUpvoteButton();
      if (!btn) return false;
      dispatchRealClick(btn);
      return true;
    } catch (e) {
      console.warn('[B64D] tryUpvote error:', e);
      return false;
    }
  }

  function sendOpenMessage(url, newTab) {
    if (hasChromeRuntime()) {
      chrome.runtime.sendMessage({
        action: 'openUrl',
        url,
        target: newTab ? 'new_tab' : 'same_tab',
        setPikpakToken: /mypikpak\.com\/s\//i.test(url)
      });
      return;
    }
    if (newTab) window.open(url, '_blank', 'noopener');
    else location.href = url;
  }

  function openUrl(url, newTab) {
    const clicked = tryUpvote();
    const doNavigate = () => sendOpenMessage(url, newTab);
    clicked ? setTimeout(doNavigate, 500) : doNavigate();
  }

  function b64decode(raw) {
    let s = raw.trim().replace(/\s+/g, '');
    if (!s) throw new Error('선택된 텍스트가 비어 있습니다.');
    s = s.replace(/-/g,'+').replace(/_/g,'/');
    const pad = s.length % 4;
    if (pad === 2) s += '=='; else if (pad === 3) s += '=';
    let binary;
    try { binary = atob(s); } catch { throw new Error('유효하지 않은 Base64 형식입니다.'); }
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    try { return { text: new TextDecoder('utf-8',{fatal:true}).decode(bytes), type:'text' }; } catch {}
    const printable = Array.from(bytes).every(n => (n>=32&&n<127)||n===9||n===10||n===13);
    if (printable) return { text: binary, type: 'ascii' };
    return { text: Array.from(bytes).map(n=>n.toString(16).padStart(2,'0')).join(' '), type: 'binary' };
  }

  const clamp = (n,lo,hi) => Math.max(lo, Math.min(n, hi));
  function removeBtn()   { btnHost?.remove();   btnHost   = null; }
  function removePopup() { popupHost?.remove(); popupHost = null; }
  function anchorRect() {
    if (savedRect && (savedRect.width>0||savedRect.height>0)) return savedRect;
    return { left:lastMouse.x, right:lastMouse.x, top:lastMouse.y, bottom:lastMouse.y };
  }

  function mountBtn() {
    const rect = anchorRect();
    const { scrollX:sx, scrollY:sy, innerWidth:vw, innerHeight:vh } = window;
    if (!btnHost) {
      btnHost = document.createElement('div');
      btnHost.setAttribute('data-b64d','btn');
      Object.assign(btnHost.style, {
        position:'absolute', zIndex:Z,
        width:BTN_SIZE+'px', height:BTN_SIZE+'px', pointerEvents:'auto'
      });
      const sh = btnHost.attachShadow({ mode:'open' });
      sh.innerHTML = `<style>
        button {
          all:unset; display:flex; align-items:center; justify-content:center;
          width:${BTN_SIZE}px; height:${BTN_SIZE}px; border-radius:50%;
          background:#4285f4; color:#fff;
          font:700 8px/1 Arial,sans-serif; cursor:pointer;
          box-shadow:0 2px 6px rgba(0,0,0,.3); user-select:none;
          transition:transform .15s,box-shadow .15s;
        }
        button:hover  { transform:scale(1.1); box-shadow:0 4px 12px rgba(0,0,0,.35); }
        button:active { transform:scale(.93); }
      </style>
      <button title="Base64 Decode">B64</button>`;
      const b = sh.querySelector('button');
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('mousedown',   e => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', onBtnClick);
      document.documentElement.appendChild(btnHost);
    }
    let x = rect.right+sx+6, y = rect.bottom+sy-BTN_SIZE;
    if (x+BTN_SIZE > sx+vw-4) x = rect.left+sx-BTN_SIZE-4;
    if (y+BTN_SIZE > sy+vh-4) y = rect.top+sy-BTN_SIZE-6;
    x = clamp(x, sx+4, sx+vw-BTN_SIZE-4);
    y = clamp(y, sy+4, sy+vh-BTN_SIZE-4);
    btnHost.style.left = x+'px'; btnHost.style.top = y+'px';
  }

  function showPopup(result) {
    removePopup();
    const { text, type, isErr } = result;
    const detectedUrl = !isErr ? detectUrl(text) : null;

    popupHost = document.createElement('div');
    popupHost.setAttribute('data-b64d','popup');
    Object.assign(popupHost.style, { position:'absolute', zIndex:Z });
    const sh = popupHost.attachShadow({ mode:'open' });

    const boxClass = isErr ? 'box error' : type==='binary' ? 'box binary' : 'box';
    const preview  = savedText.length>120 ? savedText.slice(0,120)+'…' : savedText;
    const urlBadge = detectedUrl ? '<span class="badge-url">🔗 URL 감지됨</span>' : '';

    const iconNewTab  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const iconSameTab = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

    const footerHtml = !isErr ? `
      <div class="footer">
        ${detectedUrl ? `
          <button id="btnNewTab" class="btn btn-green">${iconNewTab}새 탭</button>
          <button id="btnSameTab" class="btn btn-blue">${iconSameTab}현재 탭</button>
        ` : ''}
        <button id="btnCopy" class="btn btn-gray" style="margin-left:auto">복사</button>
      </div>` : `<div class="footer"><button id="btnCopy" class="btn btn-gray">복사</button></div>`;

    sh.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      :host { all:initial; display:block; }
      .popup {
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
        font-size:13px; color:#202124; background:#fff;
        border:1px solid #dadce0; border-radius:10px;
        box-shadow:0 4px 24px rgba(0,0,0,.18),0 1px 6px rgba(0,0,0,.1);
        width:${POPUP_W}px; overflow:hidden; pointer-events:auto;
      }
      .header {
        display:flex; align-items:center; justify-content:space-between;
        padding:9px 13px; background:#4285f4;
      }
      .header-left { display:flex; align-items:center; gap:6px; }
      .header-title { font-size:13px; font-weight:700; color:#fff; }
      .close-btn {
        all:unset; cursor:pointer; font-size:15px;
        color:rgba(255,255,255,.8); padding:1px 5px;
        border-radius:4px; line-height:1;
        transition:color .15s,background .15s;
      }
      .close-btn:hover { color:#fff; background:rgba(255,255,255,.2); }
      .body { padding:11px 13px 4px; display:flex; flex-direction:column; gap:9px; }
      .section-label {
        font-size:10px; font-weight:700; color:#5f6368;
        text-transform:uppercase; letter-spacing:.5px;
        margin-bottom:4px; display:block;
      }
      .badge-row { display:flex; align-items:center; gap:5px; margin-bottom:4px; }
      .box {
        font-family:'Courier New',Consolas,monospace;
        font-size:12px; line-height:1.65; word-break:break-all; white-space:pre-wrap;
        background:#f8f9fa; border:1px solid #e0e3e7;
        border-radius:6px; padding:7px 10px;
        max-height:72px; overflow-y:auto; color:#202124;
      }
      .box.source { color:#80868b; font-size:11.5px; }
      .box.error  { background:#fce8e6; border-color:#f5c6c2; color:#c62828; }
      .box.binary { background:#fff8e1; border-color:#ffe082; color:#5d4037; }
      .badge-url {
        display:inline-block; font-size:10.5px; font-weight:600;
        padding:2px 7px; border-radius:4px;
        background:#e8f0fe; color:#1a73e8; border:1px solid #c5d8fb;
      }
      .footer {
        display:flex; align-items:center; gap:6px;
        padding:7px 13px 11px; border-top:1px solid #f1f3f4;
      }
      .btn {
        all:unset; cursor:pointer;
        font:600 11.5px/1.5 Arial,sans-serif;
        padding:6px 12px; border-radius:5px;
        border:1px solid transparent; white-space:nowrap;
        display:inline-flex; align-items:center;
        transition:filter .12s,transform .1s;
      }
      .btn:hover  { filter:brightness(1.08); }
      .btn:active { transform:scale(.95); }
      .btn-green { background:#34a853; color:#fff; border-color:#2d9247; }
      .btn-blue  { background:#1a73e8; color:#fff; border-color:#1765cc; }
      .btn-gray  { background:#f1f3f4; color:#3c4043; border-color:#dadce0; }
      .btn-gray:hover  { background:#e8eaed; }
      .btn-gray.copied { background:#e6f4ea; color:#137333; border-color:#ceead6; }
    </style>
    <div class="popup">
      <div class="header">
        <div class="header-left">
          <span style="font-size:14px">🔐</span>
          <span class="header-title">Base64 디코더 v2.0</span>
        </div>
        <button class="close-btn" id="closeBtn">✕</button>
      </div>
      <div class="body">
        <div>
          <span class="section-label">선택한 텍스트</span>
          <div class="box source">${esc(preview)}</div>
        </div>
        <div>
          <div class="badge-row">
            <span class="section-label" style="margin-bottom:0">디코딩 결과</span>
            ${urlBadge}
          </div>
          <div class="${boxClass}">${esc(text)}</div>
        </div>
      </div>
      ${footerHtml}
    </div>`;

    sh.getElementById('closeBtn').addEventListener('click', () => { removePopup(); removeBtn(); });
    sh.querySelector('.popup').addEventListener('mousedown', e => e.stopPropagation());
    sh.querySelector('.popup').addEventListener('pointerdown', e => e.stopPropagation());

    const btnCopy = sh.getElementById('btnCopy');
    btnCopy?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); }
      catch {
        const ta = Object.assign(document.createElement('textarea'), {
          value: text, style: 'position:fixed;top:-9999px;opacity:0'
        });
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      btnCopy.textContent = '✓ 복사됨'; btnCopy.classList.add('copied');
      setTimeout(() => { btnCopy.textContent = '복사'; btnCopy.classList.remove('copied'); }, 1600);
    });

    sh.getElementById('btnNewTab')?.addEventListener('click',  () => { openUrl(detectedUrl, true);  removePopup(); removeBtn(); });
    sh.getElementById('btnSameTab')?.addEventListener('click', () => { openUrl(detectedUrl, false); removePopup(); removeBtn(); });

    document.documentElement.appendChild(popupHost);

    const br = btnHost ? btnHost.getBoundingClientRect() : anchorRect();
    const { scrollX:sx, scrollY:sy, innerWidth:vw, innerHeight:vh } = window;
    let left = br.right  + sx - POPUP_W;
    let top  = br.bottom + sy + 8;
    left = clamp(left, sx+8, sx+vw-POPUP_W-8);
    if (top + 320 > sy + vh) top = Math.max(sy+8, (br.top||0) + sy - 320);
    popupHost.style.left = left+'px';
    popupHost.style.top  = top+'px';
  }

  function onBtnClick(e) {
    e.preventDefault(); e.stopPropagation();
    if (popupHost) { removePopup(); return; }
    let result;
    try { const d = b64decode(savedText); result = { ...d, isErr: false }; }
    catch (err) { result = { text: err.message || '디코딩 실패', type: 'error', isErr: true }; }
    showPopup(result);
  }

  function updateFromSelection(ev) {
    const { text, rect } = getSelection_();
    if (!text || !isLikelyBase64(text)) { removeBtn(); removePopup(); return; }
    savedText = text; savedRect = rect;
    if (ev) lastMouse = { x: ev.clientX, y: ev.clientY };
    mountBtn();
  }

  document.addEventListener('mouseup', e => {
    if (isOurElement(e)) return;
    lastMouse = { x: e.clientX, y: e.clientY };
    setTimeout(() => updateFromSelection(e), 0);
  }, true);
  document.addEventListener('selectionchange', () => setTimeout(() => updateFromSelection(null), 0));
  document.addEventListener('mousedown', e => { if (isOurElement(e)) return; removeBtn(); removePopup(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { removeBtn(); removePopup(); } }, true);
  window.addEventListener('scroll', () => { if (btnHost || popupHost) { removeBtn(); removePopup(); } }, { passive: true });
  window.addEventListener('resize', () => { if (btnHost && savedText) mountBtn(); }, { passive: true });
})();

;(function pikPakAutofill() {
  if (!location.hostname.includes('mypikpak.com')) return;
  if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)) return;

  const TOKEN_KEY = '_pikpakToken';
  const TOKEN_TTL = 30000;
  const INPUT_SELS = [
    'input[type="password"]',
    'input.el-input__inner[placeholder*="Password"]',
    'input.el-input__inner[placeholder*="password"]',
    'input.el-input__inner'
  ];
  const BTN_SELS = ['button.pp-primary-button', 'button.el-button--primary'];

  const findEl = sels => {
    for (const s of sels) { try { const el = document.querySelector(s); if (el) return el; } catch {} }
    return null;
  };
  const isOkBtn = btn => btn && !btn.disabled &&
    btn.getAttribute('aria-disabled') !== 'true' && !btn.classList.contains('is-disabled');

  function findConfirmBtn() {
    const btn = findEl(BTN_SELS);
    if (btn) return btn;
    for (const kw of ['확인','OK','View','Submit','查看','确认']) {
      const found = [...document.querySelectorAll('button')]
        .find(b => b.textContent.trim().includes(kw) && !b.disabled);
      if (found) return found;
    }
    return null;
  }

  function inject(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    ['input','change'].forEach(ev =>
      input.dispatchEvent(new Event(ev, { bubbles: true, composed: true }))
    );
  }

  function poll(password) {
    let count = 0, locked = false;
    const tick = () => {
      if (++count > 120 || locked) return;
      const input = findEl(INPUT_SELS);
      if (!input) { setTimeout(tick, 150); return; }
      if (input.value !== password) { input.focus(); inject(input, password); setTimeout(tick, 150); return; }
      const btn = findConfirmBtn();
      if (!isOkBtn(btn)) { inject(input, password); setTimeout(tick, 150); return; }
      locked = true;
      setTimeout(() => {
        const i2 = findEl(INPUT_SELS), b2 = findConfirmBtn();
        if (i2 && i2.value === password && isOkBtn(b2)) b2.click();
        else { locked = false; count = 0; if (i2) inject(i2, password); setTimeout(tick, 150); }
      }, 300);
    };
    tick();
  }

  let done = false;
  function start() {
    if (done || !/mypikpak\.com\/s\//i.test(location.href)) return;
    chrome.storage.local.get(['pikpakEnabled','pikpakPassword',TOKEN_KEY], d => {
      if (!d.pikpakEnabled || !d.pikpakPassword) return;
      if (!d[TOKEN_KEY] || Date.now() - d[TOKEN_KEY].ts > TOKEN_TTL) return;
      chrome.storage.local.remove(TOKEN_KEY);
      done = true;
      if (findEl(INPUT_SELS)) { poll(d.pikpakPassword); return; }
      const obs = new MutationObserver(() => {
        if (findEl(INPUT_SELS)) { obs.disconnect(); poll(d.pikpakPassword); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 30000);
    });
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; done = false; start(); }
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });

  start();
})();
