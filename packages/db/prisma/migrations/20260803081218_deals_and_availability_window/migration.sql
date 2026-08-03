-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outlet_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_veg" BOOLEAN NOT NULL DEFAULT true,
    "prep_time_seconds" INTEGER NOT NULL DEFAULT 420,
    "tags_json" TEXT NOT NULL DEFAULT '[]',
    "in_stock" BOOLEAN NOT NULL DEFAULT true,
    "stock_remaining" INTEGER,
    "is_deal" BOOLEAN NOT NULL DEFAULT false,
    "available_from" DATETIME,
    "available_until" DATETIME,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    CONSTRAINT "products_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_products" ("category_id", "created_at", "deleted_at", "description", "id", "in_stock", "is_veg", "name", "outlet_id", "prep_time_seconds", "sort_order", "stock_remaining", "tags_json", "updated_at") SELECT "category_id", "created_at", "deleted_at", "description", "id", "in_stock", "is_veg", "name", "outlet_id", "prep_time_seconds", "sort_order", "stock_remaining", "tags_json", "updated_at" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE INDEX "products_outlet_id_category_id_sort_order_idx" ON "products"("outlet_id", "category_id", "sort_order");
CREATE INDEX "products_is_deal_available_until_idx" ON "products"("is_deal", "available_until");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
