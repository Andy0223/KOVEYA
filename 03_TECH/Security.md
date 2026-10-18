# Security Plan

目前已實作登入、Session、私人帳號與個人業務寫入 API。僅通過本機測試，未達正式上線安全驗收。

## 已有基礎

參數化 Drizzle 查詢、公開欄位白名單、只讀 published provider／service 及 active organization、slug 驗證、標準錯誤、Request ID、no-store、基本安全 headers。複合租戶外鍵防止資料引用錯配，不能替代 API 授權。

## 已實作的身分保護

Email token 使用安全隨機值、資料庫只存 hash、短效且原子消耗；限制寄送與驗證頻率，回應避免帳號枚舉。Session 使用 HttpOnly、Secure（正式環境）、SameSite cookie，驗證 expiry、revoked 狀態及帳號狀態。登出撤銷伺服器紀錄。

Cookie 寫入採同源 Origin／CSRF 保護；returnTo 只允許本地路徑，不能開放 redirect。身份來源為伺服器驗證 Session，不能信任前端 user_id。

## 權限與營運

每次查詢限制 org_id 與可執行操作。需求方必須是該預約的客戶；供給方必須有對應租戶角色。平台支援存取需理由、授權與稽核。敏感資訊不進 log。

輸出預設文字，不直接 render HTML；圖片上傳限制大小、格式、來源及可見範圍。Secrets 存於本機忽略檔／Cloudflare secret，不能提交或前端打包。

Email／IP／帳號寫入具備 D1 固定視窗限流；輸入以 Zod strict schema 驗證，寫入上限 16KB。驗證連結綁定瀏覽器，token 以 fragment 傳遞並於確認頁清除；消耗 token 與建立身分／Session 同批次提交。

完整 CSP、管理後台授權、外部通知重試及告警待對應模組實作。正式使用前依測試矩陣獨立審查。

本機驗證入口同時檢查明確旗標與 loopback hostname；沒有全域可讀信箱 API。正式環境缺少 APP_ORIGIN 或寄信設定時關閉登入寄送。測試中的原始 token、Session 及本機資料夾不進 Git。

供給方只可操作 owner membership 與 active organization 同時成立的個人業務。跨租戶物件回 404，不暴露是否存在；所有讀寫均從驗證 Session 取得 user_id，不信任前端傳入的身分。服務編輯用 revision + mutation nonce 防止部分更新與競爭覆寫。
