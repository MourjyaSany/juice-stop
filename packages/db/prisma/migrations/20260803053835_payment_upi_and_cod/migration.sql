-- AlterTable
ALTER TABLE "orders" ADD COLUMN "paid_at" DATETIME;
ALTER TABLE "orders" ADD COLUMN "payment_confirmed_by" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_expires_at" DATETIME;
ALTER TABLE "orders" ADD COLUMN "payment_provider_ref" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_reference" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_requested_at" DATETIME;

-- CreateIndex
CREATE INDEX "orders_status_payment_expires_at_idx" ON "orders"("status", "payment_expires_at");
