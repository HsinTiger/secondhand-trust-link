# Feedback Review SOP

目標：每週用 15 分鐘看回饋，決定 MVP 下一步，不靠感覺做功能。

## Cloudflare D1 GUI 查詢

1. Cloudflare Dashboard → Storage & Databases → D1 SQL Database。
2. 進入 `secondhand-safe-trade-db`。
3. 點 `Console` / `Query`。
4. 執行：

```sql
SELECT created_at, role, use_case, willingness, contact, message
FROM feedback
ORDER BY created_at DESC
LIMIT 50;
```

## 每週要整理的 4 個問題

- 哪一種角色最多：買家、賣家、代購、小賣家、群主？
- 哪一種場景最多：二手 3C、面交、LINE 代購、模型公仔？
- 願付費訊號是否存在：NT$3-10、0.5%-1%、月費？
- 使用者最怕哪一步：不出貨、不取貨、商品不符、面交安全？

## Go / No-Go 指標

- 7 天內至少 10 則有效回饋：繼續做下一版。
- 30 天內 30 位賣家或群主願意試用：開始做交易操作完整度。
- 願付費訊號低於 10%：先不要做金流，改做社團防詐工具。

## 不要做的解讀

- 不要把朋友稱讚當市場需求。
- 不要把瀏覽量當成功，重點是建立交易與回饋。
- 不要因為一個人要求就做大型功能。
