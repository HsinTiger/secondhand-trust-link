
## 2026-06-29 PM 收斂註記

- 首頁與建單流程已降級為「台幣約定金額 + 付款方式備註」，不再主打 USDC/USDT 或匯率提示。
- AI 驗證入口已從交易頁隱藏，API 明確回 `verification_disabled`；MVP 改用人工證據檢查清單。
- D1 migration 已改成可重放鏈：舊 `0001` 不再新增欄位，`0004` 補上 description/currency。
- 公開 API 不再回傳 seller/buyer token，public 靜態站不再公開內部 handoff / migration / strategy 文件。

# 二手安心交易 Worklog

**專案：** secondhand-trust-link
**報告期間：** 2026-06-27 ～ 2026-06-28
**執行者：** Claude Code (Opus 4.8) + Founder
**部署：** Cloudflare Workers + D1 + GitHub Pages

---

## 總覽

| 指標 | 數值 |
|------|------|
| Git commits | 5 |
| 改動檔案數 | 13 |
| 新增行數 | +865 |
| 刪除行數 | -24 |
| 核心程式碼行數 | 1,793 行 |
| D1 migration | 3 (init + feedback + shipping/verify/pickup) |
| API endpoints | 10 (原 6 → 現 10) |

---

## API Endpoints 現況

| Method | Endpoint | 說明 | 驗證 |
|--------|----------|------|------|
| GET | `/api/health` | 健康檢查 | 無 |
| POST | `/api/deals` | 建立交易 | Turnstile + Rate Limit |
| GET | `/api/deals/:code` | 取得交易詳情（含 shipping + verification） | Rate Limit |
| POST | `/api/deals/:code/events` | 新增事件（出貨/確認/爭議） | Token |
| POST | `/api/deals/:code/shipping` | 賣家填入物流單號 | Seller Token |
| POST | `/api/deals/:code/verify` | 觸發 AI 出貨前驗證 | Seller Token |
| GET | `/api/deals/:code/pickup?token=` | 查詢買方取貨資訊 | Buyer/Seller Token |
| POST | `/api/deals/:code/pickup` | 買方填入取貨資訊 | Buyer Token |
| POST | `/api/feedback` | 送出回饋 | Turnstile + Rate Limit |
| GET | `/api/metrics` | 聚合指標 | Rate Limit |

---

## D1 Database Schema

### Table: deals (updated)

```sql
CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  public_code TEXT UNIQUE NOT NULL,
  seller_code TEXT UNIQUE NOT NULL,
  buyer_code TEXT UNIQUE NOT NULL,
  item TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',     -- NEW: 商品描述（給 AI 比對用）
  amount_usdc TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',    -- NEW: 幣別 (USDC/USDT)
  method TEXT NOT NULL,
  ship_by TEXT NOT NULL,
  inspect TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  seller_contact TEXT,
  buyer_contact TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Table: shipping (NEW — migration 0003)

```sql
CREATE TABLE shipping (
  id TEXT PRIMARY KEY,
  deal_id TEXT UNIQUE NOT NULL,
  carrier TEXT NOT NULL DEFAULT '',         -- 物流商
  tracking_number TEXT NOT NULL DEFAULT '',  -- 物流單號
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);
```

### Table: verifications (NEW — migration 0003)

```sql
CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  check_type TEXT NOT NULL,                 -- pre_shipment / post_receipt
  provider TEXT NOT NULL DEFAULT 'cloudflare',
  result_json TEXT NOT NULL,                -- AI 回傳的完整 JSON
  score REAL NOT NULL DEFAULT 0,            -- 0-100 分
  verdict TEXT NOT NULL DEFAULT 'pending',  -- pass / warn / fail / pending / error
  created_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);
