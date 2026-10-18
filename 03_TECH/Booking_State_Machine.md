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
