import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetVendorParams,
  GetVendorResponse,
  ListVendorsQueryParams,
  ListVendorsResponse,
} from "@workspace/api-zod";
import { db, menuItemsTable, vendorsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/vendors", async (req, res): Promise<void> => {
  const rawOpenNow = req.query.openNow;
  if (
    rawOpenNow !== undefined &&
    rawOpenNow !== "true" &&
    rawOpenNow !== "false"
  ) {
    res.status(400).json({ error: "openNow must be true or false" });
    return;
  }

  const parsed = ListVendorsQueryParams.safeParse({
    ...req.query,
    ...(rawOpenNow === undefined ? {} : { openNow: rawOpenNow === "true" }),
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions: SQL[] = [];
  const { search, category, openNow } = parsed.data;
  if (category) conditions.push(eq(vendorsTable.category, category));
  if (openNow) conditions.push(eq(vendorsTable.isOpen, true));
  if (search?.trim()) {
    const escaped = search.trim().slice(0, 120).replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    conditions.push(
      or(
        ilike(vendorsTable.name, pattern),
        ilike(vendorsTable.description, pattern),
        ilike(vendorsTable.category, pattern),
        ilike(vendorsTable.neighborhood, pattern),
        ilike(vendorsTable.city, pattern),
      )!,
    );
  }

  const [vendors, itemCounts] = await Promise.all([
    db
      .select()
      .from(vendorsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(vendorsTable.isFeatured), desc(vendorsTable.isOpen), asc(vendorsTable.name)),
    db
      .select({ vendorId: menuItemsTable.vendorId, total: count() })
      .from(menuItemsTable)
      .where(eq(menuItemsTable.isAvailable, true))
      .groupBy(menuItemsTable.vendorId),
  ]);

  const countByVendor = new Map(itemCounts.map((entry) => [entry.vendorId, entry.total]));
  const result = vendors.map((vendor) => ({
    ...vendor,
    menuItemCount: countByVendor.get(vendor.id) ?? 0,
  }));
  res.json(ListVendorsResponse.parse(result));
});

router.get("/vendors/:vendorId", async (req, res): Promise<void> => {
  const params = GetVendorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, params.data.vendorId));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  const menuItems = await db
    .select()
    .from(menuItemsTable)
    .where(and(eq(menuItemsTable.vendorId, vendor.id), eq(menuItemsTable.isAvailable, true)))
    .orderBy(asc(menuItemsTable.category), desc(menuItemsTable.isPopular), asc(menuItemsTable.name));

  res.json(
    GetVendorResponse.parse({
      vendor: { ...vendor, menuItemCount: menuItems.length },
      menuItems,
    }),
  );
});

export default router;