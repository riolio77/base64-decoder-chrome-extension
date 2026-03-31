// Base64 Decoder Chrome Extension — content.js v1.3
(function () {
  'use strict';

  if (window.__B64_DECODER_LOADED__) return;
  window.__B64_DECODER_LOADED__ = true;

  let btnHost = null;
  let popupHost = null;
  let savedText = '';
  let savedRect = null;
  let lastMouse = { x: 0, y: 0 };

  const BTN_SIZE = 28;
  const POPUP_W  = 340;
  const Z = '2147483647';

  /* ── helpers ──────────────────────────────────────────────────────── */

  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;');

  function isOurElement(e) {
    const path = e.composedPath ? e.composedPath() : [];
    return path.includes(btnHost) || path.includes(popupHost);
  }

  function getActiveSelectionText() {
    const sel  = window.getSelection();
    const text = sel && sel.toString ? sel.toString().trim() : '';
    if (text) return { text, rect: sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null };

    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' ||
        (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email)$/i.test(active.type)))) {
      const { selectionStart: s, selectionEnd: e } = active;
      if (typeof s === 'number' && typeof e === 'number' && e > s)
        return { text: active.value.slice(s, e).trim(), rect: null };
    }
    return { text: '', rect: null };
  }

  function isLikelyBase64(text) {
    const s = text.trim().replace(/\s+/g, '');
    return s.length >= 8 && /^[A-Za-z0-9+/=_-]+$/.test(s);
  }

  /* ── URL 감지 ─────────────────────────────────────────────────────── */
  function detectUrl(text) {
    try {
      const url = new URL(text.trim());
      if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ftp:')
        return url.href;
    } catch {}
    return null;
  }

  function openUrl(url, newTab) {
    if (newTab) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.location.href = url;
    }
  }

  /* ── Base64 디코드 ────────────────────────────────────────────────── */
  function b64decode(raw) {
    let s = raw.trim().replace(/\s+/g, '');
    if (!s) throw new Error('선택된 텍스트가 비어 있습니다.');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad === 2) s += '==';
    else if (pad === 3) s += '=';

    let binary;
    try { binary = atob(s); }
    catch { throw new Error('유효하지 않은 Base64 형식입니다.'); }

    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return { text, type: 'text' };
    } catch {}

    const printable = Array.from(bytes).every(n => (n >= 32 && n < 127) || n === 9 || n === 10 || n === 13);
    if (printable) return { text: binary, type: 'ascii' };

    const hex = Array.from(bytes).map(n => n.toString(16).padStart(2, '0')).join(' ');
    return { text: hex, type: 'binary' };
  }

  /* ── util ─────────────────────────────────────────────────────────── */
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
  function removeBtn()   { btnHost?.remove();   btnHost   = null; }
  function removePopup() { popupHost?.remove(); popupHost = null; }

  function resolveAnchorRect() {
    if (savedRect && (savedRect.width > 0 || savedRect.height > 0)) return savedRect;
    return { left: lastMouse.x, right: lastMouse.x, top: lastMouse.y, bottom: lastMouse.y, width: 0, height: 0 };
  }

  /* ── 트리거 버튼 ──────────────────────────────────────────────────── */
  function mountBtn() {
    const rect = resolveAnchorRect();
    const { scrollX: sx, scrollY: sy, innerWidth: vw, innerHeight: vh } = window;

    if (!btnHost) {
      btnHost = document.createElement('div');
      btnHost.setAttribute('data-b64d', 'btn');
      Object.assign(btnHost.style, { position:'absolute', zIndex:Z, width:BTN_SIZE+'px', height:BTN_SIZE+'px', pointerEvents:'auto' });

      const shadow = btnHost.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host { all:initial; display:block; }
          button {
            all:unset; box-sizing:border-box;
            width:${BTN_SIZE}px; height:${BTN_SIZE}px;
            display:flex; align-items:center; justify-content:center;
            background:#1a73e8; color:#fff; border-radius:999px;
            box-shadow:0 2px 8px rgba(0,0,0,.28),0 1px 3px rgba(0,0,0,.18);
            font-family:'Courier New',monospace; font-size:7px; font-weight:900;
            letter-spacing:-.4px; line-height:1; cursor:pointer; user-select:none;
            transition:background .12s,transform .1s;
          }
          button:hover  { background:#1256c7; transform:scale(1.08); }
          button:active { transform:scale(.95); }
        </style>
        <button type="button" title="Base64 디코딩">B64</button>`;

      const btn = shadow.querySelector('button');
      btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('mousedown',   e => { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('click', onBtnClick);
      document.documentElement.appendChild(btnHost);
    }

    let x = rect.right + sx + 6;
    let y = rect.bottom + sy - BTN_SIZE;
    if (x + BTN_SIZE > sx + vw - 4) x = rect.left + sx - BTN_SIZE - 4;
    if (y + BTN_SIZE > sy + vh - 4) y = rect.top + sy - BTN_SIZE - 6;
    x = clamp(x, sx + 4, sx + vw - BTN_SIZE - 4);
    y = clamp(y, sy + 4, sy + vh - BTN_SIZE - 4);
    btnHost.style.left = x + 'px';
    btnHost.style.top  = y + 'px';
  }

  /* ── 팝업 ─────────────────────────────────────────────────────────── */
  function showPopup(result) {
    removePopup();
    const { text, type, isErr } = result;

    // URL 감지
    const detectedUrl = !isErr ? detectUrl(text) : null;

    popupHost = document.createElement('div');
    popupHost.setAttribute('data-b64d', 'popup');
    Object.assign(popupHost.style, { position:'absolute', zIndex:Z });

    const shadow = popupHost.attachShadow({ mode: 'open' });

    const typeClass  = isErr ? 'error' : type === 'binary' ? 'binary' : '';
    const binaryBadge = type === 'binary' ? '<span class="badge">Binary · HEX</span>' : '';
    const urlBadge    = detectedUrl ? '<span class="badge url">🔗 URL 감지됨</span>' : '';

    // footer: URL 버튼 + 복사 버튼
    const footerHtml = !isErr ? `
      <div class="footer">
        <div class="footer-left">
          ${detectedUrl ? `
            <button class="btn btn-green" id="newTabBtn" title="${esc(detectedUrl)}">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7"/>
                <path d="M8 1h3v3M11 1 5.5 6.5"/>
              </svg>
              새 탭으로 열기
            </button>
            <button class="btn btn-gray" id="curTabBtn" title="${esc(detectedUrl)}">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 6h8M7 3l3 3-3 3"/>
              </svg>
              현재 탭에서 열기
            </button>
          ` : ''}
        </div>
        <button class="btn btn-blue" id="copyBtn">복사</button>
      </div>` : '';

    shadow.innerHTML = `
      <style>
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :host{all:initial;display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .card{background:#fff;border-radius:12px;width:${POPUP_W}px;overflow:hidden;
          box-shadow:0 8px 30px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.12);
          animation:pop .18s cubic-bezier(.34,1.56,.64,1) both}
        @keyframes pop{from{opacity:0;transform:scale(.88) translateY(-4px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .header{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;background:#1a73e8;color:#fff}
        .header-title{font-size:12px;font-weight:600;letter-spacing:.15px}
        .close{all:unset;cursor:pointer;font-size:15px;line-height:1;opacity:.75;padding:2px 5px;border-radius:4px;transition:opacity .1s,background .1s}
        .close:hover{opacity:1;background:rgba(255,255,255,.2)}
        .section,.result{padding:10px 13px}
        .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#999;
          margin-bottom:5px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
        .badge{display:inline-block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;letter-spacing:.3px}
        .badge:not(.url){background:#ede7f6;color:#5e35b1}
        .badge.url{background:#e8f4fd;color:#1a73e8;border:1px solid #bde0f9}
        .mono{font-family:'Courier New',monospace;font-size:12px;line-height:1.55;color:#1a1a1a;
          word-break:break-all;white-space:pre-wrap;background:#f4f4f4;border-radius:7px;padding:7px 9px;
          max-height:88px;overflow:auto}
        .result .mono{background:#e8f4fd;border:1px solid #bde0f9;max-height:150px}
        .result .mono.error{background:#fff0f0;border-color:#ffc8c8;color:#c62828}
        .result .mono.binary{background:#f3e8ff;border-color:#d4b8f0;color:#4a148c}
        .divider{height:1px;background:#ebebeb}
        .footer{padding:8px 13px 11px;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}
        .footer-left{display:flex;gap:6px;flex-wrap:wrap}
        .btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;
          font-size:11px;font-weight:700;padding:5px 11px;border-radius:5px;
          transition:background .12s,transform .08s;letter-spacing:.1px;white-space:nowrap;line-height:1.3}
        .btn:active{transform:scale(.96)}
        .btn-blue{background:#1a73e8;color:#fff}
        .btn-blue:hover{background:#1256c7}
        .btn-blue.copied{background:#1e8737}
        .btn-green{background:#188038;color:#fff}
        .btn-green:hover{background:#0d6b2e}
        .btn-gray{background:#f1f3f4;color:#3c4043;border:1px solid #dadce0}
        .btn-gray:hover{background:#e8eaed}
        svg{flex-shrink:0}
      </style>
      <div class="card">
        <div class="header">
          <span class="header-title">🔓 Base64 디코더</span>
          <button class="close" id="closeBtn" title="닫기">✕</button>
        </div>
        <div class="section">
          <div class="label">선택한 텍스트</div>
          <div class="mono">${esc(savedText)}</div>
        </div>
        <div class="divider"></div>
        <div class="result">
          <div class="label">디코딩 결과 ${binaryBadge}${urlBadge}</div>
          <div class="mono ${typeClass}">${esc(text)}</div>
        </div>
        ${footerHtml}
      </div>`;

    shadow.getElementById('closeBtn').addEventListener('click', () => { removePopup(); removeBtn(); });
    shadow.querySelector('.card').addEventListener('mousedown',   e => e.stopPropagation());
    shadow.querySelector('.card').addEventListener('pointerdown', e => e.stopPropagation());

    if (!isErr) {
      // 복사 버튼
      shadow.getElementById('copyBtn').addEventListener('click', async () => {
        const btn = shadow.getElementById('copyBtn');
        try { await navigator.clipboard.writeText(text); }
        catch {
          const ta = Object.assign(document.createElement('textarea'),
            { value: text, style: 'position:fixed;top:-9999px;left:-9999px;opacity:0' });
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        btn.textContent = '✓ 복사됨!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 1600);
      });

      // URL 버튼
      if (detectedUrl) {
        shadow.getElementById('newTabBtn').addEventListener('click', () => {
          openUrl(detectedUrl, true);
        });
        shadow.getElementById('curTabBtn').addEventListener('click', () => {
          openUrl(detectedUrl, false);
        });
      }
    }

    document.documentElement.appendChild(popupHost);

    // 위치 결정
    const bRect = btnHost.getBoundingClientRect();
    const { scrollX: sx, scrollY: sy, innerWidth: vw, innerHeight: vh } = window;

    let left = bRect.right + sx - POPUP_W;
    let top  = bRect.bottom + sy + 8;
    left = clamp(left, sx + 8, sx + vw - POPUP_W - 8);
    if (top + 240 > sy + vh) top = Math.max(sy + 8, bRect.top + sy - 240);
    popupHost.style.left = left + 'px';
    popupHost.style.top  = top  + 'px';
  }

  /* ── 버튼 클릭 ────────────────────────────────────────────────────── */
  function onBtnClick(e) {
    e.preventDefault(); e.stopPropagation();
    if (popupHost) { removePopup(); return; }
    let result;
    try {
      const decoded = b64decode(savedText);
      result = { ...decoded, isErr: false };
    } catch (err) {
      result = { text: err.message || '디코딩에 실패했습니다.', type: 'error', isErr: true };
    }
    showPopup(result);
  }

  /* ── 선택 감지 ────────────────────────────────────────────────────── */
  function updateFromSelection(triggerEvent) {
    const { text, rect } = getActiveSelectionText();
    if (!text || !isLikelyBase64(text)) { removeBtn(); removePopup(); return; }
    savedText = text;
    savedRect = rect;
    if (triggerEvent) lastMouse = { x: triggerEvent.clientX, y: triggerEvent.clientY };
    mountBtn();
  }

  document.addEventListener('mouseup', e => {
    if (isOurElement(e)) return;
    lastMouse = { x: e.clientX, y: e.clientY };
    setTimeout(() => updateFromSelection(e), 0);
  }, true);

  document.addEventListener('selectionchange', () => {
    setTimeout(() => updateFromSelection(null), 0);
  });

  document.addEventListener('mousedown', e => {
    if (isOurElement(e)) return;
    removeBtn(); removePopup();
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { removeBtn(); removePopup(); }
  }, true);

  window.addEventListener('scroll', () => {
    if (btnHost || popupHost) { removeBtn(); removePopup(); }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (btnHost && savedText) mountBtn();
  }, { passive: true });

})();