```

### Table: buyer_pickup (NEW — migration 0003 手動補建)

```sql
CREATE TABLE buyer_pickup (
  id TEXT PRIMARY KEY,
  deal_id TEXT UNIQUE NOT NULL,
  pickup_name TEXT NOT NULL DEFAULT '',     -- 收件人姓名
  pickup_phone TEXT NOT NULL DEFAULT '',    -- 聯絡電話
  pickup_store TEXT NOT NULL DEFAULT '',    -- 取貨門市
  pickup_store_code TEXT NOT NULL DEFAULT '',-- 門市代碼
  note TEXT NOT NULL DEFAULT '',            -- 備註
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);
```

---

## Commit 記錄

### Commit 1: `867ec1a` — 2026-06-27 13:38
**feat: enable Cloudflare Turnstile bot protection**

| 檔案 | 改動 |
|------|------|
| `wrangler.toml` | `TURNSTILE_SITE_KEY` 補入 site key，`TURNSTILE_ENFORCED` 改為 `true` |
| `index.html` | 載入 Turnstile script，兩處嵌入 `cf-turnstile` widget（建單表單 + 回饋表單） |
| `app.js` | 新增 `turnstileToken` 管理、`resetTurnstile()` 函數，每次送出後重置 |
| `styles.css` | `.cf-turnstile` 間距 |

**Cloudflare 設定：**
- Site Key: `0x4AAAAAADryFUGyHZ-B9lGh`
- Secret Key: 透過 `wrangler secret put TURNSTILE_SECRET_KEY` 存入 Cloudflare
- Widget Mode: Managed
- Hostname: `secondhand-safe-trade-api.smartmmmoney.workers.dev`

---

### Commit 2: `7cadfc9` — 2026-06-27 15:39
**feat: add logistics, AI verification, and USDC currency support**

| 檔案 | 改動 |
|------|------|
| `migrations/0003_shipping_and_verification.sql` | 新建 shipping + verifications 表 |
| `migrations/0001_init.sql` | deals 表新增 `description` + `currency` 欄位 |
| `src/worker.js` | +113 行：`addShipping()`、`addVerification()`、物流商 CARRIERS 常量、rate limit 擴充 |
| `deal.js` | +126 行：物流表單、AI 驗證表單 + badge 顯示、USDC 金額顯示 |
| `app.js` | 商品描述 textarea、currency payload |
| `index.html` | 商品描述欄位、金額標示改為 USDC |
| `styles.css` | 物流 + 驗證卡片間距 |

**新增 API：**
- `POST /api/deals/:code/shipping` — 賣家填入物流商 + 單號
- `POST /api/deals/:code/verify` — 觸發 Cloudflare Workers AI 圖像驗證

**AI 驗證架構：**
- 模型：`@cf/meta/llama-3.2-11b-vision-instruct`（Cloudflare Workers AI 免費）
- 輸入：商品照片 URL + 商品描述
- 輸出：結構化 JSON（overall_score、verdict、warnings）
- 判定：score ≥ 70 = pass / 40-69 = warn / < 40 = fail

** Migration 執行：** `wrangler d1 migrations apply secondhand-safe-trade-db --remote`

---

### Commit 3: `b3d898c` — 2026-06-27 19:15
**feat: USDC/USDT currency selector with live price hint**

| 檔案 | 改動 |
|------|------|
| `index.html` | 金額欄位改為 `金額 + 幣別下拉` (USDC/USDT)，新增 `#priceHint` |
| `app.js` | CoinGecko API 串接，`fetchStablecoinPrice()` + `updatePriceHint()` |
| `styles.css` | `.amount-input-row` grid、`.price-hint` 樣式 |

**即時匯率：**
- 來源：CoinGecko API (`api.coingecko.com`)
- 項目：USDC/USD、USDT/USD
- 快取：5 分鐘

---

### Commit 4: `bdeebd2` — 2026-06-27 19:58
**feat: multi-source live stablecoin price (Taiwan Bank + CoinGecko)**

| 檔案 | 改動 |
|------|------|
| `app.js` | 重寫 `fetchPrices()`：CoinGecko（USDC/USDT 價格）+ 台灣銀行 CSV（USD/NTD 匯率）|
| `app.js` | `updatePriceHint()` 顯示格式：`1 USDC ≈ NT$ 31.8 ｜ 1 USDT ≈ NT$ 31.8 ｜ 匯率來源：台灣銀行 + CoinGecko` |

**雙源架構：**
- Source 1：CoinGecko — USDC/USD、USDT/USD
- Source 2：台灣銀行 rate.bot.com.tw — USD/NTD 即期匯率 CSV
- 容錯：任一源失敗即用另一個，不白屏
- 匯率：台灣銀行本行買入 31.785 / 賣出 31.935（2026-06-27 09:25 更新）

---

### Commit 5: `52d7d0a` — 2026-06-28 00:42
**feat: buyer pickup info flow for convenience store shipping**

| 檔案 | 改動 |
|------|------|
| `src/worker.js` | +60 行：`addBuyerInfo()`、`getBuyerInfo()` |
| `migrations/0003_shipping_and_verification.sql` | 新增 buyer_pickup 表 |
| `deal.js` | +106 行：買方取貨表單、賣方取貨資訊卡片 |

**新增 API：**
- `POST /api/deals/:code/pickup` — 買方填入姓名、電話、門市
- `GET /api/deals/:code/pickup?token=` — 賣方看完整資訊 / 買方看「已填寫」

**取貨門市選項：**
- 7-11（15 間門市）
- 全家（11 間門市）
- 萊爾富（6 間門市）
- 門市代碼欄位（選填，方便 ibon 操作）

**Migration 執行：** 手動 `wrangler d1 execute` 建立 buyer_pickup 表

---

