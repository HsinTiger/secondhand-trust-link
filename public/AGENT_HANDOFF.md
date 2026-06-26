# Agent Handoff — 二手安心交易 / secondhand-trust-link

更新日期：2026-06-26  
本文件建立前最新功能 commit：`d7bac02`；本文件提交後請以 `git log -1 --oneline` 為最新接手點。

## 一句話專案定位

二手安心交易是一個給 FB 社團、LINE 群、代購、小額二手買賣使用的「交易條件與證據流程連結」工具。它不是賣場、不處理金流、不保管資金、不保證交易；目前目標是降低私下買賣中的資訊分散、面交風險、物流爭議、商品狀況各說各話。

## 線上環境

- Cloudflare Worker / 正式站：`https://secondhand-safe-trade-api.smartmmmoney.workers.dev`
- GitHub Pages 備援：`https://hsintiger.github.io/secondhand-trust-link/`
- GitHub repo：`https://github.com/HsinTiger/secondhand-trust-link`
- Worker name：`secondhand-safe-trade-api`
- D1 database：`secondhand-safe-trade-db`
- Cloudflare account id：`6558ce939bc4a9874939ad2bdcc333bf`

## 技術堆疊

- Runtime：Cloudflare Workers
- Static assets：Cloudflare Workers Assets，來源 `public/`
- Database：Cloudflare D1
- Frontend：原生 HTML / CSS / JS，無框架
- Deployment：`wrangler deploy`
- GitHub Pages：`.github/workflows/pages.yml`
- Cloudflare manual workflow：`.github/workflows/cloudflare.yml`

## 主要檔案

### 前端

- `index.html` / `public/index.html`：首頁 landing page、建立交易表單、物流 MVP、面交安全、回饋表單。
- `app.js` / `public/app.js`：建立交易、預覽、風險提示、物流欄位預覽、回饋送出、scroll reveal。
- `deal.html` / `public/deal.html`：交易狀態頁。
- `deal.js` / `public/deal.js`：交易狀態、事件、買賣方操作 token。
- `dashboard.html` / `public/dashboard.html`：PM dashboard。
- `dashboard.js` / `public/dashboard.js`：讀取 `/api/metrics` 聚合指標。
- `styles.css` / `public/styles.css`：全站樣式、RWD、動畫、信任區塊。

### Worker / DB

- `src/worker.js`：API、rate limit、安全標頭、風險規則、交易/事件/回饋/metrics。
- `migrations/0001_init.sql`：`deals`、`deal_events`。
- `migrations/0002_feedback_and_rate_limits.sql`：`feedback`、`rate_limits`。
- `wrangler.toml`：Worker、Assets、D1、vars、observability。

### 策略與營運文件

- `SECURITY_PM_HANDOFF.md`：資安主管交付、MVP 風險與 7 天市場驗證。
- `SALES_COMMANDER_PLAYBOOK.md`：零預算冷啟動、人脈與業務作戰。
- `BOSS_PLATFORM_STRATEGY_MEMO.md`：回覆老闆關於傳統平台抽成、賣貨便弱點、USDT/USDC 門檻。
- `LOGISTICS_INTEGRATION_PLAN.md`：物流功能階段路線。
- `LOGISTICS_API_DECISION_MEMO.md`：自建物流 vs 統合 API 決策。
- `COMMUNITY_OUTREACH_TEMPLATES.md`：FB/LINE 群主私訊、社團貼文、圖卡/Reels 草案。
- `META_CONTENT_OPERATING_PLAN.md`：FB / IG / Threads 帳號經營與穩定幣科普邊界。
- `IDENTITY_SAFETY_STRATEGY.md`：面交安全、分級驗證、信任徽章、隱私與公平。
- `FEEDBACK_SOP.md`：每週看 D1 feedback 的 SOP。
- `CLOUDFLARE_RUNBOOK.md`：Cloudflare 操作與 secrets。

## API 現況

### 已有 endpoint

- `GET /api/health`
- `POST /api/deals`
- `GET /api/deals/:public_code`
- `POST /api/deals/:public_code/events`
- `POST /api/feedback`
- `GET /api/metrics`

### 安全控制

- 安全標頭：CSP、no-referrer、nosniff、frame deny 等。
- D1 prepared statements。
- JSON body size limit。
- Rate limit：建單、讀取、事件、回饋。
- 高風險品類 blocking：票券、禮品卡、點數、遊戲幣、帳號、精品、代儲、金融、投資、虛擬帳戶、門號。
- 前端 escape，避免使用者輸入 XSS。
- Metrics API 只回聚合資料，不回 token、contact、原始 message。
- Turnstile hook 已預留，但目前 `TURNSTILE_ENFORCED = "false"`。

## 目前產品能力

