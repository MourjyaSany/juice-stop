import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../../generated/client/index.js';
import { SEED_CATEGORIES, SEED_ITEMS, type SeedItem } from './menu-source.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../../.env'), quiet: true });

const prisma = new PrismaClient();

/** Rupees → integer paise. The only place a rupee number is allowed (ADR-003). */
const paise = (rupees: number): bigint => BigInt(Math.round(rupees * 100));

/** Stable, readable ids — `pizza-veg:margherita`. Re-seeding is then idempotent. */
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  console.log('Seeding Juice Stop…');

  // Idempotent from the leaves up — foreign keys forbid the reverse order.
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

  // ── Settings ────────────────────────────────────────────────────────────────────────────────
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
    ],
  });

  // ── Catalog ─────────────────────────────────────────────────────────────────────────────────
  let categoryOrder = 0;
  let totalItems = 0;
  let totalVariants = 0;
  let totalAddOns = 0;

  for (const category of SEED_CATEGORIES) {
    await prisma.category.create({
      data: {
        id: category.id,
        outletId: outlet.id,
        groupId: category.groupId,
        name: category.name,
        emoji: category.emoji,
        note: category.note ?? null,
        sortOrder: categoryOrder++,
      },
    });

    const items: SeedItem[] = SEED_ITEMS[category.id] ?? [];
    let itemOrder = 0;

    for (const [name, price, opts = {}] of items) {
      const productId = `${category.id}:${slug(name)}`;
      const sizes = Array.isArray(price) ? price : ([['Regular', price]] as Array<[string, number]>);

      await prisma.product.create({
        data: {
          id: productId,
          outletId: outlet.id,
          categoryId: category.id,
          name,
          description: opts.desc ?? null,
          isVeg: opts.veg ?? false,
          prepTimeSeconds: opts.prep ?? (Array.isArray(price) ? 720 : 420),
          tagsJson: JSON.stringify(opts.tags ?? []),
          sortOrder: itemOrder++,
        },
      });
      totalItems++;

      const variantIds: string[] = [];
      for (const [index, [label, amount]] of sizes.entries()) {
        const variantId = `${productId}#${index}`;
        variantIds.push(variantId);
        await prisma.productVariant.create({
          data: {
            id: variantId,
            productId,
            name: label,
            pricePaise: paise(amount),
            sortOrder: index,
          },
        });
        totalVariants++;
      }

      // Extra cheese: flat on wraps, size-dependent on pizza (₹40 / ₹60 / ₹70).
      if (opts.cheese === 'pizza') {
        await prisma.productAddOn.create({
          data: {
            id: `${productId}#cheese`,
            productId,
            name: 'Extra Cheese',
            priceByVariantJson: JSON.stringify({
              [variantIds[0]!]: paise(40).toString(),
              [variantIds[1]!]: paise(60).toString(),
              [variantIds[2]!]: paise(70).toString(),
            }),
          },
        });
        totalAddOns++;
      } else if (typeof opts.cheese === 'number') {
        await prisma.productAddOn.create({
          data: {
            id: `${productId}#cheese`,
            productId,
            name: 'Extra Cheese',
            pricePaise: paise(opts.cheese),
          },
        });
        totalAddOns++;
      }
    }
  }

  // ── A demo customer, so the app has something to show ───────────────────────────────────────
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

  console.log(`  outlet      : ${outlet.name}`);
  console.log(`  categories  : ${SEED_CATEGORIES.length}`);
  console.log(`  products    : ${totalItems}`);
  console.log(`  variants    : ${totalVariants}`);
  console.log(`  add-ons     : ${totalAddOns}`);
  console.log('Done.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
