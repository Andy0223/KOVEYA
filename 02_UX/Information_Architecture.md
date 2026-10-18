# Information Architecture

## 公開網站

Home（個人／商業入口）、供給方頁（About／Services／Locations／Booking）、服務詳情（價格／時長／可用時間／政策）、Pricing、Help、Sign In、Sign Up。MVP 首頁介紹產品與供給方啟用，不做空的全球搜尋。

## 工作台規劃

需求方：`/app`、`/app/bookings`、`/app/providers`、`/app/notifications`、`/app/profile`、`/app/settings`；P1 才開 `/app/services` 套票。

供給方：`/business`、`/business/calendar`、`/business/bookings`、`/business/services`、`/business/clients`、`/business/availability`、`/business/profile`、`/business/settings`；P1 才開 `/business/packages`、`/business/analytics`。

## 目前實際可用路徑

`/`：雙語產品首頁。`/p/demo-coach`：從本機 D1 讀取的虛構供給方頁。`/app` 與 `/business`：工作模式介紹，尚無帳號／私人資料。

不顯示大量未完成頁面的導航。使用者介面清楚標示開發預覽，示範供給方不接真實預約。