- 建立交易條件連結。
- 顯示公開交易狀態頁。
- 產生 seller / buyer 操作連結。
- 商品、金額、出貨期限、驗收期限、交易方式。
- 物流 MVP：店到店物流選項、運費誰付、預估運費、長寬高重量、物流提醒。
- 面交安全與未來信任徽章定位已寫入 landing page。
- 回饋表單：角色、場景、付費意願、聯絡方式、建議。
- PM dashboard：交易數、回饋數、狀態分布、付費意願、使用場景聚合。

## 明確不能宣稱

後續 agent 不要改成以下說法，除非已有正式法務/商務/技術支撐：

- 不要說平台保證安全。
- 不要說防詐保證。
- 不要說官方合作 7-11 / 全家 / 萊爾富。
- 不要說一鍵寄件，除非真的串接正式 API。
- 不要說 escrow、託管、代收、退款保證。
- 不要說 USDT / USDC 安全、保本、推薦投資。
- 不要說金管會認證交易所，只能說「依主管機關公告自行查詢 VASP 洗錢防制登記」。
- 不要公開黑名單或使用者個資。

## 重要產品決策

### 1. 不先碰金流

目前不做付款、代收、託管、穩定幣轉帳。先做交易條件與證據流程。

### 2. 物流先超商店到店

Phase 1：7-11 / 全家 / 萊爾富店到店條件紀錄。  
Phase 2：郵局 / 黑貓 / 宅配通等宅配手動選項。  
Phase 3+：才評估綠界 / ezShip 等統合 API。

### 3. 身分驗證不叫 KYC

叫「信任徽章」、「面交安全卡」、「可選身分確認」。先做 Level 0-3，不自行保存證件。

### 4. 市場優先於功能

下一步應先拿真實用戶 feedback，不要一直加功能。核心指標：3 筆真實商品交易連結、10 則有效回饋、1 位賣家願意貼給買方。

## 已部署版本

- 最新功能 commit：`d7bac02`；handoff 文件 commit 請以 GitHub 最新 commit 為準。
- 最新 Cloudflare Worker version：`246d85e6-a430-4f5d-9ced-baf356f33631`
- 最新 GitHub Pages run：`28234901780`，已成功。

## 開發指令

```bash
npm install
npm run dev
npm run deploy
npm run db:remote
```

語法檢查：

```bash
node -c src/worker.js
node -c app.js
node -c deal.js
node -c dashboard.js
node -c public/app.js
node -c public/deal.js
node -c public/dashboard.js
```

基本 smoke test：

```bash
curl https://secondhand-safe-trade-api.smartmmmoney.workers.dev/api/health
curl https://secondhand-safe-trade-api.smartmmmoney.workers.dev/api/metrics
```

## 後續 agent 優先任務

### P0：收 feedback，不加重功能

- 按 `SALES_COMMANDER_PLAYBOOK.md` 私訊 30 位目標。
- 使用 `COMMUNITY_OUTREACH_TEMPLATES.md` 貼文/私訊。
- 將回覆填入 `sales_pipeline.csv`。
- 每週依 `FEEDBACK_SOP.md` 看 D1 feedback。

### P1：物流手動貨態

- D1 schema 新增物流欄位，或先用 deal_events 記錄物流事件。
- seller 操作頁可填物流單號。
- public page 顯示物流時間線。
- 不自動取號。

### P2：面交安全卡

- 表單加入面交地點類型、驗貨時間、改地點規則。
- 狀態頁顯示面交安全提醒。
- 不收身分資料。

### P3：Turnstile

- Cloudflare 建 Turnstile site key / secret。
- 設定 `TURNSTILE_SECRET_KEY`。
- 前端嵌 widget。
- `TURNSTILE_ENFORCED = "true"`。

### P4：內容營運

- 依 `META_CONTENT_OPERATING_PLAN.md` 建 FB / IG / Threads。
- 先發 10 篇知識型內容，不急著推穩定幣。
- 穩定幣科普務必加免責。

## 目前資料庫注意事項

早期測試曾用 PowerShell 送中文 JSON，造成少數 D1 測試資料 mojibake。這不影響程式，但後續 demo 若查 D1 看到 `????` 是測試資料問題，不是目前前端 encoding 問題。請用 Node/fetch 或瀏覽器送 UTF-8。

## 編碼注意事項

避免用 PowerShell `Get-Content | Set-Content` 直接改中文檔，曾造成亂碼。建議用 Node 腳本 `fs.readFileSync(..., 'utf8')` / `fs.writeFileSync(..., 'utf8')` 修改。

## Git / 部署流程

1. 修改 root 與 `public/` 對應檔案。
2. 跑 `node -c`。
3. 跑 `npm run deploy`。
4. 線上驗證。
5. `git add`、`git commit`、`git push`。
6. 用 `gh run list` / `gh run watch` 確認 Pages 成功。

## 交接狀態

截至本文件建立：

- 工作樹應為乾淨狀態後提交本文件。
- Cloudflare 正常。
- GitHub Actions 正常。
- 下個 agent 可直接從 `README.md` 與本文件開始。
