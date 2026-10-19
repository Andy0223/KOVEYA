# Information Architecture

## 公開網站

Home（個人／商業入口）、供給方頁（About／Services／Locations／Booking）、服務詳情（價格／時長／可用時間／政策）、Pricing、Help、Sign In、Sign Up。MVP 首頁介紹產品與供給方啟用，不做空的全球搜尋。

## 工作台規劃

需求方：`/app`、`/app/bookings`、`/app/providers`、`/app/notifications`、`/app/profile`、`/app/settings`；P1 才開 `/app/services` 套票。

供給方：`/business`、`/business/calendar`、`/business/bookings`、`/business/services`、`/business/clients`、`/business/availability`、`/business/profile`、`/business/settings`；P1 才開 `/business/packages`、`/business/analytics`。

## 目前實際可用路徑

`/`：雙語首頁。`/p/:slug`：已公開的供給方頁；`/p/demo-coach` 為虛構範例。

`/sign-in`、`/auth/verify`：Email 驗證登入。`/app`：已登入需求方入口（預約管理尚未完成）。`/app/profile`：姓名、語言、時區、資料申請、撤銷 Session。

`/business`：建立品牌或管理服務。`/business/profile`：品牌設定。`/business/services/new`：新增草稿。`/business/services/:id`：編輯自己的服務。私人頁未登入時提供登入入口，服務頁瀏覽不要求登入。

不顯示大量未完成頁面的導航。使用者介面清楚標示開發預覽，示範供給方不接真實預約。

## v0.3 新增可操作路徑

- `/business/availability`：共用每週排班、時區、日期休假／開放例外。
- `/p/:slug/book/:id`：公開選日期及時段，顯示價格與取消規則；確認前登入，透過 returnTo 保留選擇，登入後重新同意條件。
- `/app/bookings`、`/business/bookings`：需求／供給方授權預約清單，包含歷史，最多 200 筆。
- `/app/bookings/:id`：雙方預約詳情、交易快照、取消、改期提案／對方接受或拒絕、異動紀錄。供給方在服務結束後可標記完成／未到場。

申請式服務保留清楚的未開放說明；未提供沒有實作的提交按鈕。所有新流程提供繁中／英文。Email 通知尚未啟用，預約詳情明確提醒在站內查看更新。

## v0.4 新增可操作路徑

`/app/requests` 與 `/business/requests` 提供各自有權查看的預約申請。`/app/requests/:id` 提供原條件、原時間／替代時間、到期、接受／拒絕／撤回、供給方提議替代時間與歷史。接受後可連到正式預約。

`/app/notifications` 提供站內通知、未讀數、詳情入口與明確標記已讀；header、需求方與供給方入口皆可進入。已讀不代表已同意改期或替代時間。

公開 REQUEST 服務可選時間、登入後同意條件並送出申請，清楚顯示不占位與回覆期限。待報價仍不提供送出按鈕。先前「申請式預約未開放」的描述由本節取代。

## v0.5 客戶與既有安排

- `/business/clients`：自己的客戶清單、聯絡搜尋與分頁。
- `/business/clients/new`、`/business/clients/:id`：建立／編輯本業務聯絡資訊、帳號連結標示、預約／完成數及分頁歷史。
- `/business/bookings/new?clientId=…`：選擇既有客戶、已發布服務與時間，明確聲明已與客戶約定後代為記錄。
- `/app/providers`：從本人預約衍生的公開營運供給方，供快速回到服務頁。
- `/app/bookings/:id`：新增來源標示、供給方客戶入口、未連結客戶的外部同意改期紀錄與 ICS 下載。

聯絡 Email 不會自動變成登入帳號，修改平台客戶的聯絡資訊也不修改其帳號。未連結客戶不會收到站內通知，供給方應直接聯絡。下載按鈕說明檔案不會自動同步；取消後仍能匯出取消狀態快照。
