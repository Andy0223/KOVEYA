# MVP 實作順序

本文件將原六個 Sprint 轉成相依工作包。日期沿用規劃目標，不表示工作已開始或完成。

| 工作包 | 規劃期間 | 交付與驗收 | 相依 |
|---|---|---|---|
| Foundation | 2026-10-19–11-01 | 需求審查、MVP 範圍、技術骨架、Schema 初稿、UX、CI 與開發說明 | 無 |
| Identity & Provider | 2026-11-02–11-15 | Email 登入、Session、雙模式、個人業務租戶、品牌頁；權限測試 | Foundation |
| Service & Scheduling | 2026-11-16–11-29 | 服務與政策、每週規則／日期例外、時段計算及資料庫占用保護；並發測試 | Identity & Provider |
| Booking Lifecycle | 2026-11-30–12-13 | 預約、申請、取消、改期、歷史、冪等；失敗回滾測試 | Service & Scheduling |
| Operations & Notifications | 2026-12-14–12-27 | 客戶、手動預約、需求方清單、Outbox、站內／Email、ICS、管理功能 | Booking Lifecycle |
| Quality & Beta | 2026-12-28–2027-01-10 | E2E、手機、權限、負載、復原演練、真實測試及獨立審查 | 所有 P0 |

## 第一工作包

- [x] 初始化 Git 並連接 origin。
- [x] 建立 MVP 範圍整理及規格缺口清單。
- [x] 整理 Master PRD 與全部功能 Requirement ID（非原文逐字備份）。
- [x] 整理策略、UX、技術、營運與測試文件。
- [ ] 決定 OPEN-001–014，將必要規則轉成可驗收契約。
- [x] 建立 React／Workers 本機開發環境及依賴鎖定。
- [x] 建立初始資料庫 Migration 與本機重建指令（尚非所有 P0 表）。
- [x] 建立 typecheck、測試、build 與 CI。
- [ ] 完成供給方及需求方訪談，確認 MVP 範圍。

## 每項實作的完成條件

程式碼、相關 Requirement ID、適當測試、必要文件與實際驗證結果皆有紀錄。外部帳號、網域、部署、Email 寄送及真實使用者驗證若未完成，須明列限制。

## Identity & Provider 進度

- [x] Email challenge、hash、到期與一次性消耗。
- [x] 同瀏覽器確認、伺服器 Session、登出與全部撤銷。
- [x] 雙模式與姓名／語言／時區。
- [x] 個人品牌、唯一分享網址與公開／隱藏。
- [x] 服務草稿、時長、交付方式、價格／幣別、政策與發布／下架。
- [x] 租戶隔離、Origin、限流、輸入驗證與重要操作稽核。
- [x] 本機登入／品牌／服務閉環與失敗／並發測試。
- [ ] 正式 Email 寄件網域、secrets 與實際寄送驗證。
- [ ] 品牌圖片與 R2 儲存。
- [ ] 隱私申請人工處理、資料保存及刪除／匯出作業。

## 接續：Service & Scheduling

- [ ] 個人資源與服務關聯。
- [ ] 每週排班與日期開放／休假例外。
- [ ] UTC／IANA／DST 可用時段計算。
- [ ] 服務前後緩衝、提前量及開放範圍生效。
- [ ] 預約 API、冪等與 D1 真實並發驗收。
