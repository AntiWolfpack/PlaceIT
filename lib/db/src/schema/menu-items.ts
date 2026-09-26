import { createInsertSchema } from "drizzle-zod";
import { boolean, foreignKey, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const menuItemsTable = pgTable(
  "menu_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendorsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    imageUrl: text("image_url"),
    isAvailable: boolean("is_available").notNull().default(true),
    isPopular: boolean("is_popular").notNull().default(false),
  },
  (table) => ({
    itemVendorUnique: uniqueIndex("menu_items_id_vendor_id_unique").on(table.id, table.vendorId),
  }),
);

export const insertMenuItemSchema = createInsertSchema(menuItemsTable).omit({ id: true });
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItem = typeof menuItemsTable.$inferSelect;