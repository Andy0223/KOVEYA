# Integration Architecture

通用網頁是核心入口，Instagram／LINE／WhatsApp／TikTok 可分享相同服務連結。MVP 不依賴 MINI App 驗證、社群自動私訊、生成式 AI 或跨國金流。

| 階段 | 整合 |
|---|---|
| MVP | Email 驗證／交易通知、ICS、社群分享連結、R2 品牌圖片 |
| P1 | Google／LINE Login、來源分析、Google Calendar 同步、平台訂閱評估 |
| P2+ | LINE／WhatsApp 主動訊息、區域支付、Outlook、多日曆及 AI |

Email 透過 adapter，由背景工作送信並保留 provider reference、嘗試次數、下一次重試及錯誤分類。Outbox 至少一次交付，消費者必須去重。

OAuth 採 state／PKCE（適用時）、精準回跳 URI、scope 最小化與安全帳號連結。支付 Webhook 驗簽、去重，與預約及付款狀態分開。

供應商額度、價格、支援國家及 LINE／WhatsApp 政策在實際整合前重新核對官方資料；原文 2026-10 的敘述在本 repo 尚未獨立查核，不作為已驗證依據。

目前未建立外部 Email、R2、OAuth、支付或通訊平台資源。
