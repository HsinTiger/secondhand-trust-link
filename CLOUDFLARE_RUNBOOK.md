# 二手安心交易 Cloudflare Runbook

## 已部署資源

- Worker：`secondhand-safe-trade-api`
- D1：`secondhand-safe-trade-db`
- 正式站：`https://secondhand-safe-trade-api.smartmmmoney.workers.dev`
- Account ID：`6558ce939bc4a9874939ad2bdcc333bf`

## GitHub Secrets

目前 GitHub Actions 使用：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_FOR_SECOND_HAND`

workflow 內會把 `CLOUDFLARE_API_FOR_SECOND_HAND` 映射成 Wrangler 需要的 `CLOUDFLARE_API_TOKEN`。

## Cloudflare GUI 確認

1. Cloudflare Dashboard → Workers & Pages。
2. 找 `secondhand-safe-trade-api`。
3. `Deployments` 可看版本。
4. `Logs` 可看 invocation logs。
5. Storage & Databases → D1 → `secondhand-safe-trade-db` 可查資料。

## 本機部署

```bash
npm install
npm run db:remote
npm run deploy
```

## GitHub Actions 手動部署

1. GitHub repo → Actions。
2. 選 `Deploy to Cloudflare Workers`。
3. 點 `Run workflow`。
4. branch 選 `main`。

## Turnstile 預留

Worker 已支援 `TURNSTILE_SECRET_KEY`，但目前沒有設定 secret，所以不會阻擋表單。

若要啟用：

1. Cloudflare Dashboard → Turnstile。
2. 建立 site，取得 Site Key 與 Secret Key。
3. Worker secret 設定：

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

4. 前端再加入 Turnstile widget，將 token 寫入 `window.turnstileToken`。

## 常用 D1 查詢

```sql
SELECT created_at, item, amount_usdc, method, status
FROM deals
ORDER BY created_at DESC
LIMIT 20;
```

```sql
SELECT created_at, role, use_case, willingness, contact, message
FROM feedback
ORDER BY created_at DESC
LIMIT 50;
```

## MVP 範圍

目前只做交易流程紀錄與市場回饋，不做真實 USDC/USDT 收付款、不做 KYC、不做換幣、不做法幣出入金、不做平台錢包。
