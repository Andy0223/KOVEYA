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
