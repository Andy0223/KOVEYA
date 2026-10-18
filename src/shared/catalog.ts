export interface PublicOffering {
  id: string;
  durationMinutes: number;
  pricingType: "FIXED" | "FREE" | "QUOTE";
  priceMinor: number | null;
  currency: string;
}

export interface PublicService {
  id: string;
  name: string;
  description: string;
  mode: "INSTANT" | "REQUEST";
  delivery: "ONLINE" | "IN_PERSON" | "AT_CLIENT";
  locationLabel: string;
  timezone: string;
  cancellationPolicy: string;
  offerings: PublicOffering[];
}

export interface PublicProvider {
  publicName: string;
  slug: string;
  bio: string;
  locationLabel: string;
  timezone: string;
  services: PublicService[];
}

export type ApiResponse<T> =
  | { data: T; requestId: string }
  | { error: { code: string; message: string }; requestId: string };
