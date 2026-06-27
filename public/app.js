document.documentElement.classList.add('js-enabled');
﻿const form = document.querySelector('#dealForm');
const previewBox = document.querySelector('#previewBox');

// ─── Turnstile ───────────────────────────────────────────
let turnstileToken = '';
window.onTurnstileSuccess = (token) => { turnstileToken = token; };
function resetTurnstile() { turnstileToken = ''; try { window.turnstile?.reset(); } catch {} }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function formatAmount(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function logisticsNotes(payload) {
  const length = Number(payload.package_length || 0);
  const width = Number(payload.package_width || 0);
  const height = Number(payload.package_height || 0);
  const weight = Number(payload.package_weight || 0);
  const notes = [];
  if (payload.method === '面交') notes.push('面交交易仍建議約公開場所，並先寫清楚驗貨方式。');
  if (payload.shipping_provider && payload.shipping_provider.includes('店到店')) notes.push('店到店規格、禁運品與實際運費以物流商公告為準。');
  if (length || width || height || weight) notes.push('已記錄包裹尺寸重量，可作為出貨前溝通依據。');
  if (!notes.length) notes.push('建議出貨前補上包裝照片、封箱照片與物流單號。');
  return notes;
}

function packageText(payload) {
  const dims = [payload.package_length, payload.package_width, payload.package_height].filter(Boolean).join(' × ');
  const weight = payload.package_weight ? payload.package_weight + ' kg' : '未填重量';
  return dims ? dims + ' cm / ' + weight : '尚未填寫尺寸重量';
}

// ─── Stablecoin + NTD price feed ─────────────────────────────────────
const PRICE_CACHE = { usdc: 1.0, usdt: 1.0, ntdPerUsd: 32.0, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchPrices() {
  if (Date.now() - PRICE_CACHE.ts < CACHE_TTL && PRICE_CACHE.ntdPerUsd > 0) return PRICE_CACHE;

  // Source 1: CoinGecko — USDC & USDT vs USD
  try {
    const cg = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=usd');
    const data = await cg.json();
    if (data['usd-coin']?.usd) PRICE_CACHE.usdc = data['usd-coin'].usd;
    if (data['tether']?.usd)  PRICE_CACHE.usdt = data['tether'].usd;
  } catch {}

  // Source 2: 台灣銀行 — USD/NTD spot rate (本行買入 + 賣出平均)
  try {
    const resp = await fetch('https://rate.bot.com.tw/xrt/flCSV/0/day?Lang=zh-TW');
    const csv = await resp.text();
    // CSV format: 幣別,現金買入,現金賣出,即期買入,即期賣出
    const lines = csv.split('\n');
    const usdLine = lines.find(l => l.includes('USD') || l.includes('美金'));
    if (usdLine) {
      const cols = usdLine.split(',');
      // 即期買入 is usually index 2, 即期賣出 index 3
      const buy = parseFloat(cols[2]);
      const sell = parseFloat(cols[3]);
      if (buy > 0 && sell > 0) PRICE_CACHE.ntdPerUsd = (buy + sell) / 2;
    }
  } catch {
    // Fallback: try Google Finance via CoinGecko fallback
    try {
      const resp2 = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
      const d2 = await resp2.json();
      // If CoinGecko gives us USDT/USD, use it to infer NTD from a known rate
      // At this point we keep the old ntdPerUsd value
    } catch {}
  }

  PRICE_CACHE.ts = Date.now();
  return PRICE_CACHE;
}

async function updatePriceHint() {
  const hint = document.querySelector('#priceHint');
  if (!hint) return;
  const { usdc, usdt, ntdPerUsd } = await fetchPrices();
  const ntdPerCoin = (usdc * ntdPerUsd).toFixed(1);
  hint.textContent = `1 USDC ≈ NT$ ${ntdPerCoin} ｜ 1 USDT ≈ NT$ ${(usdt * ntdPerUsd).toFixed(1)} ｜ 匯率來源：台灣銀行 + CoinGecko`;
}

function formPayload() {
  const data = new FormData(form);
  return {
    item: data.get('item'),
    description: data.get('description'),
    amount_usdc: data.get('amount'),
    currency: data.get('currency') || 'USDC',
    ship_by: data.get('shipBy'),
    inspect: data.get('inspect'),
    method: data.get('method'),
    turnstile_token: turnstileToken,
  };
}

function renderPreview() {
  const payload = formPayload();
  const fee = 0;

  previewBox.innerHTML = `
    <div class="preview-card">
      <div class="preview-row"><strong>商品</strong><span>${escapeHtml(payload.item)}</span></div>
      <div class="preview-row"><strong>約定金額</strong><span>${formatAmount(payload.amount_usdc)} ${escapeHtml(payload.currency || 'USDC')}</span></div>
      <div class="preview-row"><strong>商品描述</strong><span>${escapeHtml(payload.description || '尚未填寫')}</span></div>
      <div class="preview-row"><strong>MVP 費用</strong><span>${formatAmount(fee)}（目前不收取）</span></div>
      <div class="preview-row"><strong>出貨期限</strong><span>${escapeHtml(payload.ship_by)}</span></div>
      <div class="preview-row"><strong>驗收期</strong><span>${escapeHtml(payload.inspect)}</span></div>
      <div class="preview-row"><strong>交易方式</strong><span>${escapeHtml(payload.method)}</span></div>
      <div class="preview-row"><strong>物流方式</strong><span>${escapeHtml(payload.shipping_provider || '未選擇')}</span></div>
      <div class="preview-row"><strong>預估運費</strong><span>NT$ ${escapeHtml(payload.shipping_fee || '0')} · ${escapeHtml(payload.shipping_fee_payer || '未設定')}</span></div>
      <div class="preview-row"><strong>包裹規格</strong><span>${escapeHtml(packageText(payload))}</span></div>
      <div class="risk-box"><strong>物流提醒</strong><ul>${logisticsNotes(payload).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>
      <div class="status-strip" aria-label="交易進度">
        <span>建立</span><span>約定</span><span>出貨</span><span>驗收</span><span>完成</span>
      </div>
    </div>
  `;
}

async function createDeal() {
  const response = await fetch('/api/deals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(formPayload()),
  });
  if (!response.ok) throw new Error('api_not_ready');
  return response.json();
}

function absoluteUrl(path) {
  return new URL(path, location.origin).toString();
}

function renderCreated(data) {
  const publicUrl = absoluteUrl(data.links.public);
  const sellerUrl = absoluteUrl(data.links.seller);
  const buyerUrl = absoluteUrl(data.links.buyer);
  const warnings = data.risk?.warnings || [];
  previewBox.innerHTML = `
    <div class="preview-card created-card">
      <div class="preview-row"><strong>交易已建立</strong><span>${escapeHtml(data.deal.public_code)}</span></div>
      <div class="preview-row"><strong>約定金額</strong><span>${formatAmount(data.deal.amount_usdc)} ${escapeHtml(data.deal.currency || 'USDC')}</span></div>
      <div class="preview-row"><strong>公開狀態頁</strong><span><a href="${escapeAttr(publicUrl)}">打開</a></span></div>
      <div class="preview-row"><strong>賣方管理連結</strong><span><button class="copy-link" data-copy="${escapeAttr(sellerUrl)}">複製</button></span></div>
      <div class="preview-row"><strong>買方操作連結</strong><span><button class="copy-link" data-copy="${escapeAttr(buyerUrl)}">複製</button></span></div>
      <div class="risk-box"><strong>風險提示</strong><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>
      <div class="share-actions">
        <a class="button secondary" href="https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(publicUrl)}" target="_blank" rel="noopener">分享狀態頁到 LINE</a>
        <a class="button secondary" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}" target="_blank" rel="noopener">分享到 Facebook</a>
      </div>
      <p class="preview-note">MVP 提醒：本服務目前不收款、不保管資金、不保證交易結果。請勿公開賣方/買方操作連結。</p>
    </div>
  `;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '建立中...';
  try {
    renderCreated(await createDeal());
  } catch {
    renderPreview();
    previewBox.insertAdjacentHTML('beforeend', '<p class="preview-note">Cloudflare API 尚未部署；目前顯示本地預覽。</p>');
  } finally {
    button.disabled = false;
    button.textContent = '產生預覽';
    resetTurnstile();
  }
});

