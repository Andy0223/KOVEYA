# Progress

## 2026-10-18 — Foundation

已建立 Git origin、策略／產品／UX／技術／營運／測試／交付文件、173 條功能需求與 15 模組對照；新增 NTF ID 對應原通知矩陣。

程式包含雙語首頁、公開供給方及服務頁、工作模式介紹、公開 API、D1 初始 schema／migration、虛構 seed、基礎排程規則、CI 與測試。

本機 D1 migration 及 seed 成功。以下為本次 Foundation 驗證結果：

| 檢查 | 結果 |
|---|---|
| TypeScript | 通過前端、Worker、工具與測試型別檢查 |
| Vitest | 24 項通過；排程、狀態、API 邊界及 SQLite 約束 |
| Playwright | 10 項通過；桌面及模擬手機、語言、服務頁、草稿與私有欄位排除、320px |
| 文件 | 173 條需求、15 模組、Markdown 連結及 OpenAPI YAML 檢查通過 |
| Build | 前端與 Worker 建置通過 |
| 依賴 | npm audit 0 項已知漏洞；Drizzle 工具的 esbuild 間接依賴已覆寫修正 |
| 畫面 | 已檢視桌面首頁、手機首頁與供給方頁截圖 |

上述不等於完整 P0、D1 併發、真實手機或正式安全審查通過。

Foundation 已推送為 `3c6a8c2`，GitHub CI 通過。此為當時驗證快照；後續進度見下。

## 2026-10-19 — Identity & Provider v0.2

已可在本機完成：Email 一次性連結 → 同瀏覽器確認 → 建立個人品牌 → 儲存服務草稿 → 編輯 → 發布／下架 → 查看公開頁 → 切換需求方／供給方模式。

新增後端 Session、個人姓名／語言／IANA 時區、目前與全部 Session 撤銷、資料匯出／刪除申請、D1 限流、Origin／JSON／大小驗證及稽核。服務編輯以 revision 與 mutation nonce 保護 service／offering 一致性，拒絕跨租戶與過期版本。

驗證結果：52 項 Vitest（含失敗注入）、24 項桌面及模擬手機的瀏覽器／API 整合全部通過；TypeScript、文件與建置通過。實際包括六個同時驗證只成功一次、舊 Session 失效、停權拒絕、錯誤瀏覽器拒絕、寄信限流、跨租戶寫入拒絕、並發編輯只一筆成功、重複品牌網址回滾。已檢視登入、服務編輯、手機商業工作台與帳號設定截圖，瀏覽器無執行錯誤。

E2E 已改為每次獨立 D1、執行正式 build；測試啟動先確認本機驗證模式，避免真實寄信與混入開發資料。

限制：正式 Resend 寄送、品牌圖片、人工隱私案件處理尚未驗收。排班／可用時間、預約／申請／取消／改期、CRM、通知、ICS、管理後台與備份復原尚未完成。

下一工作包：Service & Scheduling，接上每週可用時間、日期例外、服務與資源關聯、跨時區查詢，再實作完整預約交易。
