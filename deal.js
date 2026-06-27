const params = new URLSearchParams(location.search);
const code = params.get('code');
const role = params.get('role') || 'viewer';
const token = params.get('token') || '';
const root = document.querySelector('#dealStatus');

const statusLabels = {
  created: '交易建立',
  funded: '條件確認',
  shipped: '賣方已出貨',
  inspection: '買方驗收中',
  disputed: '爭議處理中',
  released: '交易完成',
  refunded: '交易取消',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'request_failed');
  return data;
}

function eventButton(type, label, actor) {
  if (!token) return '';
  return `<button class="button secondary event-button" data-type="${type}" data-actor="${actor}">${label}</button>`;
}

function renderShippingSection(shipping) {
  if (!shipping || !shipping.tracking_number) return '';
  return `
    <div class="preview-card shipping-card">
      <h3>物流資訊</h3>
      <div class="preview-row"><strong>物流商</strong><span>${escapeHtml(shipping.carrier)}</span></div>
      <div class="preview-row"><strong>物流單號</strong><span>${escapeHtml(shipping.tracking_number)}</span></div>
      ${shipping.shipped_at ? `<div class="preview-row"><strong>出貨時間</strong><span>${escapeHtml(shipping.shipped_at)}</span></div>` : ''}
      ${shipping.delivered_at ? `<div class="preview-row"><strong>送達時間</strong><span>${escapeHtml(shipping.delivered_at)}</span></div>` : ''}
    </div>`;
}

function renderShippingForm() {
  if (role !== 'seller' || !token) return '';
  return `
    <div class="preview-card shipping-form-card">
      <h3>填入物流資訊</h3>
      <form id="shippingForm" class="deal-form">
        <label>物流商<select name="carrier">
          <option>7-11 店到店</option><option>全家店到店</option><option>萊爾富店到店</option>
          <option>中華郵政</option><option>黑貓宅急便</option><option>宅配通</option>
          <option>面交/自取</option><option selected>其他</option>
        </select></label>
        <label>物流單號<input name="tracking_number" required placeholder="請填入物流追蹤號碼" /></label>
        <button class="button primary" type="submit">送出物流資訊</button>
        <p id="shippingStatus" class="preview-note" aria-live="polite"></p>
      </form>
    </div>`;
}

function renderVerifySection(verifications) {
  if (!verifications || !verifications.length) return '';
  const badges = verifications.map((v) => {
    const icon = v.verdict === 'pass' ? '✅' : v.verdict === 'warn' ? '⚠️' : v.verdict === 'fail' ? '❌' : '⏳';
    const label = v.verdict === 'pass' ? '驗證通過' : v.verdict === 'warn' ? '注意' : v.verdict === 'fail' ? '驗證失敗' : '待審查';
    return `<div class="preview-row"><strong>${icon} ${v.check_type === 'pre_shipment' ? '出貨前驗證' : '收貨驗證'}</strong><span>${label}（分數：${v.score}）</span></div>`;
  }).join('');
  return `<div class="preview-card verify-card"><h3>AI 驗證結果</h3>${badges}</div>`;
}

function renderVerifyForm() {
  if (role !== 'seller' || !token) return '';
  return `
    <div class="preview-card verify-form-card">
      <h3>出貨前 AI 驗證</h3>
      <p class="preview-note">上傳商品照片，AI 將自動比對描述與商品狀況。</p>
      <form id="verifyForm" class="deal-form">
        <label>商品照片 URL<input name="photo_url" type="url" required placeholder="https://..." /></label>
        <button class="button primary" type="submit">開始 AI 驗證</button>
        <p id="verifyStatus" class="preview-note" aria-live="polite"></p>
      </form>
    </div>`;
}

