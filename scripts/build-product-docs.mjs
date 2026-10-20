import { readFileSync, writeFileSync } from "node:fs";
const spec = JSON.parse(readFileSync("01_PRODUCT/requirements.json", "utf8"));
const introduction = `# KOVEYA Master Product Specification v1.0

**KOVEYA — Where People & Services Connect.**

制定日期：2026-10-18。規劃期間：2026 Q4–2027 Q4。初期市場：台灣、Bali／印尼。

狀態：Proposed。來源為使用者提供的 Master Plan & PRD v1.0；本檔為分拆整理後的工程基準，並非原文逐字備份。不得將規劃誤認為已實作或已驗收。

## 產品與策略

讓服務更容易被提供、發現、預約和管理。長期服務運動、教育、美容、攝影、顧問、旅遊體驗、創作者、自由接案及工作室；初期聚焦既有客戶需要反覆預約的獨立服務者。

先 SaaS，後 Marketplace。供給方先分享連結帶入既有客戶，之後驗證需求方跨供給方使用，最後才測試探索與媒合。

一個帳號具備需求方與供給方工作模式。組織管理員與平台管理員是管理權限，並非另外兩種市場角色。Web-first、Mobile-first；社群渠道可替換；初期供給方直接收款；規則引擎優先。

品牌方向包含 KOVEYA Business、Discover、Connect、Pay，初期仍只有一個網站及一套帳號。品牌法律確認、商標、網域及社群衝突檢查尚未完成。

對需求方：**One place for all your services.** 對供給方：**Run your service business, effortlessly.** 關係價值：**From first booking to lasting relationships.**

## v1.1 規劃補充 — 2026-10-20

Founder 新增主動客戶關心與回約、自然語言操作及語音輸入需求。另見 [產品補充](Client_Care_and_Action_Assistant_PRD.md) 與 [24 條結構化提案](planning_extensions.json)。屬 Proposed／未實作，原 173 條基準及 P0／Beta 驗收門檻保持不變。長期擴大平台操作覆蓋，首批先支援有限能力、釐清與確認後執行。

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

P0：MVP 上線不可缺少；P1：核心商業價值；P2：有需求證據後擴展；P3：長期探索。需求定義以 [requirements.json](requirements.json) 為結構化來源，修改後執行 \`node scripts/build-product-docs.mjs\`。以下狀態不代表單一工具測試結果，完整需求必須端到端驗收。

PRD-08 原文沒有逐項 ID；工程整理新增 NTF-001–013，順序對應原通知矩陣。其他 ID 沿用原規格。
`;

let markdown = introduction;
for (const module of spec.modules) {
  markdown += `\n## ${module.id}｜${module.title}\n\n使用者故事：${module.user_story}\n\n| ID | 功能 | 優先級 | 驗收標準 | 實作／驗收狀態 |\n|---|---|---|---|---|\n`;
  for (const r of module.requirements)
    markdown += `| ${r.id} | ${r.function} | ${r.priority} | ${r.acceptance_criteria} | ${r.implementation_status} / ${r.acceptance_status} |\n`;
}
markdown += `
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
`;
writeFileSync("01_PRODUCT/Master_PRD.md", markdown);
console.log(`Generated Master_PRD.md (${spec.modules.length} modules).`);
