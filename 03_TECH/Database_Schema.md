# Database Schema v0.1

可執行來源：`worker/db/schema.ts`。Migration 位於 `migrations/`，由 `npm run db:generate` 產生；套用使用 `npm run db:migrate`，只對本機。測試資料 `seeds/demo.sql` 可重跑，只有虛構公開資料。

## 已建立的 19 張表

users、identities、sessions、organizations、organization_members、provider_profiles、services、offerings、resources、availability_rules、client_relationships、bookings、booking_allocations、outbox_events、idempotency_records、email_challenges、rate_limit_buckets、audit_logs、privacy_requests。

## 一致性規則

- 供給方 slug 唯一；身分 provider + subject 唯一。
- business 資料有 org_id；offering → service、booking → offering／client、allocation → booking／resource 使用複合外鍵禁止跨租戶引用。
- resource + UTC slot 主鍵防止相同資源的相同粒度重複占用。
- 服務長度為正 15 分鐘倍數，緩衝為非負倍數；預約時間亦對齊。
- FIXED 必須正金額、FREE 為 0、QUOTE 金額為 null，不能把待報價偽裝成免費。
- UTC 使用 epoch milliseconds，當地每週規則用分鐘與 resource 的 IANA 時區。金額為最小單位整數，幣別三碼；合法 ISO 幣別與 safe integer 範圍仍須 API 驗證。
- booking 保存 JSON terms_snapshot；不可變寫入政策及版本授權尚待預約模組完成。

## 尚未建立的目標表

日期例外、服務資源關聯、預約申請、改期提案、預約歷史、通知與偏好等 P0 表將隨模組補齊。orders、order_items、payment_records、packages、entitlements、entitlement_ledger、subscriptions、locations、integration_connections 等依階段加入。

現有 schema 是基礎 migration，並非原 Master Plan 所有表的完整實作。唯一約束測試不等於 D1 100 請求端到端併發驗收。

## v0.2 增量

Email challenge、browser challenge 及 Session 只保存 SHA-256 hash。一次性消耗與使用者／身分／Session／稽核在 batch 內提交，後續寫入由同一次驗證 nonce 保護。

organizations.owner_user_id 唯一，MVP 一個帳號一個個人業務。service revision 與 last_mutation_id 共同保護多陳述式編輯：舊版本 UPDATE 0 列時，不能繼續修改 offering 或寫成功稽核。policy_version 在取消規則變更時增加。

privacy_requests 僅保存使用者已驗證提出的申請與狀態，人工處理及保存例外尚未完成。rate_limit_buckets 只保存 scope／subject 的 hash、次數與期限；清理與營運保存政策待上線前設定。
