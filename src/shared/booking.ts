export type Interval = { start: number; end: number };
export interface Schedule {
  revision: number;
  timezone: string;
  rules: (Interval & { weekday: number })[];
  exceptions: { date: string; intervals: Interval[] }[];
}
export interface Availability {
  date: string;
  timezone: string;
  slots: number[];
}
export interface BookingTerms {
  serviceId: string;
  serviceRevision: number;
  serviceName: string;
  providerName: string;
  providerSlug: string;
  resourceId: string;
  timezone: string;
  locationLabel: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceMinor: number;
  currency: string;
  cancellationPolicy: string;
  cancellationNoticeMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  paymentMethod: "ARRANGED_WITH_PROVIDER";
  acceptedAt: number;
}
export interface Booking {
  id: string;
  startsAt: number;
  endsAt: number;
  status: "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  version: number;
  terms: BookingTerms;
  clientName: string;
  isProvider: boolean;
}

export interface RescheduleProposal {
  id: string;
  startsAt: number;
  status: string;
  expiresAt: number;
  canRespond: boolean;
}
export interface BookingDetail extends Booking {
  events: {
    eventType: string;
    createdAt: number;
    payload: { reason?: string; startsAt?: number };
  }[];
  proposals: RescheduleProposal[];
}

export interface BookingRequest {
  id: string;
  startsAt: number;
  originalStartsAt: number;
  status:
    | "SUBMITTED"
    | "COUNTER_PROPOSED"
    | "ACCEPTED"
    | "REJECTED"
    | "WITHDRAWN"
    | "DECLINED"
    | "EXPIRED";
  version: number;
  expiresAt: number;
  bookingId: string | null;
  terms: BookingTerms;
  clientName: string;
  isProvider: boolean;
}
export interface RequestDetail extends BookingRequest {
  events: {
    eventType: string;
    createdAt: number;
    payload: { reason?: string; startsAt?: number };
  }[];
}
export interface Notification {
  id: string;
  eventType: string;
  entityType: "BOOKING" | "REQUEST";
  entityId: string;
  createdAt: number;
  readAt: number | null;
}
