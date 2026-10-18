# Development & Deployment

## 本機

Node.js 22（至少 22.12）；repo 內執行：

```sh
npm ci
test -f .dev.vars || cp .dev.vars.example .dev.vars
npm run db:setup
npm run dev
```

開啟 `http://127.0.0.1:5173`，示範供給方 `/p/demo-coach`。本機不需 Cloudflare 登入或 Email secrets；D1 使用 `.wrangler` 的本機狀態。不要將 `.wrangler`、`.env`、`.dev.vars` 提交。

`npm run check` 執行型別、單元／資料庫、文件及建置檢查。E2E 先 `npx playwright install chromium`，再 `npm run test:e2e`。測試伺服器在 4173，使用獨立 D1 與正式 build，結束後清理自己建立的測試資料夾，不使用開發資料庫。測試會先確認本機驗證模式，禁止經 E2E 寄真實 Email。

## Email 登入設定

`.dev.vars.example` 明確啟用 `LOCAL_EMAIL_PREVIEW=true`。只在 loopback 主機提供驗證預覽 URL，不寄信；設定異動後重啟 dev。這是本機測試入口，不能作為正式 Email 身分驗證證據。

正式環境不帶本機旗標，設定 `APP_ORIGIN=https://正式網域`（不含尾斜線）、`RESEND_API_KEY`、`EMAIL_FROM`（已驗證寄件網域）。寄信 adapter 有逾時與 provider idempotency；失敗刪除未送達 challenge，回服務不可用。實際寄送尚未驗證。

驗證連結十分鐘一次性，透過 URL fragment 傳遞 token；確認頁載入後清除網址片段，使用者再按確認，以避免 GET 預讀直接登入。連結綁定發送時瀏覽器，需在相同瀏覽器開啟。Session 七天，到期／停權／撤銷即失效。

如已有 `.dev.vars`，請編輯旗標而非直接覆寫。所有私人寫入必須 JSON 並提供正確 Origin；前端瀏覽器會自動設定。

## 正式部署前置（尚未執行）

建立各自的 staging／production D1，替換全零 database_id，設置真正網域與 secrets；加入 Email、rate limit、監控、備份與回復演練。禁止把 demo seed 套入 production。資料庫及 secrets 必須按環境隔離。

Cloudflare Vite 會產生 `dist` 與建置後的 Wrangler 設定。正式部署需在相應環境 build，再套該環境 migrations、驗證回復策略與部署；目前沒有自動部署工作。

部署驗收包括 API 404 不誤回 SPA、深層網址可直接開啟、D1 migrations、環境隔離、登入與交易閉環、監測及回滾／資料修復方案。CI 只檢查，不建立雲端資源。

Vite build 會複製 `.dev.vars` 到 Worker 輸出供本機 preview 使用；它不在前端 assets，且不會隨 Worker 部署。不要將整個輸出資料夾當公開靜態檔上傳。正式 secrets 需透過 Cloudflare 設定。[官方說明](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)

## v0.4 背景工作

Worker 預設匯出含 fetch 與 scheduled handler；wrangler.jsonc 設定每五分鐘 Cron。每次至多持久化五筆已到期申請並處理十筆待送 Outbox，以限制單次查詢量；大量積壓會延遲，正式環境需依量測設計 Queues／告警與容量。

本機開啟通知中心或 GET /api/v1/notifications 也會處理一批，無須公開未驗證的 Cron HTTP 入口。正式 Cron 需部署到正確環境並實測；目前只有 scheduled handler 的本機測試，沒有正式雲端證據。

站內通知失敗以 30 秒開始指數退避，最多五次；失敗原因與下次嘗試時間保留在 Outbox。終止失敗後需日後管理介面或授權營運程序處理，不能無限重送。此版本不寄交易 Email。
