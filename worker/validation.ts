import { z } from "zod";

export const timezone = z
  .string()
  .max(80)
  .regex(/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
export const slug = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine(
    (value) =>
      ![
        "demo-coach",
        "admin",
        "api",
        "app",
        "business",
        "auth",
        "settings",
        "koveya",
      ].includes(value),
  );
export const locale = z.enum(["zh-TW", "en"]);

export function safeReturnTo(value: string): string {
  // Keep local booking intent query parameters, reject schemes, backslashes, controls and protocol-relative URLs.
  if (
    value.length > 1500 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/app";
  try {
    const url = new URL(value, "https://koveya.invalid");
    if (
      url.origin !== "https://koveya.invalid" ||
      !/^\/(app|business|p)(\/|$)/.test(url.pathname)
    )
      return "/app";
    return url.pathname + url.search;
  } catch {
    return "/app";
  }
}

export const emailStartInput = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    returnTo: z.string().default("/app").transform(safeReturnTo),
    locale: locale.default("zh-TW"),
  })
  .strict();

export const profileInput = z
  .object({
    publicName: z.string().trim().min(1).max(100),
    slug,
    bio: z.string().trim().max(2000).default(""),
    locationLabel: z.string().trim().max(200).default(""),
    timezone,
    published: z.boolean().default(true),
  })
  .strict();

const minutes = z.number().int().min(0).max(1440).multipleOf(15);
const currencies = ["TWD", "IDR", "USD", "JPY", "EUR"] as const;
export const serviceInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000),
    mode: z.enum(["INSTANT", "REQUEST"]),
    delivery: z.enum(["ONLINE", "IN_PERSON", "AT_CLIENT"]),
    locationLabel: z.string().trim().min(1).max(200),
    timezone,
    durationMinutes: z.number().int().min(15).max(720).multipleOf(15),
    pricingType: z.enum(["FIXED", "FREE", "QUOTE"]),
    priceMinor: z.number().int().min(0).max(1_000_000_000_000).nullable(),
    currency: z.enum(currencies),
    cancellationNoticeMinutes: z.number().int().min(0).max(43200),
    cancellationPolicy: z.string().trim().min(1).max(2000),
    minNoticeMinutes: z.number().int().min(0).max(43200),
    maxAdvanceDays: z.number().int().min(1).max(365),
    bufferBeforeMinutes: minutes,
    bufferAfterMinutes: minutes,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.pricingType === "FIXED" &&
        (value.priceMinor === null || value.priceMinor <= 0)) ||
      (value.pricingType === "FREE" && value.priceMinor !== 0) ||
      (value.pricingType === "QUOTE" &&
        (value.priceMinor !== null || value.mode !== "REQUEST")) ||
      value.durationMinutes +
        value.bufferBeforeMinutes +
        value.bufferAfterMinutes >
        1440
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid price, booking mode, or total allocation.",
      });
    }
  });

export const serviceEditInput = serviceInput.safeExtend({
  expectedRevision: z.number().int().positive(),
});
