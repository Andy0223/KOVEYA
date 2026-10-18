export type Locale = "zh-TW" | "en";
export interface Account {
  user: {
    id: string;
    name: string;
    email: string;
    locale: Locale;
    timezone: string;
  };
  business: { orgId: string; publicName: string; slug: string } | null;
}
export interface BusinessProfile {
  id: string;
  publicName: string;
  slug: string;
  bio: string;
  locationLabel: string;
  timezone: string;
  published: boolean;
}
export interface ManagedService {
  id: string;
  revision: number;
  name: string;
  description: string;
  mode: "INSTANT" | "REQUEST";
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  delivery: "ONLINE" | "IN_PERSON" | "AT_CLIENT";
  locationLabel: string;
  timezone: string;
  durationMinutes: number;
  pricingType: "FIXED" | "FREE" | "QUOTE";
  priceMinor: number | null;
  currency: "TWD" | "IDR" | "USD" | "JPY" | "EUR";
  cancellationNoticeMinutes: number;
  cancellationPolicy: string;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}
export const currencyDigits = {
  TWD: 2,
  IDR: 2,
  USD: 2,
  JPY: 0,
  EUR: 2,
} as const;

export function parsePrice(
  value: string,
  currency: keyof typeof currencyDigits,
): number | null {
  const digits = currencyDigits[currency];
  const pattern =
    digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole + fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= 1_000_000_000_000
    ? amount
    : null;
}
