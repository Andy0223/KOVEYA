# Shared Platform

一套帳號、身分、通知及權限基礎支援兩種工作模式。組織管理及平台管理是權限。需求詳見 [Master PRD](Master_PRD.md)。

P0：Email 驗證連結一次性短效、Session 可撤銷、姓名／語言／時區、資料匯出與刪除申請；交易價格幣別與政策快照；站內／Email 重要狀態通知。

平台依賴完整排程一致性、冪等、租戶隔離、Outbox 與稽核。付款狀態、預約狀態與履約狀態分開。

OAuth 使用相同 Email 不自動合併帳號。第三方登入、付款、LINE／WhatsApp、行事曆等透過可替換 adapter。

MVP 語言：繁體中文與英文。服務者自己的介紹不自動翻譯。UTC 時間點與 IANA 時區並存，原幣計價，不提供匯兌。