## 完整交易流程（目前可跑）

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 賣家建立交易                                               │
│    → 填商品名稱、描述、金額(USDC/USDT)、出貨期限、驗收期        │
│    → 系統產生：公開頁連結 + 賣方連結 + 買方連結                  │
│    → AI 風險檢查（高單價、3C、面交提醒）                        │
├─────────────────────────────────────────────────────────────┤
│ 2. 賣家把「買方連結」貼給買方                                   │
│    → LINE / Facebook / 直接私訊                               │
├─────────────────────────────────────────────────────────────┤
│ 3. 買方開連結                                                  │
│    → 看到商品資訊、金額、交易方式、出貨/驗收期限                  │
│    → 填取貨資訊：姓名、電話、取貨門市（7-11/全家/萊爾富）         │
├─────────────────────────────────────────────────────────────┤
│ 4. 賣方開自己的連結                                            │
│    → 看到買方取貨資訊（姓名、電話、門市）                        │
│    → 可選：上傳出貨前照片 → AI 驗證                             │
├─────────────────────────────────────────────────────────────┤
│ 5. 賣方去超商寄件                                              │
│    → ibon / FamiPort / Life-ET                                │
│    → 輸入買方姓名、電話、門市代碼                               │
│    → 列印寄貨單、付款 NT$60                                    │
├─────────────────────────────────────────────────────────────┤
│ 6. 賣方回到交易頁填入物流單號                                   │
│    → 選物流商、填追蹤號碼                                      │
│    → 系統自動更新狀態為「已出貨」                                │
├─────────────────────────────────────────────────────────────┤
│ 7. 買方收到貨                                                  │
│    → 在交易頁按「確認收貨」                                     │
│    → 交易完成                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 已知限制 & 未來 TODO

### 目前不做

| 項目 | 原因 |
|------|------|
| 金流 / escrow | MVP 先驗證需求，不做資金保管 |
| 智能合約 | Phase 2（Base L2 + USDC） |
| 自動物流追蹤 | 超商無公開 API，需綠界串接（Phase 1） |
| 買方個資隱私 | 方案 B：賣家直接看到買方姓名電話（Phase 1 改用 ECPay 仲介） |
| 影片上傳 | 只做 URL 輸入，不上傳實體檔案 |

### Phase 1 計畫

- [ ] ECPay / 綠界物流 API 串接（自動產生寄貨單、追蹤貨態）
- [ ] R2 圖片上傳（取代 URL 輸入）
- [ ] 面交安全卡（公開場所建議、QR code 確認）
- [ ] AI 收貨比對（Check #2：買家照片 vs 賣家出貨前照片）

### Phase 2 計畫

- [ ] Base L2 + USDC 智能合約 escrow
- [ ] SecondhandEscrow.sol 部署
- [ ] Oracle Worker（CF Workers AI → Base L2 橋接）
- [ ] WalletConnect 錢包連接

---

## 部署資訊

| 資源 | 路徑 / ID |
|------|-----------|
| Cloudflare Worker | `secondhand-safe-trade-api` |
| D1 Database | `secondhand-safe-trade-db` (`2d0d88f5-...`) |
| 正式站 | https://secondhand-safe-trade-api.smartmmmoney.workers.dev |
| GitHub Pages 備援 | https://hsintiger.github.io/secondhand-trust-link/ |
| GitHub Repo | https://github.com/HsinTiger/secondhand-trust-link |
| Turnstile | Site Key `0x4AAAAAADryFUGyHZ-B9lGh` |
| Account ID | `6558ce939bc4a9874939ad2bdcc333bf` |

---

## 測試報告

### API Health Check
```
GET /api/health → 200 OK
{"ok":true,"service":"secondhand-safe-trade-api"}
```

### Metrics API
```
GET /api/metrics → 200 OK
deals.total: 10 (all in "created" status)
feedback.total: 4
feedback.by_willingness: 全部 "每筆 NT$3-10"
feedback.by_use_case: FB 二手社團 / 二手3C / 二手相機 / 二手筆電
```

### Turnstile Protection
```
POST /api/deals (無 token) → 403 {"error":"turnstile_required"} ✅
POST /api/deals (dummy token) → 403 {"error":"turnstile_failed"} ✅
```

### 即時匯率（2026-06-28 16:48 UTC+8）
```
CoinGecko: USDC = $0.9998 USD, USDT = $0.9987 USD
台灣銀行: USD/NTD 即期 = 31.80 (買入 31.785 / 賣出 31.935)
顯示: 1 USDC ≈ NT$ 31.8 ｜ 1 USDT ≈ NT$ 31.8
```

### 站點可用性
```
Cloudflare Workers: HTTP 200 ✅
GitHub Pages: HTTP 200 ✅
```

---

*本文件由 Claude Code (Opus 4.8) 自動生成，2026-06-28*
