import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  neighborhood: text("neighborhood").notNull(),
  city: text("city").notNull(),
  province: text("province").notNull(),
  pickupAddress: text("pickup_address").notNull(),
  rating: real("rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  pickupEtaMinutes: integer("pickup_eta_minutes").notNull().default(25),
  heroImageUrl: text("hero_image_url"),
  payfastMerchantId: text("payfast_merchant_id"),
  isOpen: boolean("is_open").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;