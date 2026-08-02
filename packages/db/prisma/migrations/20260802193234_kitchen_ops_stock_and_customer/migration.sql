-- AlterTable
ALTER TABLE "orders" ADD COLUMN "customer_name" TEXT;
ALTER TABLE "orders" ADD COLUMN "customer_phone" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "stock_remaining" INTEGER;
