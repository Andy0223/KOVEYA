# Scheduling Engine v0.3

已實作 SCH-001–010：個人供給方共用資源、每週排班、日期例外、提前量、預約範圍、前後緩衝、UTC／IANA 時區、時段查詢、配置唯一鍵、取消釋出與原子改期。參考 `worker/modules/scheduling/`，可操作 `/business/availability`。

15 分鐘粒度，區間 [start, end)。19:00–20:00 前後各 15 分鐘，配置 18:45–20:15 的六個 slot；全部 slot 都必須在資源的工作時間內。拒絕非 15 分鐘倍數；單次配置最多 24 小時。

## 時段查詢

公開 `GET /services/:id/availability?offeringId=…&date=YYYY-MM-DD` 只提供已公開且業務有效的 INSTANT 服務；REQUEST／QUOTE 此版本沒有可提交的時段。

以 UTC 每 15 分鐘列舉真實時間點，依服務 IANA 時區篩選指定日期，再按資源時區檢查每個占用 slot 的每週規則或日期例外。不存在的 DST 時間不產生候選，重複時間保留兩個 UTC，畫面標示 offset。當地時間規則不預先換成固定 UTC。

每個日期最多一筆例外。空 intervals 表示整天關閉；非空開放區間取代每週排班。拒絕重疊區間與重複日期；跨日拆成兩天。最遠日期是服務時區「今天 + maxAdvanceDays」，含該日期；最早起點至少符合 minNoticeMinutes 且必須在未來。

資源排班獨立於服務時區；變更品牌／服務時區不會偷偷改掉既有排班。修改排班時增加 resource revision，既有預約仍保留。日後多人／多資源聯合排程尚未實作。

## 原子寫入

預約最終 D1 batch 重新斷言服務 revision、發布狀態、品牌公開、業務有效、資源 revision 與使用者有效；不符則由 CHECK guard 使整批失敗。不可將 UPDATE 0 列當成成功。

同一批提交：冪等紀錄 → guard → 租戶客戶關係 → 預約及不可變條件快照 → 唯一資源配置 → 事件／Outbox／稽核 → 清除 guard。資源配置使用 resource + UTC slot 主鍵，禁止同時通過預查的兩筆交易都占用時段。以 JSON 批次插入配置，避免按每個 slot 發送查詢。

改期接受沿用原價格、時長、緩衝、取消條件，套用目前資源排班。接受者必須是對方；檢查 proposal 期限、booking version，再於一批替換時間與配置。新配置失敗，原時間與配置一起回滾。

`Idempotency-Key` 為 actor + operation 範圍；相同 key／內容回相同 entity id，不同內容回 IDEMPOTENCY_CONFLICT。重試結果不冒充目前狀態，詳情另外 GET。

## 驗證範圍

Playwright 在隔離的 Workers／本機 D1 執行 100 個同時請求（兩個驗證使用者，各 50 個獨立 key）：一筆成功、99 筆 SLOT_UNAVAILABLE，供給方只能查到一筆有效預約，取消後時段恢復。SQLite 額外注入 Outbox 與改期配置失敗，檢查完整回滾及同 key 安全重試。

這些不是正式雲端 D1 壓力測試、持續負載或 Beta 驗收。申請式預約、通知送達與備份復原仍待完成。

## v0.4 更新

公開時段查詢現在支援固定價格／免費的 REQUEST；QUOTE 仍回空清單。送出申請只保存條件及時間，不寫 allocation，也不承諾占位。接受申請共用直接預約的 booking 寫入 helper，以相同唯一鍵與批次回滾保護資源。

已新增本機 D1 100 個請求競爭測試：50 個接受同一申請與 50 個直接預約競爭同一資源，合計只有一筆有效預約。若直接預約獲得時段，原申請保持待確認而不假成功。先前「申請式預約待完成」的進度由本節取代；正式雲端負載與 Beta 驗收仍待完成。

## v0.5 手動預約

`GET /business/services/:id/availability` 僅供擁有該服務的有效 owner，查詢 PUBLISHED 固定價格／免費服務，提前量使用 0，其餘資源、時區、緩衝、期限與占用條件不變。公開入口保持原服務的 minNoticeMinutes，不能透過前端旗標豁免。

手動預約與需求方直接預約共用資料庫配置與事件寫入。新增本機 D1 100 請求競爭（50 手動／50 需求方），只有一筆有效預約；手動客戶不會因 Email 相同就取得平台帳號權限。手動改期亦測試新配置失敗時的全批回滾。
