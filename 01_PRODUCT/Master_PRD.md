# KOVEYA Master Product Specification v1.0

**KOVEYA — Where People & Services Connect.**

制定日期：2026-10-18。規劃期間：2026 Q4–2027 Q4。初期市場：台灣、Bali／印尼。

狀態：Proposed。來源為使用者提供的 Master Plan & PRD v1.0；本檔為分拆整理後的工程基準，並非原文逐字備份。不得將規劃誤認為已實作或已驗收。

## 產品與策略

讓服務更容易被提供、發現、預約和管理。長期服務運動、教育、美容、攝影、顧問、旅遊體驗、創作者、自由接案及工作室；初期聚焦既有客戶需要反覆預約的獨立服務者。

先 SaaS，後 Marketplace。供給方先分享連結帶入既有客戶，之後驗證需求方跨供給方使用，最後才測試探索與媒合。

一個帳號具備需求方與供給方工作模式。組織管理員與平台管理員是管理權限，並非另外兩種市場角色。Web-first、Mobile-first；社群渠道可替換；初期供給方直接收款；規則引擎優先。

品牌方向包含 KOVEYA Business、Discover、Connect、Pay，初期仍只有一個網站及一套帳號。品牌法律確認、商標、網域及社群衝突檢查尚未完成。

對需求方：**One place for all your services.** 對供給方：**Run your service business, effortlessly.** 關係價值：**From first booking to lasting relationships.**

## 六種服務模式

| 模式 | 階段 | 例子 |
|---|---|---|
| Instant Booking | MVP | 私教、美容、諮詢 |
| Request to Book | MVP | 需審核或到府服務 |
| Quote & Proposal | V2 | 攝影、設計、顧問 |
| Group Session & Event | V1.5，原需求列 P2 | 團課、工作坊 |
| Packages & Memberships | V1／P1 | 多堂課、長期方案 |
| Project & Milestones | V2，細項 P3 | 設計、影片、行銷 |

共用身分、服務、訂單、客戶、通知與授權基礎，各模式保留自己的狀態流程。階段名稱不代表日期承諾；團課時程須另行對齊 Roadmap。

## 第一個里程碑

供給方建立公開頁並分享連結，需求方自行完成預約，雙方管理、取消、改期及查看紀錄。驗收依 [MVP Scope](MVP_Scope.md)，目前尚未完成。

## 優先級與追蹤

P0：MVP 上線不可缺少；P1：核心商業價值；P2：有需求證據後擴展；P3：長期探索。需求定義以 [requirements.json](requirements.json) 為結構化來源，修改後執行 `node scripts/build-product-docs.mjs`。以下狀態不代表單一工具測試結果，完整需求必須端到端驗收。

PRD-08 原文沒有逐項 ID；工程整理新增 NTF-001–013，順序對應原通知矩陣。其他 ID 沿用原規格。

## PRD-01｜Identity & Account Management

使用者故事：同一帳號安全存取需求方與供給方工作台。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| ID-001 | Email 登入 | P0 | 使用者可透過經驗證的 Email 登入 | implemented / local_verified |
| ID-002 | Email 驗證連結 | P0 | Token 一次性、短效、可防重放 | implemented / local_verified |
| ID-003 | 使用者基本資料 | P0 | 可設定姓名、語言與時區 | implemented / local_verified |
| ID-004 | Demand Workspace | P0 | 登入後可查看自己的預約 | partial / not_verified |
| ID-005 | Supply Workspace | P0 | 可建立並管理自己的服務 | implemented / local_verified |
| ID-006 | 角色切換 | P0 | 不須重新登入 | implemented / local_verified |
| ID-007 | Session 管理 | P0 | 可登出、撤銷登入工作階段 | implemented / local_verified |
| ID-008 | Google Login | P1 | 可登入並安全連結既有帳號 | not_started / not_verified |
| ID-009 | LINE Login | P1 | 台灣等適用市場可使用 | not_started / not_verified |
| ID-010 | 多登入方式連結 | P1 | 不產生未經驗證的帳號合併 | not_started / not_verified |
| ID-011 | Apple Login | P2 | 視使用者需求導入 | not_started / not_verified |
| ID-012 | 帳號資料匯出及刪除 | P0 | 可提交申請，依明確流程處理 | partial / not_verified |

