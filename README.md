# KOVEYA

**Where People & Services Connect.**

連結需求方與供給方的全球服務平台。先建立供給方營運 SaaS，再依實際供需密度發展 Marketplace。

## 目前進度

v0.5.1 已修正預約停用／等待狀態、查詢與送出失敗復原及免費付款提示；見 [預約 review](05_TESTING/Booking_Review_2026-10-19.md)。Founder 試用環境已部署，正式 Beta 驗收仍未完成。

Client Operations & Calendar v0.5：可在本機完成帳號、品牌與服務、排班、直接／申請式預約、取消與改期、履約、站內通知、客戶聯絡與歷史、手動安排及 ICS 匯出。手動客戶不自動連結帳號，代為記錄清楚標示來源。交易 Email、品牌圖片、平台管理、隱私實際作業與正式部署仍待完成。

本機登入透過明確啟用的驗證預覽測試，不寄真實 Email。Resend adapter 已實作，正式寄送仍需設定已驗證寄件網域與 secrets，並做整合驗證。資料匯出／刪除目前只記錄人工處理申請。

第一個正式里程碑：供給方建立公開服務頁、分享連結，需求方完成驗證與預約，雙方能管理、取消、改期及查看紀錄。尚未完成完整 P0 或 Beta 驗收。

## 開始開發

使用 Node.js 22（至少 22.12）：

```sh
npm ci
test -f .dev.vars || cp .dev.vars.example .dev.vars
npm run db:setup
npm run dev
```

開啟 `http://127.0.0.1:5173`。示範頁為 `/p/demo-coach`，內容為虛構資料，不接受真實預約。本機使用 Workers runtime 與 D1，不需要 Cloudflare 帳號或 Email secrets。請勿覆寫已有的 `.dev.vars`；需要本機驗證入口時，設定 `LOCAL_EMAIL_PREVIEW=true` 並重啟 dev。

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` 包含型別、單元／資料庫約束、文件與 build。E2E 每次建立獨立 D1，測試正式 build 的登入、服務管理、排班、預約／申請、取消、改期、通知、客戶／手動安排、ICS 下載與 D1 競爭；不等同完整 PRD、正式寄信或真實手機驗收。正式部署前見 [Deployment](04_OPERATIONS/Deployment.md)。

## 文件入口

- [Master PRD：15 模組與 173 條需求](01_PRODUCT/Master_PRD.md)
- [結構化需求來源](01_PRODUCT/requirements.json)
- [MVP 範圍與驗收條件](01_PRODUCT/MVP_Scope.md)
- [資訊架構與實際路徑](02_UX/Information_Architecture.md)
- [行事曆匯出](03_TECH/Calendar_Export.md)、[架構](03_TECH/Architecture.md)、[資料庫](03_TECH/Database_Schema.md)、[API 契約](03_TECH/API_Specification.yaml)
- [測試與上線門檻](05_TESTING/Test_Plan.md)
- [待決策事項](06_DELIVERY/Decision_Log.md)、[Backlog](06_DELIVERY/Sprint_Backlog.md)、[進度](06_DELIVERY/Progress.md)

文件依使用者提供的 2026-10-18 Master Plan & PRD v1.0 分拆整理，並非逐字原文備份。需求 ID 保持原編號；通知模組新增 NTF ID。定價、時程、政策及供應商額度仍須驗證。

修改結構化需求後執行 `node scripts/build-product-docs.mjs` 更新 Master PRD。

## 程式結構

```text
src/web/             React 前端、雙語文案、響應式樣式
src/shared/          前後端共用公開型別
worker/modules/      身分、業務、公開目錄與排程領域邏輯
worker/db/           Drizzle schema
migrations/          可執行 D1 migrations 與 schema snapshots
seeds/               虛構的本機資料
tests/              單元、API 邊界、SQLite 約束測試
e2e/                Playwright 瀏覽器測試
00_STRATEGY/         策略與商業假設
01_PRODUCT/          產品規格與需求追蹤
02_UX/               使用流程與設計起點
03_TECH/             架構、API、資料與安全
04_OPERATIONS/       開發、部署、監控與復原
05_TESTING/          QA 計畫與上線門檻
06_DELIVERY/         任務、決策與進度
```

技術：React、TypeScript、Vite、Tailwind CSS、Hono、Cloudflare Workers／D1、Drizzle、Vitest、Playwright。R2／Resend 等整合依實際模組需求加入。

時間保存 UTC 時間點及 IANA 時區；金額保存最小貨幣單位整數及幣別。Secrets 與本機資料不進 Git。
