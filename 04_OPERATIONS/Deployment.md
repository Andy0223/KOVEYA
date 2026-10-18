# Development & Deployment

## 本機

Node.js 22（至少 22.12）；repo 內執行：

```sh
npm ci
npm run db:setup
npm run dev
```

開啟 `http://127.0.0.1:5173`，示範供給方 `/p/demo-coach`。不需 Cloudflare 登入或 Email secrets；D1 使用 `.wrangler` 的本機狀態。不要將 `.wrangler`、`.env`、`.dev.vars` 提交。

`npm run check` 執行型別、單元／資料庫、文件及建置檢查。E2E 先 `npx playwright install chromium`，再 `npm run test:e2e`。

## 正式部署前置（尚未執行）

建立各自的 staging／production D1，替換全零 database_id，設置真正網域與 secrets；加入 Email、rate limit、監控、備份與回復演練。禁止把 demo seed 套入 production。資料庫及 secrets 必須按環境隔離。

Cloudflare Vite 會產生 `dist` 與建置後的 Wrangler 設定。正式部署需在相應環境 build，再套該環境 migrations、驗證回復策略與部署；目前沒有自動部署工作。

部署驗收包括 API 404 不誤回 SPA、深層網址可直接開啟、D1 migrations、環境隔離、登入與交易閉環、監測及回滾／資料修復方案。CI 只檢查，不建立雲端資源。