## PRD-02｜Provider Profile & Service Catalog

使用者故事：供給方建立專業服務頁並分享給既有客戶。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| PRO-001 | 建立供給方檔案 | P0 | 可以建立個人品牌 | implemented / local_verified |
| PRO-002 | 編輯公開資訊 | P0 | 名稱、介紹、圖片可修改 | partial / not_verified |
| PRO-003 | 建立服務 | P0 | 可建立至少一種服務 | implemented / local_verified |
| PRO-004 | 服務定價 | P0 | 支援固定價格、免費、待報價 | implemented / local_verified |
| PRO-005 | 服務時長 | P0 | 可設定服務時間 | implemented / local_verified |
| PRO-006 | 線上／實體服務 | P0 | 可設定交付方式 | implemented / local_verified |
| PRO-007 | 服務發布與下架 | P0 | 下架後不可新增預約 | partial / not_verified |
| PRO-008 | 專屬公開連結 | P0 | 可分享至其他社群 | implemented / local_verified |
| PRO-009 | 服務排序 | P1 | 可調整公開顯示順序 | not_started / not_verified |
| PRO-010 | 服務方案組合 | P1 | 可建立多次服務方案 | not_started / not_verified |
| PRO-011 | 多地點服務 | P1 | 可設定不同服務地點 | not_started / not_verified |
| PRO-012 | 服務分類範本 | P1 | 可依產業載入預設條件 | not_started / not_verified |
| PRO-013 | 自訂網域 | P2 | 付費供給方可連接 | not_started / not_verified |
| PRO-014 | 多語言服務介紹 | P2 | 可設定不同語言內容 | not_started / not_verified |

## PRD-03｜Availability & Scheduling Engine

使用者故事：供給方的互斥時間與資源不被重複預約。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| SCH-001 | 固定可用時間 | P0 | 支援星期與起訖時間 | not_started / not_verified |
| SCH-002 | 特殊日期 | P0 | 可設定休假及例外開放時間 | not_started / not_verified |
| SCH-003 | 預約間隔 | P0 | 可設定服務前後緩衝時間 | partial / not_verified |
| SCH-004 | 最早預約時間 | P0 | 支援提前預約限制 | partial / not_verified |
| SCH-005 | 最晚可預約日期 | P0 | 支援開放預約範圍 | partial / not_verified |
| SCH-006 | 可預約時段計算 | P0 | 排除已占用及封鎖時段 | not_started / not_verified |
| SCH-007 | 防止撞期 | P0 | 同一互斥資源不得重複占用 | not_started / not_verified |
| SCH-008 | 時區處理 | P0 | UTC 儲存、正確顯示當地時間 | not_started / not_verified |
| SCH-009 | 取消後釋出時段 | P0 | 有效取消後重新開放 | not_started / not_verified |
| SCH-010 | 改期原子性 | P0 | 失敗時不遺失原預約 | not_started / not_verified |
| SCH-011 | 固定週期預約 | P1 | 可建立有期限的重複安排 | not_started / not_verified |
| SCH-012 | 多地點排班 | P1 | 不同地點可設定不同時段 | not_started / not_verified |
| SCH-013 | Google Calendar 同步 | P1 | 經授權同步並處理失敗 | not_started / not_verified |
| SCH-014 | 候補保留時段 | P1 | 保留到期後自動釋出 | not_started / not_verified |
| SCH-015 | 多資源聯合排程 | P2 | 同時檢查人員、場地與設備 | not_started / not_verified |
| SCH-016 | 多方共同空閒時間 | P2 | 在取得授權後推薦時間 | not_started / not_verified |

## PRD-04｜Booking & Service Request

