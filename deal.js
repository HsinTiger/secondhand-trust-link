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

function render(data) {
  const { deal, events } = data;
  const steps = ['created', 'funded', 'shipped', 'inspection', 'released'];
  root.innerHTML = `
    <div class="card-head">
      <span class="pill success">${escapeHtml(statusLabels[deal.status] || deal.status)}</span>
      <strong>${escapeHtml(deal.item)}</strong>
    </div>
    <div class="amount">約定金額 ${escapeHtml(deal.amount_usdc)}</div>
    <p class="risk-box"><strong>MVP 提醒：</strong>本服務目前不收款、不保管資金、不保證交易結果；此頁只做條件與證據流程紀錄。</p>
    <div class="preview-card">
      <div class="preview-row"><strong>交易方式</strong><span>${escapeHtml(deal.method)}</span></div>
      <div class="preview-row"><strong>出貨期限</strong><span>${escapeHtml(deal.ship_by)}</span></div>
      <div class="preview-row"><strong>驗收期</strong><span>${escapeHtml(deal.inspect)}</span></div>
      <div class="preview-row"><strong>交易代碼</strong><span>${escapeHtml(deal.public_code)}</span></div>
    </div>
    <ol class="timeline deal-timeline">
      ${steps.map((step) => `<li class="${step === deal.status ? 'active' : steps.indexOf(step) < steps.indexOf(deal.status) || deal.status === 'released' ? 'done' : ''}">${statusLabels[step]}</li>`).join('')}
      ${deal.status === 'disputed' ? '<li class="active">爭議處理中</li>' : ''}
      ${deal.status === 'refunded' ? '<li class="active">交易取消</li>' : ''}
    </ol>
    <div class="deal-actions">
      ${role === 'seller' ? eventButton('shipped', '賣方標記已出貨', 'seller') : ''}
      ${role === 'buyer' ? eventButton('buyer_confirmed', '買方確認收貨', 'buyer') : ''}
      ${role === 'buyer' ? eventButton('dispute_opened', '買方提出爭議', 'buyer') : ''}
    </div>
    <h3>事件紀錄</h3>
    <div class="events-list">
      ${events.map((event) => `<div class="event-row"><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.note || '')}</span><small>${escapeHtml(event.created_at)}</small></div>`).join('')}
    </div>
  `;
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
