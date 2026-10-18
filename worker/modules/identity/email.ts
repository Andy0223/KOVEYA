import { ApiError } from "../../http";

/** No real email is sent in local-preview mode. Provider errors never include API keys or login links. */
export async function deliverLoginEmail(
  apiKey: string,
  from: string,
  email: string,
  url: string,
  locale: string,
  deliveryId: string,
) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `login/${deliveryId}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject:
          locale === "en"
            ? "Your KOVEYA sign-in link"
            : "你的 KOVEYA 登入驗證連結",
        text:
          locale === "en"
            ? `Sign in to KOVEYA using the same browser where you requested this link. It expires in 10 minutes and works once.\n\n${url}\n\nIf you did not request this email, you can ignore it.`
            : `請在發送連結的同一瀏覽器完成 KOVEYA 登入。連結有效期 10 分鐘，僅能使用一次。\n\n${url}\n\n若你未要求登入，請忽略此信。`,
      }),
    });
    if (!response.ok) throw new Error("Delivery failed");
  } catch {
    throw new ApiError("EMAIL_UNAVAILABLE", 503);
  }
}
