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

function renderCreated(data) {
  previewBox.innerHTML = `
    <div class="preview-card">
      <div class="preview-row"><strong>交易已建立</strong><span>${data.deal.public_code}</span></div>
      <div class="preview-row"><strong>公開狀態頁</strong><span><a href="${data.links.public}">打開</a></span></div>
      <div class="preview-row"><strong>賣方管理連結</strong><span><a href="${data.links.seller}">複製給賣方</a></span></div>
      <div class="preview-row"><strong>買方操作連結</strong><span><a href="${data.links.buyer}">複製給買方</a></span></div>
      <p class="preview-note">MVP 提醒：目前只是流程紀錄，不處理真實資金。</p>
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
