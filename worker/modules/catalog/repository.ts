import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  offerings,
  organizations,
  providerProfiles,
  services,
} from "../../db/schema";
import type { PublicProvider } from "../../../src/shared/catalog";

export async function getPublicProvider(
  binding: D1Database,
  slug: string,
): Promise<PublicProvider | null> {
  const db = drizzle(binding);
  const [provider] = await db
    .select({
      orgId: providerProfiles.orgId,
      publicName: providerProfiles.publicName,
      slug: providerProfiles.slug,
      bio: providerProfiles.bio,
      locationLabel: providerProfiles.locationLabel,
      timezone: providerProfiles.timezone,
    })
    .from(providerProfiles)
    .innerJoin(organizations, eq(organizations.id, providerProfiles.orgId))
    .where(
      and(
        eq(providerProfiles.slug, slug),
        eq(providerProfiles.published, true),
        eq(organizations.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!provider) return null;

  const rows = await db
    .select({
      id: services.id,
      revision: services.revision,
      name: services.name,
      description: services.description,
      mode: services.mode,
      delivery: services.delivery,
      locationLabel: services.locationLabel,
      timezone: services.timezone,
      cancellationPolicy: services.cancellationPolicy,
      cancellationNoticeMinutes: services.cancellationNoticeMinutes,
      offeringId: offerings.id,
      durationMinutes: offerings.durationMinutes,
      pricingType: offerings.pricingType,
      priceMinor: offerings.priceMinor,
      currency: offerings.currency,
    })
    .from(services)
    .innerJoin(
      offerings,
      and(
        eq(services.id, offerings.serviceId),
        eq(services.orgId, offerings.orgId),
      ),
    )
    .where(
      and(eq(services.orgId, provider.orgId), eq(services.status, "PUBLISHED")),
    )
    .orderBy(services.id, offerings.id);

  const publicServices: PublicProvider["services"] = [];
  for (const row of rows) {
    let service = publicServices.find((s) => s.id === row.id);
    if (!service) {
      service = {
        id: row.id,
        revision: row.revision,
        name: row.name,
        description: row.description,
        mode: row.mode,
        delivery: row.delivery,
        locationLabel: row.locationLabel,
        timezone: row.timezone,
        cancellationPolicy: row.cancellationPolicy,
        cancellationNoticeMinutes: row.cancellationNoticeMinutes,
        offerings: [],
      };
      publicServices.push(service);
    }
    service.offerings.push({
      id: row.offeringId,
      durationMinutes: row.durationMinutes,
      pricingType: row.pricingType,
      priceMinor: row.priceMinor,
      currency: row.currency,
    });
  }
  return {
    publicName: provider.publicName,
    slug: provider.slug,
    bio: provider.bio,
    locationLabel: provider.locationLabel,
    timezone: provider.timezone,
    services: publicServices,
  };
}