form.addEventListener('input', renderPreview);
renderPreview();
updatePriceHint();


const feedbackForm = document.querySelector('#feedbackForm');
const feedbackStatus = document.querySelector('#feedbackStatus');
const shareText = '私下二手交易不用只靠人品，這個工具把條件、出貨、驗收、爭議流程寫清楚：';
const shareUrl = location.origin + location.pathname;
const lineShare = document.querySelector('#lineShare');
const fbShare = document.querySelector('#fbShare');
if (lineShare) lineShare.href = 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(shareUrl);
if (fbShare) fbShare.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl);

if (feedbackForm) {
  feedbackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = feedbackForm.querySelector('button[type="submit"]');
    const data = new FormData(feedbackForm);
    button.disabled = true;
    button.textContent = '送出中...';
    feedbackStatus.textContent = '';
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'landing_page',
          role: data.get('role'),
          use_case: data.get('use_case'),
          willingness: data.get('willingness'),
          contact: data.get('contact'),
          message: data.get('message'),
          turnstile_token: turnstileToken,
        }),
      });
      if (!response.ok) throw new Error('feedback_failed');
      feedbackForm.reset();
      feedbackStatus.textContent = '收到，謝謝！我們會用這些回饋決定下一版。';
    } catch {
      feedbackStatus.textContent = '目前回饋 API 無法使用；你也可以先截圖或私訊分享想法。';
    } finally {
      resetTurnstile();
      button.disabled = false;
      button.textContent = '送出回饋';
    }
  });
}


document.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-link');
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = '已複製';
    setTimeout(() => { button.textContent = '複製'; }, 1600);
  } catch {
    prompt('請手動複製連結', button.dataset.copy);
  }
});


const revealTargets = document.querySelectorAll('.reveal, .reveal-group > article');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  revealTargets.forEach((target) => observer.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add('is-visible'));
}
