-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outlet_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "business_date" TEXT NOT NULL,
    "user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLACED',
    "fulfilment_type" TEXT NOT NULL DEFAULT 'DELIVERY',
    "address_json" TEXT,
    "pickup_token" TEXT,
    "subtotal_paise" BIGINT NOT NULL,
    "delivery_fee_paise" BIGINT NOT NULL DEFAULT 0,
    "handling_fee_paise" BIGINT NOT NULL DEFAULT 0,
    "tax_paise" BIGINT NOT NULL DEFAULT 0,
    "total_paise" BIGINT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "placed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editable_until" DATETIME NOT NULL,
    "promised_at" DATETIME NOT NULL,
    "delivered_at" DATETIME,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "prep_seconds" INTEGER NOT NULL DEFAULT 0,
    "edit_count" INTEGER NOT NULL DEFAULT 0,
    "customer_note" TEXT,
    "otp_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_orders" ("address_json", "business_date", "created_at", "customer_name", "customer_note", "customer_phone", "delivered_at", "delivery_fee_paise", "edit_count", "editable_until", "fulfilment_type", "handling_fee_paise", "id", "order_number", "otp_hash", "outlet_id", "payment_method", "payment_status", "pickup_token", "placed_at", "prep_seconds", "promised_at", "status", "subtotal_paise", "tax_paise", "total_paise", "updated_at", "user_id", "version") SELECT "address_json", "business_date", "created_at", "customer_name", "customer_note", "customer_phone", "delivered_at", "delivery_fee_paise", "edit_count", "editable_until", "fulfilment_type", "handling_fee_paise", "id", "order_number", "otp_hash", "outlet_id", "payment_method", "payment_status", "pickup_token", "placed_at", "prep_seconds", "promised_at", "status", "subtotal_paise", "tax_paise", "total_paise", "updated_at", "user_id", "version" FROM "orders";
DROP TABLE "orders";
ALTER TABLE "new_orders" RENAME TO "orders";
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");
CREATE INDEX "orders_outlet_id_business_date_status_idx" ON "orders"("outlet_id", "business_date", "status");
CREATE INDEX "orders_user_id_placed_at_idx" ON "orders"("user_id", "placed_at");
CREATE INDEX "orders_status_placed_at_idx" ON "orders"("status", "placed_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
