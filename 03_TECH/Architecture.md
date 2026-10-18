# Architecture

模組化單體：React + TypeScript + Vite + Tailwind，Cloudflare Workers + Hono API，D1 關聯資料庫，Drizzle schema／migration。單一 repo 與同源 API，降低初期整合成本。

目前前端 `src/web`，共用回應型別 `src/shared`，API 入口 `worker/index.ts`，公開目錄 `worker/modules/catalog`，排程純函式 `worker/modules/scheduling`，資料模型 `worker/db/schema.ts`。

目前只有公開供給方讀取及健康檢查。React 首頁、需求方與供給方介紹可運行。登入、管理、預約交易及通知尚未接上。

後續依序接身分、租戶授權、服務寫入、排班、預約生命週期、客戶、Outbox 與通知。R2、Resend、Cron／Queues 透過 adapter 加入；不預先建立未使用的外部資源。

資料庫保護占用唯一性及複合租戶外鍵。讀取可用時間後仍須在提交時重新檢查，不能把先查後寫視為防撞。

正式部署前要另外建立 staging／production 的 D1 與 secrets，完成備份復原及真實環境測試。現有全零 database_id 只供本機設定辨識。

技術接法依 [Cloudflare React SPA 教學](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)、[Drizzle D1 文件](https://orm.drizzle.team/docs/get-started/d1-new) 及 [Hono 測試文件](https://hono.dev/docs/guides/testing)，查閱日期 2026-10-18。
