# Calendar Export v0.5

`GET /api/v1/bookings/:id/calendar.ics` 使用既有 Session 與 Booking 存取權限，只允許需求方本人或有效業務 owner。沒有公開 token、收件者 Email、ATTENDEE 或邀請寄送。回應為 text/calendar、固定附件名稱與 private, no-store。

VEVENT 讀取目前預約的 UTC 起訖時間及原交易快照的服務名稱、供給方、地點與服務時區。UID 穩定，SEQUENCE=booking.version−1，CREATED／LAST-MODIFIED／DTSTAMP 依建立與事件時間。CANCELLED 匯出 STATUS:CANCELLED；COMPLETED／NO_SHOW 在描述中保留履約狀態，VEVENT 不使用不合法的完成狀態。

依 [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html) 使用 CRLF、TEXT 特殊字元跳脫及每行至多 75 UTF-8 octets 的摺行，不切斷多位元字元。測試涵蓋繁中／emoji、換行注入、UTC、私人權限、穩定 UID、改期與取消版本。

這是單次檔案快照，不是日曆訂閱、Google／Outlook OAuth 同步或邀請流程。重新匯入是否更新／取消原事件依行事曆應用而定；尚未在 Apple／Google／Outlook 實際匯入驗收，不能承諾所有客戶端會自動覆寫。
