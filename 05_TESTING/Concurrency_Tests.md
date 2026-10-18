# Concurrency Test Plan

需求 SCH-007、SCH-010、BKG-001／007、PKG-004。目前只有 schema 唯一鍵及單一 SQLite 連線回滾測試，尚未做完整競爭驗收。

## P0 必測

1. 同一 resource 最後一個時段，100 個不同 actor／key 同時提交，只有一筆成功，其他回 SLOT_UNAVAILABLE。
2. 相同 actor／key／payload 同時重送，只回同一筆結果；相同 key 不同 payload 回明確衝突。
3. 多種服務共用資源、含前後緩衝，不能穿透衝突檢查。
4. 接受申請與另一個直接預約競爭，失敗申請不能假確認。
5. 改期新時間競爭失敗，原 booking、allocation、snapshot 及 history 完整。
6. 到期與接受競爭、取消與完成競爭、服務下架與新預約競爭，僅有效轉移成功。
7. Outbox 重送不重複產生站內通知；外部供應商未知結果需對帳。

在真實 D1 隔離環境執行，記錄版本、隨機 seed、barrier 同步、請求結果、交易筆數、allocation、Outbox、冪等及 FK 驗證。不要只看 HTTP 成功數。

P1 增加扣次與人工調整競爭；P2 增加團課容量及 Webhook 重送。
