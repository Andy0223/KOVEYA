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

## v0.3 增量（目前共 24 張表）

新增 service_resources、availability_exceptions、transaction_guards、booking_events、reschedule_requests；resources 新增 revision。Migration 0003 回填既有有資源的服務；無資源的虛構 demo 由可重跑 seed 初始化。所有 schema 與舊資料 migration 都經測試。

booking.terms_snapshot 已由直接預約 API 原子寫入，保存服務版本、名稱、供給方、地點、IANA 時區、價格／幣別、時長／緩衝、預約限制及取消規則。編輯服務與接受改期不覆寫快照。

服務資源、日期例外、預約事件與改期提案使用租戶複合外鍵。transaction_guards 的 CHECK 用於明確斷言版本與狀態；成功後同批清除。預約、配置、事件、Outbox、稽核及冪等收據任一失敗整批回滾。

尚未建立：預約申請、完整通知與偏好、訂單／付款、套票權益等後續模組。Outbox 此版本只保存 PENDING 事件，沒有消費或寄送功能。

## v0.4 增量（目前共 27 張表）

Migration 0005 新增 booking_requests、request_events、notifications；outbox_events 新增 last_error。申請保存原始與目前提議時間、版本、截止、不可變條件、正式 booking_id。申請與 offering／client／booking 透過 org_id 複合外鍵隔離。

request_events 可保存 actor_id=null 的到期系統事件。到期以版本／狀態／時間條件更新並標記本次 nonce，只有同一次更新成功才能寫入歷史與 Outbox，全部在 batch 內提交。

notifications 有 event_id + recipient_id 唯一鍵及自己的 read_at。Outbox 消費時按目前合法客戶／業務關係找收件者，插入站內通知與標記 SENT 在同一交易。SENT 在此版本只代表站內處理，不代表 Email 或已讀。Email 尚未接上；站內通知不是付款或接受提案的證據。

## v0.5 增量（仍為 27 張表）

Migration 0006 在 client_relationships 新增 phone、revision、created_at、updated_at；舊資料時間 0 表示未知，不冒稱實際建立／更新時間。新增客戶與首次平台關係都會記錄目前時間。新增 bookings.source，既有記錄預設 CUSTOMER；供給方代為記錄為 PROVIDER_RECORDED。

客戶 Email 是租戶聯絡資訊，不能設定 user_id。手動客戶即使 Email 相同也保持未連結；之後該 Email 的已驗證帳號自行預約，建立另一筆平台關係，不自動合併或開放舊資料。客戶編輯不修改 users 或 identities。

客戶聯絡編輯使用 revision、owner membership guard 與稽核批次；手動預約／改期共用資源唯一鍵、Outbox、稽核及冪等。新增 booking_client_start_idx 與 booking_events_timeline_idx 支援租戶客戶歷史、統計與日曆最後異動查詢。
