# Security Lead Checklist — 二手安心交易 MVP

## 主管判斷

目前可以對外做小範圍 MVP 測試，但只能宣稱「交易流程紀錄與回饋收集」，不得宣稱保障付款、保證防詐或提供仲裁。

## 已有防護

- Cloudflare Workers 部署。
- D1 rate limit：限制建立交易、查詢、事件更新、feedback。
- 輸入驗證：商品名稱、金額、交易方式、驗收期、代碼格式。
- 安全標頭：CSP、X-Frame-Options、nosniff、referrer policy。
- Turnstile 預留：設定 `TURNSTILE_SECRET_KEY` 後才強制驗證。
- 不公開 seller/buyer token，只在建立交易後顯示給建立者複製。
- 不處理真實資金、不做換幣、不做法幣出入金、不做平台錢包。

## 尚未啟用 / 風險

- Turnstile 尚未啟用：若被大量 spam 建交易，需要立即啟用。
- 沒有登入系統：目前靠 private token 操作交易，適合低風險 MVP，不適合高金額。
- 沒有檔案上傳：目前不能真的保存照片/開箱影片，只能先收回饋。
- 沒有正式隱私權/服務條款頁：對外擴大前要補。
- 沒有自訂網域：`workers.dev` 對一般用戶信任較弱。

## 對外測試限制

- 單筆金額文案不要鼓勵超過 NT$3,000 的交易。
- 高風險品類先不推：票券、點數卡、帳號、金融商品、精品、藥品、成人、仿冒品。
- 不要在文案寫「免 KYC」、「匿名」、「保證安全」、「官方擔保」。
- 不要引導使用者真的用 USDC/USDT 支付；目前只測流程。

## 遇到攻擊/濫用 SOP

1. Cloudflare Dashboard → Workers & Pages → `secondhand-safe-trade-api` → Logs。
2. 看是否大量 `POST /api/deals` 或 `POST /api/feedback`。
3. 立即降 rate limit：修改 `src/worker.js` 的 `RATE_LIMITS`。
4. 啟用 Turnstile：設定 `TURNSTILE_SECRET_KEY`，前端加 widget。
5. 若 D1 被 spam，保留 log 後清除垃圾資料。

## 上線前下一個安全 sprint

- 啟用 Turnstile。
- 新增 privacy / terms / prohibited-items 頁。
- 增加 D1 後台查詢或只讀 admin endpoint，需 admin token。
- 加入 Cloudflare WAF rule：限制 API 只接受台灣/主要市場，或針對濫用國家阻擋。
- 建立 SECURITY.md，提供漏洞回報方式。