function render(data) {
  const { deal, events, shipping, verifications } = data;
  const steps = ['created', 'funded', 'shipped', 'inspection', 'released'];
  root.innerHTML = `
    <div class="card-head">
      <span class="pill success">${escapeHtml(statusLabels[deal.status] || deal.status)}</span>
      <strong>${escapeHtml(deal.item)}</strong>
    </div>
    <div class="amount">${escapeHtml(deal.amount_usdc)} ${escapeHtml(deal.currency || 'USDC')}</div>
    <p class="risk-box"><strong>MVP 提醒：</strong>本服務目前不收款、不保管資金、不保證交易結果；此頁只做條件與證據流程紀錄。</p>
    <div class="preview-card">
      <div class="preview-row"><strong>交易方式</strong><span>${escapeHtml(deal.method)}</span></div>
      <div class="preview-row"><strong>出貨期限</strong><span>${escapeHtml(deal.ship_by)}</span></div>
      <div class="preview-row"><strong>驗收期</strong><span>${escapeHtml(deal.inspect)}</span></div>
      <div class="preview-row"><strong>交易代碼</strong><span>${escapeHtml(deal.public_code)}</span></div>
      ${deal.description ? `<div class="preview-row"><strong>商品描述</strong><span>${escapeHtml(deal.description)}</span></div>` : ''}
    </div>
    <ol class="timeline deal-timeline">
      ${steps.map((step) => `<li class="${step === deal.status ? 'active' : steps.indexOf(step) < steps.indexOf(deal.status) || deal.status === 'released' ? 'done' : ''}">${statusLabels[step]}</li>`).join('')}
      ${deal.status === 'disputed' ? '<li class="active">爭議處理中</li>' : ''}
      ${deal.status === 'refunded' ? '<li class="active">交易取消</li>' : ''}
    </ol>
    ${renderShippingSection(shipping)}
    ${renderVerifySection(verifications)}
    <div class="deal-actions">
      ${role === 'seller' ? eventButton('shipped', '賣方標記已出貨', 'seller') : ''}
      ${role === 'buyer' ? eventButton('buyer_confirmed', '買方確認收貨', 'buyer') : ''}
      ${role === 'buyer' ? eventButton('dispute_opened', '買方提出爭議', 'buyer') : ''}
    </div>
    ${renderShippingForm()}
    ${renderVerifyForm()}
    <h3>事件紀錄</h3>
    <div class="events-list">
      ${events.map((event) => `<div class="event-row"><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.note || '')}</span><small>${escapeHtml(event.created_at)}</small></div>`).join('')}
    </div>
  `;

  bindShippingForm();
  bindVerifyForm();
}

function bindShippingForm() {
  const form = document.querySelector('#shippingForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const status = document.querySelector('#shippingStatus');
    btn.disabled = true;
    btn.textContent = '送出中...';
    try {
      const data = new FormData(form);
      await api(`/api/deals/${encodeURIComponent(code)}/shipping`, {
        method: 'POST',
        body: JSON.stringify({ token, carrier: data.get('carrier'), tracking_number: data.get('tracking_number') }),
      });
      status.textContent = '物流資訊已更新！';
      load();
    } catch (error) {
      status.textContent = `送出失敗：${error.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '送出物流資訊';
    }
  });
}

function bindVerifyForm() {
  const form = document.querySelector('#verifyForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const status = document.querySelector('#verifyStatus');
    btn.disabled = true;
    btn.textContent = '驗證中...';
    try {
      const data = new FormData(form);
      const result = await api(`/api/deals/${encodeURIComponent(code)}/verify`, {
        method: 'POST',
        body: JSON.stringify({ token, check_type: 'pre_shipment', photo_url: data.get('photo_url') }),
      });
      const v = result.verification;
      const icon = v.verdict === 'pass' ? '✅' : v.verdict === 'warn' ? '⚠️' : '❌';
      status.textContent = `${icon} AI 驗證完成：${v.verdict}（分數：${v.score}）`;
      load();
    } catch (error) {
      status.textContent = `驗證失敗：${error.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '開始 AI 驗證';
    }
  });
}

async function load() {
  if (!code) {
    root.textContent = '缺少交易代碼。';
    return;
  }
  try {
    render(await api(`/api/deals/${encodeURIComponent(code)}`));
  } catch (error) {
    root.textContent = `載入失敗：${error.message}`;
  }
}

root.addEventListener('click', async (event) => {
  const button = event.target.closest('.event-button');
  if (!button) return;
  button.disabled = true;
  try {
    const data = await api(`/api/deals/${encodeURIComponent(code)}/events`, {
      method: 'POST',
      body: JSON.stringify({ type: button.dataset.type, actor: button.dataset.actor, token, note: button.textContent }),
    });
    render(data);
  } catch (error) {
    alert(`更新失敗：${error.message}`);
  } finally {
    button.disabled = false;
  }
});

load();
