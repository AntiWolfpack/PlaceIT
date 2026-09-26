import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { menuItemsTable } from "./menu-items";
import { vendorsTable } from "./vendors";

export const ordersTable = pgTable("orders", {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendorsTable.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    collectionNote: text("collection_note"),
    orderTotalCents: integer("order_total_cents").notNull(),
    bookingFeeCents: integer("booking_fee_cents").notNull(),
    commissionRateBps: integer("commission_rate_bps").notNull().default(1500),
    commissionAmountCents: integer("commission_amount_cents").notNull(),
    dueAtCollectionCents: integer("due_at_collection_cents").notNull(),
    paymentStatus: text("payment_status").notNull().default("pending"),
    orderStatus: text("order_status").notNull().default("awaiting_payment"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    checkoutUrl: text("checkout_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItemsTable = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendorsTable.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => menuItemsTable.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
  },
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;