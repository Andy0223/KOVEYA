import type { Booking } from "./booking";
export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedAccount: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
  bookingCount: number;
  completedCount: number;
  lastServiceAt: number | null;
  nextBookingAt: number | null;
}
export interface ClientList {
  items: Client[];
  total: number;
  offset: number;
  limit: number;
}
export interface ClientDetail {
  client: Client;
  bookings: Booking[];
  totalBookings: number;
  offset: number;
  limit: number;
}
export interface MyProvider {
  publicName: string;
  slug: string;
  locationLabel: string;
  timezone: string;
  bookingCount: number;
  lastBookingAt: number;
}
