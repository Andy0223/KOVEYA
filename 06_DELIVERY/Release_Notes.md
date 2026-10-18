# Release Notes

## 0.2.0 Identity & Provider — 2026-10-19

新增 Email 驗證連結、七天 Session、雙工作模式、帳號資料及隱私申請、個人品牌、服務草稿／編輯／發布／下架。公開頁讀取真正發布的服務，未登入不能管理私人資料。

安全保護包含十分鐘一次性連結、瀏覽器綁定、hash 儲存、Session 撤銷、Origin／JSON／16KB 限制、限流、租戶範圍、操作稽核及服務 revision／mutation guard。新增身份失敗注入、並發驗證、越權與編輯競爭測試。

本機明確啟用驗證預覽，不寄真實 Email；正式 Resend adapter 尚待 secrets、寄件網域與實際寄送驗證。品牌圖片、隱私案件人工處理、排班與預約交易仍待完成。此版本不是完整 MVP。

E2E 使用獨立 D1 及正式 build；CI 固定 Ubuntu 24.04 並更新 Actions runtime。驗證快照見 [Progress](Progress.md)。

## 0.1.0 Foundation — 2026-10-18

建立策略、產品、UX、技術、營運、測試及交付文件。15 模組需求以結構化資料追蹤，原文通知矩陣新增 NTF 編號。

React／TypeScript／Vite／Tailwind 與 Hono／Workers／D1／Drizzle 專案，可本機初始化虛構供給方資料。新增雙語首頁、工作模式介紹、公開供給方頁、服務內容與政策展開、載入及錯誤狀態。

提供初始 schema、migration、半開時段含緩衝配置、Booking 終態判斷，以及型別、單元、資料庫約束、瀏覽器及文件檢查。最終驗證結果見 [進度紀錄](Progress.md)。

限制：登入、服務管理、完整排班及預約交易、通知、CRM、管理後台未實作；無正式部署、外部資源或真實交易。`/app`、`/business` 為工作模式介紹。