使用者故事：需求方自主預約，供給方依服務設定直接確認或人工審核。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| BKG-001 | 直接預約 | P0 | 符合規則即可建立預約 | not_started / not_verified |
| BKG-002 | 申請式預約 | P0 | 建立待確認申請 | not_started / not_verified |
| BKG-003 | 接受預約 | P0 | 狀態正確更新 | not_started / not_verified |
| BKG-004 | 拒絕預約 | P0 | 保留原因及異動紀錄 | not_started / not_verified |
| BKG-005 | 需求方取消 | P0 | 正確套用取消規則 | not_started / not_verified |
| BKG-006 | 供給方取消 | P0 | 需求方可查看取消資訊 | not_started / not_verified |
| BKG-007 | 雙方改期 | P0 | 避免重複或遺失預約 | not_started / not_verified |
| BKG-008 | 手動新增預約 | P0 | 供給方可加入既有安排 | not_started / not_verified |
| BKG-009 | 預約詳情 | P0 | 雙方看到一致資訊 | not_started / not_verified |
| BKG-010 | 預約歷史 | P0 | 可查看歷史與異動 | not_started / not_verified |
| BKG-011 | 預約到期 | P0 | 待確認申請可依規則過期 | not_started / not_verified |
| BKG-012 | 候補預約 | P1 | 可等待時段釋出 | not_started / not_verified |
| BKG-013 | 批次預約 | P1 | 可一次安排多次服務 | not_started / not_verified |
| BKG-014 | 團體預約 | P2 | 可管理多名參與者 | not_started / not_verified |

## PRD-05｜Demand Workspace

使用者故事：需求方在同一處管理與不同供給方的服務安排。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| DEM-001 | 我的預約 | P0 | 可查看未來與歷史預約 | not_started / not_verified |
| DEM-002 | 預約狀態 | P0 | 明確顯示待確認、已確認等 | not_started / not_verified |
| DEM-003 | 自助改期及取消 | P0 | 遵守服務政策 | not_started / not_verified |
| DEM-004 | 常用供給方 | P0 | 可查看曾使用的供給方 | not_started / not_verified |
| DEM-005 | 快速再次預約 | P1 | 不必重複輸入所有資訊 | not_started / not_verified |
| DEM-006 | 我的套票 | P1 | 可查看剩餘權益 | not_started / not_verified |
| DEM-007 | 個人時間偏好 | P1 | 可設定偏好星期與時段 | not_started / not_verified |
| DEM-008 | 候補中心 | P1 | 查看候補狀態及邀請 | not_started / not_verified |
| DEM-009 | 跨供給方日程 | P1 | 統一管理 KOVEYA 預約 | not_started / not_verified |
| DEM-010 | 供給方邀請 | P2 | 可分享邀請連結 | not_started / not_verified |
| DEM-011 | 服務搜尋與收藏 | P2 | 搜尋及保存感興趣的服務 | not_started / not_verified |
| DEM-012 | 服務評價 | P2 | 只允許符合條件的真實互動評價 | not_started / not_verified |
| DEM-013 | 自然語言需求搜尋 | P3 | 將自然語言轉換成結構化條件 | not_started / not_verified |

## PRD-06｜Client Relationship Management

使用者故事：供給方持續管理既有客戶與服務關係。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| CRM-001 | 客戶清單 | P0 | 顯示與供給方有合法關聯的客戶 | not_started / not_verified |
| CRM-002 | 客戶預約歷史 | P0 | 可查看在該供給方的預約 | not_started / not_verified |
| CRM-003 | 手動新增客戶 | P0 | 可建立必要聯絡紀錄 | not_started / not_verified |
| CRM-004 | 客戶聯絡資訊 | P0 | 依授權及用途管理 | not_started / not_verified |
| CRM-005 | 客戶備註 | P1 | 僅授權人員可查看 | not_started / not_verified |
| CRM-006 | 客戶標籤 | P1 | 可分類客戶 | not_started / not_verified |
| CRM-007 | 套票及方案紀錄 | P1 | 查看客戶已購買權益 | not_started / not_verified |
| CRM-008 | 續購提醒 | P1 | 依客戶同意及通知政策執行 | not_started / not_verified |
| CRM-009 | 客戶分群 | P2 | 根據合法可用資料分群 | not_started / not_verified |
| CRM-010 | 回訪流程 | P2 | 建立自動化但可控的提醒 | not_started / not_verified |
| CRM-011 | 客戶資料匯出 | P1 | 匯出有權管理的資料 | not_started / not_verified |
| CRM-012 | 營運分析 | P1 | 查看回購及留存情況 | not_started / not_verified |

## PRD-07｜Packages, Memberships & Entitlements

