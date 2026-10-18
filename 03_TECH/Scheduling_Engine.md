# Scheduling Engine

需求 SCH-001–016。目前實作 `allocationSlots` 與 Booking 終態判斷，尚未實作完整 availability 查詢及 booking write。

15 分鐘粒度；時間區間 [start, end)。服務前後緩衝一併占用。19:00–20:00 前後各 15 分鐘，配置 18:45–20:15 的六個 slot。

工程暫定：拒絕非 15 分鐘倍數的長度與緩衝，起點需對齊 UTC slot。單次配置上限 24 小時，避免無界計算；若產品需要更長交付，採專案模式或另訂規則。

## 目標查詢流程

將指定日期的當地每週規則與例外解析成 UTC 區間 → 套用提前量與最遠日期 → 加緩衝 → 排除占用及封鎖 → 回當地時間、UTC 及 timezone。

例外暫定整日關閉優先；自訂日期開放取代該日每週規則，重疊時合併。跨日規則拆成兩個當地日期區間。DST 不存在的當地時間不產生時段；重複時間須回兩個不同 UTC 與 offset，不能只以鐘點辨認。上述尚未落碼，不宣稱已驗收。

## 預約與改期交易目標

D1 batch 同時包含條件寫入、預約、allocation、history、Outbox、冪等結果。任一保護失敗須整批回滾，不能依賴零列 UPDATE 自動報錯；需要明確的版本／條件失敗策略並測試。

改期在同一原子操作換掉舊占用，避免先刪除原安排再獨立嘗試新時間。每個 API 重新確認 published、租戶、政策、目前狀態與版本。

D1 batch 的交易行為依 [官方文件](https://developers.cloudflare.com/d1/worker-api/d1-database/) 設計，仍須真實 D1 併發測試。
