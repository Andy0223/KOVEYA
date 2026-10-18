# Database Schema v0.1

可執行來源：`worker/db/schema.ts`。Migration 位於 `migrations/`，由 `npm run db:generate` 產生；套用使用 `npm run db:migrate`，只對本機。測試資料 `seeds/demo.sql` 可重跑，只有虛構公開資料。

## 已建立的 15 張表

users、identities、sessions、organizations、organization_members、provider_profiles、services、offerings、resources、availability_rules、client_relationships、bookings、booking_allocations、outbox_events、idempotency_records。

## 一致性規則

- 供給方 slug 唯一；身分 provider + subject 唯一。
- business 資料有 org_id；offering → service、booking → offering／client、allocation → booking／resource 使用複合外鍵禁止跨租戶引用。
- resource + UTC slot 主鍵防止相同資源的相同粒度重複占用。
- 服務長度為正 15 分鐘倍數，緩衝為非負倍數；預約時間亦對齊。
- FIXED 必須正金額、FREE 為 0、QUOTE 金額為 null，不能把待報價偽裝成免費。
- UTC 使用 epoch milliseconds，當地每週規則用分鐘與 resource 的 IANA 時區。金額為最小單位整數，幣別三碼；合法 ISO 幣別與 safe integer 範圍仍須 API 驗證。
- booking 保存 JSON terms_snapshot；不可變寫入政策及版本授權尚待預約模組完成。

## 尚未建立的目標表

登入 token、日期例外、服務資源關聯、預約申請、改期提案、預約歷史、通知與偏好、audit_logs、隱私申請等 P0 表將隨模組補齊。orders、order_items、payment_records、packages、entitlements、entitlement_ledger、subscriptions、locations、integration_connections 等依階段加入。

現有 schema 是基礎 migration，並非原 Master Plan 所有表的完整實作。唯一約束測試不等於 D1 100 請求端到端併發驗收。