使用者故事：雙方查詢一致的剩餘服務權益與期限。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| PKG-001 | 建立套票 | P1 | 可設定價格、次數及期限 | not_started / not_verified |
| PKG-002 | 分配套票給客戶 | P1 | 產生服務使用權益 | not_started / not_verified |
| PKG-003 | 剩餘次數 | P1 | 雙方查看一致數字 | not_started / not_verified |
| PKG-004 | 完成後扣次 | P1 | 符合規則後只能扣一次 | not_started / not_verified |
| PKG-005 | 退還次數 | P1 | 需要原因及紀錄 | not_started / not_verified |
| PKG-006 | 人工調整 | P1 | 記錄操作人、時間、原因 | not_started / not_verified |
| PKG-007 | 到期提醒 | P1 | 不超出授權通知範圍 | not_started / not_verified |
| PKG-008 | 固定週期方案 | P1 | 可對應重複預約 | not_started / not_verified |
| PKG-009 | 定期訂閱扣款 | P2 | 依適用金流及法規 | not_started / not_verified |
| PKG-010 | 多服務共用方案 | P2 | 按權益規則使用 | not_started / not_verified |

## PRD-08｜Notifications & Communication

使用者故事：雙方知道服務狀態變更，通知失敗不影響已提交預約。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| NTF-001 | 預約建立通知 | P0 | 雙方在網站與 Email 取得預約確認 | not_started / not_verified |
| NTF-002 | 申請待審核通知 | P0 | 需求方可查看待確認，供給方收到待處理通知 | not_started / not_verified |
| NTF-003 | 預約接受通知 | P0 | 雙方可查看已確認狀態 | not_started / not_verified |
| NTF-004 | 預約拒絕通知 | P0 | 需求方取得拒絕通知，供給方已結案 | not_started / not_verified |
| NTF-005 | 需求方取消通知 | P0 | 雙方可查看取消結果 | not_started / not_verified |
| NTF-006 | 供給方取消通知 | P0 | 需求方收到重要取消通知 | not_started / not_verified |
| NTF-007 | 改期提案通知 | P0 | 需回覆的一方收到提案及回覆入口 | not_started / not_verified |
| NTF-008 | 服務提醒 | P1 | Email／行事曆依設定提醒 | not_started / not_verified |
| NTF-009 | 候補有空位通知 | P1 | 需求方可接受邀請，供給方依設定通知 | not_started / not_verified |
| NTF-010 | 方案到期通知 | P1 | 依偏好提醒需求方及供給方 | not_started / not_verified |
| NTF-011 | 付款成功通知 | P2 | Email 收據或確認準確對應付款來源 | not_started / not_verified |
| NTF-012 | LINE 主動通知 | P2 | 依官方 API、同意及政策使用 | not_started / not_verified |
| NTF-013 | WhatsApp 主動通知 | P2 | 依 Business API、同意及政策使用 | not_started / not_verified |

## PRD-09｜Orders & Payments

使用者故事：履約、訂單與付款分開，初期由供給方直接收款。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| PAY-001 | 記錄服務價格 | P0 | 保存交易時的價格快照 | not_started / not_verified |
| PAY-002 | 記錄幣別 | P0 | 每筆交易有明確幣別 | not_started / not_verified |
| PAY-003 | 線下付款方式 | P0 | 可選現場付款或另行付款 | not_started / not_verified |
| PAY-004 | 付款狀態 | P1 | 區分未付、待確認、已付 | not_started / not_verified |
| PAY-005 | 人工標記收款 | P1 | 記錄操作人和時間 | not_started / not_verified |
| PAY-006 | 外部付款連結 | P1 | 可連到供給方自行管理的收款頁 | not_started / not_verified |
| PAY-007 | 金流 Webhook | P2 | 驗證簽章、去重及更新狀態 | not_started / not_verified |
| PAY-008 | 訂金與全額付款 | P2 | 遵守服務設定的付款規則 | not_started / not_verified |
| PAY-009 | 退款 | P2 | 區分申請、處理與實際成功 | not_started / not_verified |
| PAY-010 | 平台訂閱 | P1 | KOVEYA 向供給方收取 SaaS 費用 | not_started / not_verified |
| PAY-011 | 平台代收與分帳 | P3 | 完成法規及金流商可行性審查後開發 | not_started / not_verified |

## PRD-10｜Business Analytics & Growth

