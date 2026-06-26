const dealTotal = document.querySelector('#dealTotal');
const feedbackTotal = document.querySelector('#feedbackTotal');
const signalStatus = document.querySelector('#signalStatus');
const statusBreakdown = document.querySelector('#statusBreakdown');
const willingnessBreakdown = document.querySelector('#willingnessBreakdown');
const recentFeedback = document.querySelector('#recentFeedback');
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }
function rows(items, emptyText) {
  if (!items || !items.length) return '<p class="preview-note">' + emptyText + '</p>';
  return items.map((item) => '<div class="mini-row"><strong>' + escapeHtml(item.status || item.role || item.willingness || '未填') + '</strong><span>' + Number(item.count || 0) + '</span></div>').join('');
}
async function loadMetrics() {
  const response = await fetch('/api/metrics', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('metrics_unavailable');
  return response.json();
}
function render(data) {
  const deals = data.deals?.total || 0;
  const feedback = data.feedback?.total || 0;
  dealTotal.textContent = deals;
  feedbackTotal.textContent = feedback;
  signalStatus.textContent = feedback >= 10 && deals >= 3 ? '可判斷' : '收集中';
  statusBreakdown.innerHTML = rows(data.deals?.by_status, '尚無交易狀態。');
  willingnessBreakdown.innerHTML = rows(data.feedback?.by_willingness, '尚無付費意願資料。');
  const useCases = data.feedback?.by_use_case || [];
  recentFeedback.innerHTML = useCases.length ? useCases.map((item) => '<article class="feedback-item"><div><strong>' + escapeHtml(item.use_case || '未填場景') + '</strong><span>' + Number(item.count || 0) + '</span></div><p>此區只顯示聚合場景，不公開使用者留言與聯絡方式。</p></article>').join('') : '<p class="preview-note">尚無回饋。今天應該先私訊 20 位近期賣家，而不是加功能。</p>';
}
loadMetrics().then(render).catch(() => {
  dealTotal.textContent = '—'; feedbackTotal.textContent = '—'; signalStatus.textContent = 'API 未連線';
  statusBreakdown.innerHTML = '<p class="preview-note">目前無法載入 metrics API。</p>';
  willingnessBreakdown.innerHTML = '<p class="preview-note">請先確認 Cloudflare Worker 部署狀態。</p>';
  recentFeedback.innerHTML = '<p class="preview-note">Dashboard 是輔助，今天仍要先找真實賣家試用。</p>';
});
