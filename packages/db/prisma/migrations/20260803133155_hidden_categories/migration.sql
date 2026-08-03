-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outlet_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🍽️',
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "categories_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_categories" ("created_at", "emoji", "group_id", "id", "is_active", "name", "note", "outlet_id", "sort_order", "updated_at") SELECT "created_at", "emoji", "group_id", "id", "is_active", "name", "note", "outlet_id", "sort_order", "updated_at" FROM "categories";
DROP TABLE "categories";
ALTER TABLE "new_categories" RENAME TO "categories";
CREATE INDEX "categories_outlet_id_group_id_sort_order_idx" ON "categories"("outlet_id", "group_id", "sort_order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