使用者故事：供給方理解完成服務、回購與實際營運表現。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| ANA-001 | 預約數量 | P1 | 可依日期及狀態統計 | not_started / not_verified |
| ANA-002 | 服務完成率 | P1 | 依明確狀態計算 | not_started / not_verified |
| ANA-003 | 取消率 | P1 | 區分需求方與供給方取消 | not_started / not_verified |
| ANA-004 | 重複預約客戶 | P1 | 不跨未授權組織統計 | not_started / not_verified |
| ANA-005 | 套票續購 | P1 | 可查看符合定義的續購次數 | not_started / not_verified |
| ANA-006 | 來源連結追蹤 | P1 | 支援合法取得的 UTM 參數 | not_started / not_verified |
| ANA-007 | 預約轉換漏斗 | P2 | 明確統計不同階段事件 | not_started / not_verified |
| ANA-008 | 候補補位成效 | P2 | 區分候補邀請與實際完成 | not_started / not_verified |
| ANA-009 | 營收報表 | P2 | 區分實收、應收及預估 | not_started / not_verified |
| ANA-010 | 經營建議 | P3 | 基於足夠資料提出可解釋建議 | not_started / not_verified |

## PRD-11｜Organization & Resource Management

使用者故事：工作室依成員權限管理多人服務及有限資源。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| ORG-001 | 建立組織 | P2 | 可建立工作室檔案 | not_started / not_verified |
| ORG-002 | 邀請成員 | P2 | 透過安全邀請加入 | not_started / not_verified |
| ORG-003 | 組織權限 | P2 | Owner、Admin、Staff | not_started / not_verified |
| ORG-004 | 多供給方排程 | P2 | 各自管理可用時間 | not_started / not_verified |
| ORG-005 | 組織服務項目 | P2 | 多人可提供指定服務 | not_started / not_verified |
| ORG-006 | 場地管理 | P2 | 防止同場地重複占用 | not_started / not_verified |
| ORG-007 | 設備管理 | P2 | 管理有限資源 | not_started / not_verified |
| ORG-008 | 多據點 | P3 | 支援不同地點 | not_started / not_verified |
| ORG-009 | 跨組織工作 | P3 | 經授權可加入多組織 | not_started / not_verified |
| ORG-010 | 組織層級報表 | P2 | 僅顯示授權業務資料 | not_started / not_verified |

## PRD-12｜Marketplace, Discovery & Matching

使用者故事：供給密度足夠後，需求方可找到合適服務。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| MKT-001 | 公開搜尋服務 | P2 | 可依類別搜尋 | not_started / not_verified |
| MKT-002 | 地區篩選 | P2 | 不需要揭露使用者精確位置 | not_started / not_verified |
| MKT-003 | 價格及時間篩選 | P2 | 結果符合目前條件 | not_started / not_verified |
| MKT-004 | 供給方評價 | P2 | 具備評價資格及申訴機制 | not_started / not_verified |
| MKT-005 | 服務推薦 | P3 | 可說明主要推薦依據 | not_started / not_verified |
| MKT-006 | 需求發布 | P3 | 可發出結構化需求 | not_started / not_verified |
| MKT-007 | 自動需求配對 | P3 | 遵守時間、地點及服務條件 | not_started / not_verified |
| MKT-008 | 平台導流歸因 | P3 | 清楚區分自帶與平台客戶 | not_started / not_verified |
| MKT-009 | 首次成交服務費 | P3 | 完成金流、法規及爭議處理設計 | not_started / not_verified |

## PRD-13｜Platform Administration

使用者故事：營運人員在最小必要權限及稽核下處理異常。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| ADM-001 | 使用者管理 | P0 | 可查看必要帳號狀態 | not_started / not_verified |
| ADM-002 | 供給方檔案管理 | P0 | 可處理不當內容及停權 | not_started / not_verified |
| ADM-003 | 預約異常查詢 | P0 | 可追蹤錯誤事件 | not_started / not_verified |
| ADM-004 | 系統健康狀態 | P0 | 顯示核心服務狀態 | not_started / not_verified |
| ADM-005 | 稽核紀錄 | P0 | 記錄重要管理操作 | partial / not_verified |
| ADM-006 | 通知失敗管理 | P0 | 可重試或處理失敗通知 | not_started / not_verified |
| ADM-007 | 使用者申訴 | P1 | 可建立並追蹤案件 | not_started / not_verified |
| ADM-008 | 訂閱管理 | P1 | 可查看平台訂閱狀態 | not_started / not_verified |
| ADM-009 | 平台分析 | P1 | 查看活躍供需雙方及服務完成量 | not_started / not_verified |
| ADM-010 | Feature Flags | P1 | 可控制功能開放 | not_started / not_verified |
| ADM-011 | 服務者驗證 | P2 | 可管理文件、審核與有效期限 | not_started / not_verified |
| ADM-012 | 交易爭議 | P2 | 可依平台責任範圍處理 | not_started / not_verified |

