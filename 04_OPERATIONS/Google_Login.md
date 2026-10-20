# Google 登入設定與驗收（v0.6.0）

狀態（2026-10-20）：Google Cloud 條款由 Founder 完成、OAuth Web Client 已設定並部署。Founder 既有帳號完成真實 Google 連結、登出與重新登入；第二個帳號及雙方預約流程尚待驗收。

## Google Cloud

使用 `koveya.test@gmail.com`，建立獨立 KOVEYA 專案；不啟用計費、免費試用或額外 Google API。若首次顯示服務條款，由 Founder 閱讀接受或於當下明確確認後再繼續。

在 Google Auth Platform 設定 KOVEYA 品牌、產品支援與開發者聯絡 Email。試用階段選 External／Testing（若介面適用），可將 Founder 與測試帳號列入名單作管理紀錄。僅基本身分 scope 的 Google 登入有例外：不必在測試名單上也可登入；此名單不是 KOVEYA 的存取控制。只使用登入必要的 `openid`、`email`、`profile`，不要求 Gmail、Drive 或 Calendar 存取。

建立 OAuth Client，Application type 選 Web application。Authorized JavaScript origins：

- `https://koveya-trial.koveya-test.workers.dev`
- 本機需要真實 Google 登入時另加 `http://localhost:5173` 與實際使用的 loopback origin；不要加入未使用的網站。

目前使用 Google Identity Services 的 JavaScript callback，不需 redirect URI、不需 Client Secret。只將公開的 Client ID 設到 trial 的 `GOOGLE_CLIENT_ID`。不得將 Google Client Secret、ID Token 或 Session 寫入 repo、文件或日誌。

## 部署

1. 將公開 Client ID 加入 `wrangler.jsonc` 的 `env.trial.vars.GOOGLE_CLIENT_ID`。
2. `npx wrangler d1 migrations apply DB --remote --env trial`，新增 0007 Google challenge 與唯一索引，不改既有帳號資料。
3. `CLOUDFLARE_ENV=trial npm run build`。
4. `npx wrangler deploy --config dist/koveya/wrangler.json`。
5. HTTPS health ready，`/api/v1/auth/config` 回報公開 Google Client ID；登入頁出現官方 Google 按鈕。未設定時不顯示按鈕，原 Email 登入保留。

## 既有帳號與第二帳號

既有的 `koveya.test@gmail.com` 已有品牌資料：先用 Email 登入（或保留目前 Session），進入帳號設定 → 設定 Google 登入 → 選擇相同 Email 的 Google 帳號。這是明確連結，不會因 Email 一致而自動合併。

第二個尚未註冊 KOVEYA 的 Google 帳號，可用另一瀏覽器／無痕視窗，直接透過 Google 登入建立需求方帳號。若該 Email 已有 KOVEYA 帳號，也必須先登入再連結。錯選不同 Email 或已連到其他使用者的 Google 身分會拒絕。

## 安全與驗收

- 使用 jose 與固定 Google JWKS URL 驗證 RS256、issuer、audience／azp、exp／iat、subject、email_verified 與 nonce。
- 驗證資料有效 10 分鐘，綁定 HttpOnly／Secure／SameSite=Lax 瀏覽器 cookie；資料庫只存 nonce／cookie 的 hash。
- nonce 消費、身分寫入、新 Session、舊 Session 撤銷與 audit 同一 D1 batch，任何寫入失敗回滾。已使用 nonce 不能建立第二個 Session。
- 連結綁定發起時的登入 Session，消費時再次檢查該 Session 與帳號有效；不接受前端自行指定 userId。
- Google Subject 是登入識別；不將 Email 相同視為自動合併授權；不保存 Google access／refresh token。
- Google script 被封鎖時可重試、仍能用 Email 登入；若 Google 憑證或網路驗證失敗，沒有降級成未驗證登入。
- 新增真實 RS256 簽章測試與 UI adapter contract 測試；雲端必須另外驗收 Founder 連結、登出再登入、第二帳號登入、雙方預約與改期。Google 第三方服務不能以測試替身宣稱已驗收。

官方參考：[GIS 設定](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)、[後端 ID token 驗證](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)。


## 2026-10-20 雲端實測

- 專案 `skilled-clover-512110-j1`，名稱 KOVEYA，帳號 `koveya.test@gmail.com`；External／Testing，未啟用計費或免費試用。
- Web Client 名稱 `KOVEYA Trial Web`；只授權試用網站 origin，未設定重新導向 URI。
- 公開 Client ID 已加入 trial vars；應用程式不使用、不保存 Client Secret，未下載 OAuth JSON。
- 0007 migration 遠端套用成功；部署 Worker 版本 `f5cfd61d-9eba-40c8-8034-656fb414e420`，health 0.6.0／ready，auth/config 同時提供 Google 與 Email。
- Chrome 實測：原 Email Session → Google 按鈕 → 選產品帳號 → 同意基本名稱／相片／Email → 返回原帳號設定頁。再登出 KOVEYA，透過 Google 按鈕登入同一帳號成功；不需登入信。
- 連結後 users 仍為 1，Google identity 1；沒有新增重複帳號，原品牌資料保留。Google 真實 consent 顯示試用網域 `koveya-test.workers.dev`。
- 第二個 Gmail 尚待 Founder 指定以便代測，名單目前僅產品帳號；這不是第二帳號登入的前置限制。只有 openid／email／profile 時，Google 官方允許名單外帳號登入。沒有把同帳號登出再登入視為雙帳號流程通過。

Google 基本身分 scope 的測試名單例外：[Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)。
