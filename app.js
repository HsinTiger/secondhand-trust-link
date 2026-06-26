const form = document.querySelector('#dealForm');
const previewBox = document.querySelector('#previewBox');

function formatAmount(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPreview() {
  const data = new FormData(form);
  const item = data.get('item');
  const amount = data.get('amount');
  const shipBy = data.get('shipBy');
  const inspect = data.get('inspect');
  const method = data.get('method');
  const fee = Math.max(Number(amount || 0) * 0.005, 0.2);

  previewBox.innerHTML = `
    <div class="preview-card">
      <div class="preview-row"><strong>商品</strong><span>${item}</span></div>
      <div class="preview-row"><strong>鎖定金額</strong><span>${formatAmount(amount)} USDC</span></div>
      <div class="preview-row"><strong>預估手續費</strong><span>${formatAmount(fee)} USDC（示範 0.5%）</span></div>
      <div class="preview-row"><strong>出貨期限</strong><span>${shipBy}</span></div>
      <div class="preview-row"><strong>驗收期</strong><span>${inspect}</span></div>
      <div class="preview-row"><strong>交易方式</strong><span>${method}</span></div>
      <div class="status-strip" aria-label="交易進度">
        <span>建立</span><span>鎖款</span><span>出貨</span><span>驗收</span><span>撥款</span>
      </div>
    </div>
  `;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  renderPreview();
});

renderPreview();