## PRD-14｜Group Sessions & Events

使用者故事：供給方管理團課場次、容量及實際參與。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| EVT-001 | 建立活動 | P2 | 可設定場次與時間 | not_started / not_verified |
| EVT-002 | 名額上限 | P2 | 不得超賣 | not_started / not_verified |
| EVT-003 | 多人報名 | P2 | 可設定報名人數 | not_started / not_verified |
| EVT-004 | 候補名單 | P2 | 名額釋出後可補位 | not_started / not_verified |
| EVT-005 | 最低開課人數 | P2 | 未達標時依規則處理 | not_started / not_verified |
| EVT-006 | 活動取消 | P2 | 通知所有有效參與者 | not_started / not_verified |
| EVT-007 | 報到紀錄 | P2 | 可記錄實際參與 | not_started / not_verified |
| EVT-008 | 套票抵用 | P2 | 不重複扣除使用權益 | not_started / not_verified |

## PRD-15｜Quote, Proposal & Project Delivery

使用者故事：雙方先同意有版本的服務提案，再追蹤交付及驗收。

| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |
|---|---|---|---|---|
| QTE-001 | 建立詢價表單 | P2 | 可依服務設定必要欄位 | not_started / not_verified |
| QTE-002 | 需求附件 | P2 | 安全限制檔案格式及大小 | not_started / not_verified |
| QTE-003 | 報價單 | P2 | 包含價格、幣別、範圍及有效期限 | not_started / not_verified |
| QTE-004 | 提案修訂 | P2 | 保存每個版本 | not_started / not_verified |
| QTE-005 | 提案接受 | P2 | 記錄接受者及接受版本 | not_started / not_verified |
| QTE-006 | 專案建立 | P3 | 依已接受提案建立 | not_started / not_verified |
| QTE-007 | 里程碑 | P3 | 可設定交付項目與期限 | not_started / not_verified |
| QTE-008 | 需求方驗收 | P3 | 有明確接受或要求修正流程 | not_started / not_verified |
| QTE-009 | 專案結案 | P3 | 保存交付與交易歷史 | not_started / not_verified |

## 不可省略的交易與隱私規則

已成立預約保存同意時的條件快照。帳號不得僅憑相同 Email 自動合併。所有私人資源檢查身分、租戶、權限及目前狀態。需求方能看到自己的跨供給方預約，不代表供給方能查看其他業者的服務紀錄。

排程採 15 分鐘粒度與半開區間，包含前後緩衝。資料庫唯一約束及原子提交保護占用；重要副作用使用 actor + operation + key 冪等範圍與 request hash。失敗改期保留原預約。

申請不保證占位，接受時重新檢查。供給方提出改期不等於需求方同意。服務完成、付款成功、訂單成立與權益扣除是不同事件。

套票採異動帳本，扣次事件只能執行一次；修正使用反向異動，不能直接覆寫歷史。報價提案保留版本，接受後不得單方修改核心條件。

預約與 Outbox 同一主交易提交，背景送信可重試；送出不代表已送達或已讀。私人備註僅供授權業者查看，不隨意蒐集敏感健康或生活資料。

金額保存整數最小單位及 ISO 4217 幣別；UTC 時間點搭配 IANA 時區，重複排班保存當地星期與鐘點。

## 相關文件

- [策略與使命](../00_STRATEGY/Vision_and_Mission.md)
- [資訊架構](../02_UX/Information_Architecture.md)
- [技術架構](../03_TECH/Architecture.md)
- [API 契約](../03_TECH/API_Specification.yaml)
- [測試計畫](../05_TESTING/Test_Plan.md)
- [Roadmap](Roadmap.md)
- [決策紀錄](../06_DELIVERY/Decision_Log.md)
