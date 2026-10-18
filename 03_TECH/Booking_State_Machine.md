# Booking State Machines

不同領域狀態分開保存。

| 領域 | 狀態／轉移 |
|---|---|
| Service | DRAFT → PUBLISHED；PUBLISHED → UNPUBLISHED；可編輯後重發；ARCHIVED 保存歷史 |
| Request | SUBMITTED → ACCEPTED／COUNTER_PROPOSED／REJECTED／WITHDRAWN／EXPIRED；提議需對方回覆 |
| Booking | CONFIRMED → COMPLETED／CANCELLED／NO_SHOW；終態不能再次取消、改期、完成 |
| Reschedule | 獨立提案，對方接受後重查資源並原子換位；原預約不因提案被修改 |
| Payment | UNPAID → PENDING → PAID；FAILED／CANCELLED／PARTIALLY_REFUNDED／REFUNDED 分別處理 |
| Notification | PENDING → PROCESSING → SENT；失敗 RETRY_SCHEDULED／FAILED_FINAL |

完成與未出席只能在服務結束後由授權供給方標記；這是工程暫定規則，待 API 實作時細化。取消依交易快照及操作方處理。任何轉移檢查身分、權限、狀態、政策、資源及版本。

若未來引入付款保留，才加入 PENDING_PAYMENT，且必須設到期釋放及付款競爭規則。

付款來源獨立：Provider-reported Paid 與 PSP-confirmed Paid 不互相冒用。送信 SENT 不代表收件者已理解或已讀。

目前只有 Booking 終態轉移純函式與測試；其餘為目標設計。

## v0.3 已實作範圍（取代上方「目前只有純函式」的舊進度）

INSTANT 預約建立 CONFIRMED。雙方在開始前依原政策取消為 CANCELLED；供給方於結束後可標記 COMPLETED／NO_SHOW，均要求版本與冪等鍵。需求方不可標記履約；終態不能再次異動。

改期提案 PENDING → ACCEPTED／REJECTED／CANCELLED；超過期限在讀取時顯示 EXPIRED，所有接受操作均檢查真實期限。尚未建立背景到期通知工作。最新提案取代未回覆舊提案，不占用新時段，原預約保持有效。有效期取 24 小時、原服務起點、新起點前 15 分鐘之最早者。接受者必須是另一方，價格與條件快照不變。

完成、取消或接受改期在同批記錄 booking_events、audit_logs 及 PENDING outbox_events。通知消費者尚未接上，不把 Outbox 成功寫入宣稱為 Email 送達。

REQUEST 預約申請、付款、通知送達狀態機仍為設計，並非已上線功能。

## v0.4 申請式預約

REQUEST／固定價格或免費服務支援 SUBMITTED → ACCEPTED／COUNTER_PROPOSED／REJECTED／WITHDRAWN／EXPIRED；COUNTER_PROPOSED 可由需求方 ACCEPTED／DECLINED／WITHDRAWN，供給方亦可更新提案或 REJECTED。終態不能再異動；所有使用者操作需 version 與 Idempotency-Key。

申請不是預約，不持有配置。原時間由需求方送出時明確同意，供給方可接受；替代時間一定由需求方明確同意。接受時重新檢查服務公開、業務有效、需求方有效、資源排班版本與目前配置，再同批寫入 Booking、配置、歷史、Outbox、稽核、收據及 ACCEPTED／booking_id。失敗不會假接受。

有效期為 now + 24 小時與 startsAt − max(15, minNoticeMinutes) 分鐘的較早者；到期時刻不允許接受。替代時間只能縮短而不能延長原期限。讀取即顯示 EXPIRED；背景工作再以版本／nonce 條件寫入終態及系統事件，避免與接受競爭重複更新。正式部署 Cron 尚未驗收。

原始價格、政策、時長與緩衝保存在申請快照；服務後續修改不改寫原條件。QUOTE 仍需未實作的議價同意流程，不得偽裝成免費預約。個人業務不能向自己送出需要自己批准的申請。
