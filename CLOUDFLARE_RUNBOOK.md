# MochiLock Cloudflare Runbook

## 需要 owner 配合

1. Cloudflare API Token
   - 權限：Workers Scripts Edit、D1 Edit、Account Read。
   - 建議用最小權限 token，不要給 Global API Key。

2. Cloudflare Account ID
   - 在 Cloudflare Dashboard 右側可看到。

3. 建立 D1 database

```bash
npx wrangler login
npx wrangler d1 create mochilock-db
```

把輸出的 `database_id` 填入 `wrangler.toml`：

```toml
database_id = "..."
```

4. 套用 schema

```bash
npm install
npm run db:remote
```

5. 部署 Workers + 靜態資產

```bash
npm run deploy
```

## GitHub Secrets

若要 GitHub Actions 自動部署 Cloudflare，新增：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## MVP 範圍

目前後端只做交易流程紀錄：

- 建立交易
- 查交易
- 賣方標記出貨
- 買方確認收貨
- 買方提出爭議

目前不做：

- 真實 escrow
- 真實 USDC/USDT 收付款
- KYC
- 換幣
- 法幣出入金
- 平台錢包
