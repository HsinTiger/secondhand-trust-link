const form = document.querySelector('#dealForm');
const previewBox = document.querySelector('#previewBox');

function formatAmount(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formPayload() {
  const data = new FormData(form);
  return {
    item: data.get('item'),
    amount_usdc: data.get('amount'),
    ship_by: data.get('shipBy'),
    inspect: data.get('inspect'),
    method: data.get('method'),
    turnstile_token: window.turnstileToken || '',
  };
}

function renderPreview() {
  const payload = formPayload();
  const fee = Math.max(Number(payload.amount_usdc || 0) * 0.005, 0.2);

  previewBox.innerHTML = `
    <div class="preview-card">
      <div class="preview-row"><strong>商品</strong><span>${payload.item}</span></div>
      <div class="preview-row"><strong>鎖定金額</strong><span>${formatAmount(payload.amount_usdc)} USDC</span></div>
      <div class="preview-row"><strong>預估手續費</strong><span>${formatAmount(fee)} USDC（示範 0.5%）</span></div>
      <div class="preview-row"><strong>出貨期限</strong><span>${payload.ship_by}</span></div>
      <div class="preview-row"><strong>驗收期</strong><span>${payload.inspect}</span></div>
      <div class="preview-row"><strong>交易方式</strong><span>${payload.method}</span></div>
      <div class="status-strip" aria-label="交易進度">
        <span>建立</span><span>鎖款</span><span>出貨</span><span>驗收</span><span>撥款</span>
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
      <div class="preview-row"><strong>交易已建立</strong><span>${data.deal.public_code}</span></div>
      <div class="preview-row"><strong>公開狀態頁</strong><span><a href="${publicUrl}">打開</a></span></div>
      <div class="preview-row"><strong>賣方管理連結</strong><span><button class="copy-link" data-copy="${sellerUrl}">複製</button></span></div>
      <div class="preview-row"><strong>買方操作連結</strong><span><button class="copy-link" data-copy="${buyerUrl}">複製</button></span></div>
      <div class="risk-box"><strong>風險提示</strong><ul>${warnings.map((warning) => `<li>${warning}</li>`).join('')}</ul></div>
      <div class="share-actions">
        <a class="button secondary" href="https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(publicUrl)}" target="_blank" rel="noopener">分享狀態頁到 LINE</a>
        <a class="button secondary" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}" target="_blank" rel="noopener">分享到 Facebook</a>
      </div>
      <p class="preview-note">MVP 提醒：目前只是流程紀錄，不處理真實資金。請勿公開賣方/買方操作連結。</p>
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
  }
});

form.addEventListener('input', renderPreview);
renderPreview();


const feedbackForm = document.querySelector('#feedbackForm');
const feedbackStatus = document.querySelector('#feedbackStatus');
const shareText = '私下二手交易不用只靠人品，這個工具把付款、出貨、驗收、爭議流程寫清楚：';
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
          turnstile_token: window.turnstileToken || '',
        }),
      });
      if (!response.ok) throw new Error('feedback_failed');
      feedbackForm.reset();
      feedbackStatus.textContent = '收到，謝謝！我們會用這些回饋決定下一版。';
    } catch {
      feedbackStatus.textContent = '目前回饋 API 無法使用；你也可以先截圖或私訊分享想法。';
    } finally {
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
