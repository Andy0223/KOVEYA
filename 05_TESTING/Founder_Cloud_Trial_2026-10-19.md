# Founder 雲端試用驗證 — 2026-10-19

環境：`https://koveya-trial.koveya-test.workers.dev`，Cloudflare Worker／APAC D1；登入使用 Founder 既有 Session。操作以 Chrome Computer Use 執行，並以 D1 唯讀查詢核對。未直接插入使用者／Session，未繞過登入，未更改使用者既有服務或排班。

## 雲端實際完成

| 檢查 | 證據與結果 |
|---|---|
| 公開服務與登入渠道 | HTTPS health ready／0.5.1，auth/config email，品牌公開資料正常 |
| 新增虛構客戶 | `QA 雲端測試客戶 20261019`，不填 Email／電話，不連結平台帳號；客戶 ID `ef9ea939-4a00-4b35-acf4-cee5c2ef4f4a` |
| 手動預約 | 免費網球測試服務，10/19 台北 18:15–19:15；`CONFIRMED`、version 1、source PROVIDER_RECORDED、含前後緩衝共 6 個占用單位 |
| 改期 | 改至 19:45–20:45，version 2；原時段占用 0、新占用 6，保存原因與事件 |
| 取消 | version 3、`CANCELLED`、占用 0，共 3 個 booking events；保留取消紀錄，不刪除歷史 |
| ICS 實際下載 | 初版與取消版 UID 相同；UTC DTSTART 由 10:15Z 改為 11:45Z，SEQUENCE 0 → 2，STATUS CONFIRMED → CANCELLED |
| 通知 | confirmed／rescheduled／cancelled 各 1 筆，沒有重複；對應 Outbox 均 SENT；取消通知標已讀後未讀 3 → 2 |

測試預約 ID：`12e193a6-e73f-43e5-b7f3-4d2dfd4be8d6`。最終已取消，不留下有效占位；虛構客戶及歷史保留，方便查驗。ICS 下載留在使用者 Downloads，沒有匯入日曆或發送邀請。

通知中心的讀取也會消費 Outbox，因此此證據只確認雲端站內通知可處理，不足以單獨證明 Cron 已準時執行。SENT 不是 Email 已寄送，也不是客戶已讀。

## 發現並修正

- 自己的 REQUEST 服務在後端禁止自訂，但前端原本沒有說明：新增明確原因、停用送出及手動安排入口。後端規則維持不變。
- 免費服務的預約詳情仍顯示直接付款：依已保存的價格快照顯示「此服務免費，無須付款」，包括改期與取消後。

修正版本 0.5.2。新增桌面／手機隔離測試，驗證 owner 不能自訂，另一個客戶可送申請 → owner 接受 → owner 提議改期 → 客戶同意 → 客戶取消 → 原／新時段釋出。這些雙帳號流程使用獨立本機 D1，並非雲端真實第二個帳號。

## 尚未驗收

目前只有一個可寄登入信的雲端帳號，且申請禁止供給方預約自己。第二個需求方的雲端登入、申請／接受與雙方改期同意尚未實測，沒有透過寫資料庫或測試登入後門假造驗證。需先提供可用於另一個帳號的合法登入渠道，再執行此項；不需要為完成目前測試購買方案。

其他未完成項目：真實行事曆 App 匯入、實體手機、交易 Email、純 Cron 觸發驗證、雲端壓力及備份復原。完整 Beta 上線門檻維持未通過。

本機 Miniflare 曾再次在四個案例並行時回傳 HTML dispatchFetch 500，根因未確認；限制同時案例為兩個後完整 50 項通過。100 請求競爭測試不變，未加重試或放寬斷言，此變更不代表修復了 runtime 根因。
