# Monitoring & Cost

目前 API 包含 Request ID，錯誤記錄 event／requestId／error name，避免個資與原始查詢錯誤。`/api/v1/health` 查詢 schema 中的 organizations，失敗回 503；只代表資料庫基本可讀，非完整平台健康。

後續量測讀取 API P95（初期目標 <1 秒，不含第三方）、預約寫入錯誤、SLOT_UNAVAILABLE、撞期、Outbox lag、失敗重試、驗證信寄送、通知成本與 D1 用量。告警閾值需依 Beta 基準制定。

預算目標：Prototype US$0–10／月，Closed Beta US$0–20，Early Launch US$10–100，Growth US$50–300；不含人力、法律、行銷與稅。免費額度及供應商現價需上線前查核，不能假設額度超標仍可服務。

不為普通預約呼叫 AI、不讓核心交易依賴付費通訊訊息、不託管大量影音。每月計算每筆預約成本及毛利，正式服務預留升級預算。

## v0.4 可查詢的站內處理狀態

outbox_events.status 為 PENDING／SENT／FAILED；attempts、next_attempt_at、last_error 可追蹤失敗與延遲。SENT 只表示已完成站內通知處理，沒有 Email 送達或已讀語意。通知已讀由各收件者自己的 notifications.read_at 記錄，與提案同意分開。

申請期限在 API 及讀取即生效，不依賴 Cron 準時執行。Cron／通知頁只補寫到期歷史及處理通知，不能使過期申請重新有效。到期工作失敗記錄 request.expiry_failed 的錯誤名稱，通知分派仍獨立嘗試。

正式部署後需量測待送最老事件、FAILED 數量、到期積壓與重試延遲並設定告警；目前沒有完整平台管理 UI 或正式告警驗收。
