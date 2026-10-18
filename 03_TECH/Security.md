# Security Plan

目前公開唯讀 API 不處理登入或私人資料。未達正式上線安全驗收。

## 已有基礎

參數化 Drizzle 查詢、公開欄位白名單、只讀 published provider／service 及 active organization、slug 驗證、標準錯誤、Request ID、no-store、基本安全 headers。複合租戶外鍵防止資料引用錯配，不能替代 API 授權。

## 身分階段必做

Email token 使用安全隨機值、資料庫只存 hash、短效且原子消耗；限制寄送與驗證頻率，回應避免帳號枚舉。Session 使用 HttpOnly、Secure（正式環境）、SameSite cookie，驗證 expiry、revoked 狀態及帳號狀態。登出撤銷伺服器紀錄。

Cookie 寫入採同源 Origin／CSRF 保護；returnTo 只允許本地路徑，不能開放 redirect。身份來源為伺服器驗證 Session，不能信任前端 user_id。

## 權限與營運

每次查詢限制 org_id 與可執行操作。需求方必須是該預約的客戶；供給方必須有對應租戶角色。平台支援存取需理由、授權與稽核。敏感資訊不進 log。

輸出預設文字，不直接 render HTML；圖片上傳限制大小、格式、來源及可見範圍。Secrets 存於本機忽略檔／Cloudflare secret，不能提交或前端打包。

Rate limit、完整 CSP、登入保護、管理員稽核、外部服務重試及告警待對應模組實作。正式使用前依測試矩陣獨立審查。
