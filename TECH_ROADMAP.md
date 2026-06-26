# 二手安心交易技術路線：Escrow、AI 審查、零成本 MVP

此文件是產品/工程規劃，不是法律意見或資安審計。

## 1. Escrow 建議用哪條鏈？

結論：先用 **Base Sepolia 測試網**，正式 PoC 再上 **Base L2 + USDC**，不要一開始上 Ethereum L1。

### 為什麼不是 Ethereum L1

- L1 gas 對小額二手交易太貴。
- 使用者認知門檻高。
- 每筆交易成本可能吃掉低手續費優勢。

### 為什麼先用 L2

- Base / Polygon / Arbitrum 這類 L2 成本較低。
- Base 與 USDC 生態成熟，適合小額支付體驗。
- 測試網可以用 faucet 領測試幣，先零成本驗證流程。

### 零成本順序

1. 先做純前端 demo。
2. 用 Base Sepolia 部署測試合約。
3. 用測試 USDC 或 mock ERC20 跑流程。
4. 完成 100 筆測試交易後，再考慮 mainnet。

## 2. 智能合約安全原則

你是 RTL designer，可以把合約想成「不可隨便 patch 的狀態機」。設計重點是簡單、可驗證、少權限。

### 狀態機

```txt
Created -> Funded -> Shipped -> Inspection -> Released
                         |             |
                         v             v
                      Disputed      Refunded
```

### 合約必備限制

- 只接受指定 token，例如 USDC。
- 每筆交易固定 buyer / seller / amount。
- 狀態只能單向轉移。
- release/refund 只能在條件成立時呼叫。
- 爭議狀態下禁止直接撥款。
- 平台仲裁權要用 multisig，不用單一私鑰。

### 防攻擊基本原則

- Checks-Effects-Interactions：先檢查、再改狀態、最後轉帳。
- ReentrancyGuard：避免重入攻擊。
- SafeERC20：處理非標準 ERC20 回傳。
- Pausable：緊急停止新交易。
- Pull payment / 明確 release：避免自動亂轉。
- 最小權限：平台不能任意拿走資金。
- 事件完整：所有狀態變更 emit event，方便前端可視化。

### 第一版不要做

- 不做升級合約 proxy。
- 不做複雜分潤。
- 不做多 token。
- 不做鏈上儲存照片/個資。
- 不做自動判定真假貨。

## 3. AI 審查能力要不要加？

建議加，但定位為 **輔助風控與證據整理**，不要讓 AI 直接裁決誰輸誰贏。

### AI 可以做

- 商品描述風險：禁售品、票券、點數卡、仿冒疑慮。
- 對話風險：催促私下付款、跳過流程、疑似詐騙話術。
- 證據整理：出貨照、開箱照、物流單、付款紀錄整理成時間線。
- 爭議摘要：整理雙方主張與缺少的證據。

### AI 不該做

- 不直接判定詐騙。
- 不直接裁決放款/退款。
- 不處理高度敏感個資。
- 不把 API key 放前端。

### 低成本模型路線

- 規則引擎先行：禁售品 keyword、交易金額、歷史爭議率。
- 便宜 LLM API：Cloudflare Workers AI、Groq、Hugging Face Inference Providers。
- 多模態圖片審查第二階段再做，因為成本和誤判都更高。

## 4. 使用者認知門檻

首頁與交易頁不應主打「區塊鏈」，而是主打：

- 付款有紀錄。
- 出貨有紀錄。
- 驗收有期限。
- 爭議有證據。
- 撥款規則可查。

區塊鏈只在「進階查看」中顯示：

- tx hash
- contract address
- event log
- evidence hash

## 5. 品牌方向

二手安心交易 = 直白、可信、低門檻。

- Mochi：降低 Web3/金融感，像日常小工具。
- Lock：表達交易鎖款、安全流程。
- 小 IP：安心盾牌、交易勾勾、清楚可靠的流程感。

## 6. 下一個工程 MVP

1. Cloudflare Workers API：建立交易、查狀態。
2. D1/Supabase：存 deals、events、evidence metadata。
3. Base Sepolia mock escrow 合約。
4. 前端 WalletConnect 測試網連線。
5. AI 規則引擎：先做 keyword + checklist，不急著上 LLM。
