import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { CATEGORIES, ITEMS } from '@juice-stop/menu';
import { PrismaClient } from '../../generated/client/index.js';

/**
 * Database seed.
 *
 * The catalogue comes from `@juice-stop/menu` — the **same module the storefront renders from**.
 * It used to be transcribed twice, which meant a price corrected in one copy silently disagreed
 * with the other: the storefront showing one number while the API and kitchen board served
 * another. Importing the canonical data makes that class of bug unrepresentable.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../../.env'), quiet: true });

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Juice Stop…');

  // Idempotent, leaves first — foreign keys forbid the reverse order.
  await prisma.orderStatusEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productAddOn.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.outlet.deleteMany();

  const outlet = await prisma.outlet.create({
    data: {
      id: 'outlet-main',
      name: 'Juice Stop',
      slug: 'juice-stop-kattankulathur',
      address: 'Abode Valley Complex, Kattankulathur, Tamil Nadu',
      isActive: true,
    },
  });

  await prisma.setting.createMany({
    data: [
      { key: 'store.open_time', value: '"19:00"', description: 'Service opens (IST)' },
      { key: 'store.close_time', value: '"04:00"', description: 'Service closes (IST, next day)' },
      { key: 'store.force_closed', value: 'false', description: 'Panic switch — stops all intake' },
      { key: 'pricing.min_order_paise', value: '10000', description: 'Minimum order: ₹100' },
      { key: 'pricing.delivery_fee_paise', value: '0', description: 'Free delivery, always' },
      { key: 'pricing.handling_fee_paise', value: '0', description: 'Handling absorbed' },
      { key: 'pricing.gst_rate_bps', value: '0', description: 'GST absorbed; statutory once registered' },
      { key: 'capacity.warn_threshold', value: '0.8', description: 'Warn + show wait estimate' },
      { key: 'capacity.pause_threshold', value: '1.0', description: 'Stop accepting new orders' },
      { key: 'orders.edit_window_ms', value: '600000', description: '10-minute customer grace window' },
      { key: 'delivery.complex', value: '"Abode Valley Complex"', description: 'The only area served' },
      { key: 'fulfilment.takeaway_enabled', value: 'true', description: 'Offer pickup as well as delivery' },
    ],
  });

  // ── Catalogue, straight from the canonical module ──────────────────────────────────────────
  for (const [order, category] of CATEGORIES.entries()) {
    await prisma.category.create({
      data: {
        id: category.id,
        outletId: outlet.id,
        groupId: category.groupId,
        name: category.name,
        emoji: category.emoji,
        note: category.note ?? null,
        isHidden: category.hidden === true,
        sortOrder: order,
      },
    });
  }

  let variantCount = 0;
  let addOnCount = 0;

  for (const [order, item] of ITEMS.entries()) {
    await prisma.product.create({
      data: {
        id: item.id,
        outletId: outlet.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description ?? null,
        isVeg: item.isVeg,
        prepTimeSeconds: item.prepTimeSeconds,
        tagsJson: JSON.stringify(item.tags),
        inStock: item.inStock,
        sortOrder: order,
      },
    });

    for (const [i, variant] of item.variants.entries()) {
      await prisma.productVariant.create({
        data: {
          id: variant.id,
          productId: item.id,
          name: variant.name,
          pricePaise: variant.pricePaise,
          sortOrder: i,
        },
      });
      variantCount++;
    }

    for (const addOn of item.addOns) {
      await prisma.productAddOn.create({
        data: {
          id: addOn.id,
          productId: item.id,
          name: addOn.name,
          pricePaise: addOn.pricePaise ?? null,
          // SQLite has no JSON column; paise are stringified to stay exact through the round trip.
          priceByVariantJson:
            addOn.priceByVariantId !== undefined
              ? JSON.stringify(
                  Object.fromEntries(
                    Object.entries(addOn.priceByVariantId).map(([k, v]) => [k, v.toString()]),
                  ),
                )
              : null,
        },
      });
      addOnCount++;
    }
  }

  const customer = await prisma.user.create({
    data: {
      id: 'user-demo',
      phoneE164: '+919876543210',
      phoneVerifiedAt: new Date(),
      fullName: 'Demo Customer',
      role: 'CUSTOMER',
    },
  });

  await prisma.address.create({
    data: {
      userId: customer.id,
      label: 'Home',
      block: 'C',
      flatOrRoom: '412',
      floor: '4',
      landmark: 'Near the lift',
      contactName: 'Demo Customer',
      contactPhone: '9876543210',
      isDefault: true,
    },
  });

  console.log(`  categories : ${CATEGORIES.length}`);
  console.log(`  products   : ${ITEMS.length}`);
  console.log(`  variants   : ${variantCount}`);
  console.log(`  add-ons    : ${addOnCount}`);
  console.log('Done — seeded from @juice-stop/menu, the same source the storefront renders.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
