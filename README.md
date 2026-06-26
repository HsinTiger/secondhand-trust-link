# 二手安心交易

二手安心交易是一個針對 FB 社團、LINE 群、面交與二手小額買賣的 MVP。目標不是取代大型交易平台，而是用一個低門檻交易連結，把商品條件、付款鎖定、出貨留證、驗收期限、爭議紀錄與使用者回饋整理清楚。

正式站：`https://secondhand-safe-trade-api.smartmmmoney.workers.dev`
GitHub Pages 備援展示：`https://hsintiger.github.io/secondhand-trust-link/`

## MVP scope

目前版本包含：

- Cloudflare Workers API + static assets。
- D1 database：交易、事件、回饋、rate limit。
- 建立交易連結與交易狀態頁。
- 建立交易後的風險提示：高單價、二手 3C、面交安全提醒。
- 市場回饋表單：角色、使用情境、願付費訊號、聯絡方式。
- LINE / Facebook 分享入口。
- SEO 長尾指南頁、`sitemap.xml`、`robots.txt`。
- 基本資安防護：安全標頭、輸入驗證、D1 rate limit、Turnstile 預留。

## Non-custodial boundaries

此 MVP 目前不處理真實資金，也不是 escrow provider、exchange、broker、money transmitter、wallet operator、payment processor 或金融機構。

目前不做：

- 保管、接收、池化或控制使用者資金或數位資產。
- crypto swap、幣幣交換、法幣出入金。
- 平台錢包、託管私鑰、帳號恢復服務。
- 自動仲裁、保證退款、保證防詐。
- 法律、稅務、金融、投資建議。

## Local development

```bash
npm install
npm run dev
```

## Deploy

Cloudflare：

```bash
npm run db:remote
npm run deploy
```

GitHub Pages 會由 `.github/workflows/pages.yml` 自動部署 root 靜態檔。
Cloudflare Workers 可由 `.github/workflows/cloudflare.yml` 手動觸發。

## Key docs

- `CLOUDFLARE_RUNBOOK.md`：Cloudflare GUI/CLI 部署與 secrets。
- `FEEDBACK_SOP.md`：每週回饋查詢與 Go/No-Go 判斷。
- `PM_GTM_BRIEF.md`：市場測試與 PM 行銷策略。
- `TECH_ROADMAP.md`：Escrow、AI 審查、零成本技術路線。

## Open-source strategy recommendation

建議 open-core：

- 可公開：前端、文案、SEO 頁、交易狀態機、法遵邊界、部署流程。
- 暫不公開：未來仲裁後台、反詐規則細節、金流/VASP 整合、內部營運資料。

原因：透明能建立信任，但完整風控規則若公開，可能被惡意買賣家反向利用。


## Zero-budget sales motion

- `SALES_COMMANDER_PLAYBOOK.md`：零預算冷啟動、人脈拓展、社群貼文、私訊話術。
- `sales_pipeline.csv`：每日私訊、回覆、下一步追蹤表。
