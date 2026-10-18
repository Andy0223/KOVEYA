# Test Plan

所有 P0 以完整功能及對應需求驗收，不以單一 helper 測試取代。測試層級：領域單元 → schema 約束 → Worker／D1 整合 → 瀏覽器 E2E → 真實手機與使用者 → 獨立安全及交易審查。

目前單元與 schema 測試使用 Vitest 及 Node SQLite，瀏覽器以 Playwright 對本機 Workers + D1。Node SQLite 測試不證明雲端 D1 的批次及併發行為。

## 非功能需求

| ID | 項目 | 目標 |
|---|---|---|
| NFR-001 | 手機相容 | 主要 iOS／Android 瀏覽器 |
| NFR-002 | 響應式設計 | 320px 主要流程無水平溢出 |
| NFR-003 | 可用性 | 封閉 Beta 期間量測及改善 |
| NFR-004 | API 延遲 | 主要讀取 P95 < 1 秒，不含第三方 |
| NFR-005 | 預約可靠性 | 無已知雙重有效預約缺陷 |
| NFR-006 | 身分安全 | 不信任前端自行提供的身分 |
| NFR-007 | 權限隔離 | 跨租戶越權測試全部通過 |
| NFR-008 | 資料備份 | 正式使用前完成復原演練 |
| NFR-009 | 時區正確性 | 跨時區及 DST 測試 |
| NFR-010 | API 安全 | Rate Limit、驗證、CSRF／XSS 防護 |
| NFR-011 | 可觀測性 | 核心錯誤可查詢追蹤 |
| NFR-012 | 無障礙 | WCAG 2.2 AA 設計目標 |
| NFR-013 | 資料可攜性 | 必要資料匯出流程 |
| NFR-014 | 成本可觀測性 | 主要雲端與通知用量可查看 |

## 執行

```sh
npm run check
npm run db:setup
npx playwright install chromium
npm run test:e2e
```

CI 依相同順序執行，不部署。真實 Safari／Android、無障礙完整審查、D1 100 請求、Email 故障注入及備份復原仍屬後續驗收。模擬手機 viewport 不等同真實手機。

原始 QA-011（套票）與 QA-016（支付 Webhook）隨對應階段啟用，不能假填通過。完整清單見 [E2E](E2E_Test_Cases.md)，執行結果見 [Progress](../06_DELIVERY/Progress.md)。
