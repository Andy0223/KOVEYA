-- Fictional public data only. Safe to re-run locally. Never use this seed in production.
INSERT OR IGNORE INTO organizations (id, name, status, created_at) VALUES ('org-demo', 'KOVEYA Demo Studio', 'ACTIVE', 1792272000000);
INSERT OR IGNORE INTO provider_profiles (id, org_id, public_name, slug, bio, location_label, timezone, published)
VALUES ('provider-demo', 'org-demo', 'KOVEYA Demo Coach', 'demo-coach', '這是用來測試公開服務體驗的虛構教練。從運動習慣到每一次練習，讓服務安排更簡單。', '台北 · Taiwan', 'Asia/Taipei', 1);
INSERT OR IGNORE INTO services (id, org_id, name, description, mode, status, delivery, location_label, timezone, cancellation_policy)
VALUES ('service-demo-tennis', 'org-demo', '一對一網球練習', '依照你的程度安排練習，從基本動作到場上節奏。此為示範服務，尚不接受真實預約。', 'INSTANT', 'PUBLISHED', 'IN_PERSON', '台北示範球場（虛構地點）', 'Asia/Taipei', '示範政策：開始前至少 24 小時可免費取消；實際交易須依預約時同意的條件處理。');
INSERT OR IGNORE INTO offerings (id, service_id, org_id, duration_minutes, pricing_type, price_minor, currency)
VALUES ('offering-demo-tennis', 'service-demo-tennis', 'org-demo', 60, 'FIXED', 150000, 'TWD');
INSERT OR IGNORE INTO services (id, org_id, name, description, mode, status, delivery, location_label, timezone, cancellation_policy)
VALUES ('service-demo-online', 'org-demo', '線上訓練諮詢', '一起整理訓練目標與每週練習方向。此為示範服務，內容將由供給方自行撰寫。', 'REQUEST', 'PUBLISHED', 'ONLINE', '線上視訊', 'Asia/Taipei', '示範政策：開始前至少 24 小時可取消或申請改期。');
INSERT OR IGNORE INTO offerings (id, service_id, org_id, duration_minutes, pricing_type, price_minor, currency)
VALUES ('offering-demo-online', 'service-demo-online', 'org-demo', 30, 'FREE', 0, 'TWD');
INSERT OR IGNORE INTO services (id, org_id, name, description, mode, status, delivery, location_label, timezone, cancellation_policy)
VALUES ('service-demo-draft', 'org-demo', '未公開草稿（開發用）', '此草稿不得出現在公開 API。', 'INSTANT', 'DRAFT', 'ONLINE', '線上', 'Asia/Taipei', '草稿政策');
INSERT OR IGNORE INTO offerings (id, service_id, org_id, duration_minutes, pricing_type, price_minor, currency)
VALUES ('offering-demo-draft', 'service-demo-draft', 'org-demo', 60, 'FIXED', 100000, 'TWD');
INSERT OR IGNORE INTO resources (id, org_id, name, timezone) VALUES ('resource-demo', 'org-demo', 'Demo Coach', 'Asia/Taipei');
INSERT OR IGNORE INTO service_resources (service_id, org_id, resource_id) SELECT id, org_id, 'resource-demo' FROM services WHERE org_id='org-demo';
INSERT OR IGNORE INTO availability_rules (id,org_id,resource_id,weekday,start_local_minute,end_local_minute)
VALUES ('demo-mon','org-demo','resource-demo',1,540,1080), ('demo-tue','org-demo','resource-demo',2,540,1080), ('demo-wed','org-demo','resource-demo',3,540,1080), ('demo-thu','org-demo','resource-demo',4,540,1080), ('demo-fri','org-demo','resource-demo',5,540,1080);
