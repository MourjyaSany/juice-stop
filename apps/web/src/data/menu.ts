/**
 * The Juice Stop menu.
 *
 * Prices are written in **rupees** here for readability and converted to integer paise by `r()`.
 * Nothing downstream ever sees a rupee float — money crosses into the app as `bigint` paise and
 * stays that way (ADR-003).
 *
 * Structure is three levels so the UI can stay compartmentalised rather than presenting one
 * 250-item wall:
 *
 *   GROUP     Food · Snacks · Drinks · Combos      → top-level tabs
 *   CATEGORY  Pizza · Burgers · Milkshakes · …     → sections within a tab
 *   ITEM      with optional size VARIANTS and ADD-ONS
 */

import { Money, type Paise } from '@juice-stop/core';

/** Rupees → paise. The only place in the app a rupee number is allowed. */
const r = (rupees: number): Paise => Money.paise(Math.round(rupees * 100));

/* ── Types ──────────────────────────────────────────────────────────────────────────────────── */

export interface MenuVariant {
  id: string;
  name: string;
  pricePaise: Paise;
}

export interface MenuAddOn {
  id: string;
  name: string;
  /** Flat price, or a per-variant price when the add-on scales with size (e.g. extra cheese). */
  pricePaise?: Paise;
  priceByVariantId?: Record<string, Paise>;
}

export interface MenuItem {
  id: string;
  groupId: GroupId;
  categoryId: string;
  name: string;
  description?: string;
  isVeg: boolean;
  /** Always at least one. Single-price items carry one unnamed variant. */
  variants: MenuVariant[];
  addOns: MenuAddOn[];
  tags: string[];
  prepTimeSeconds: number;
  inStock: boolean;
}

export type GroupId = 'food' | 'snacks' | 'drinks' | 'combos';

export interface MenuGroup {
  id: GroupId;
  name: string;
  emoji: string;
}

export interface MenuCategory {
  id: string;
  groupId: GroupId;
  name: string;
  emoji: string;
  note?: string;
}

/* ── Groups & categories ────────────────────────────────────────────────────────────────────── */

export const GROUPS: readonly MenuGroup[] = [
  { id: 'food', name: 'Food', emoji: '🍕' },
  { id: 'snacks', name: 'Snacks', emoji: '🥟' },
  { id: 'drinks', name: 'Drinks', emoji: '🥤' },
  { id: 'combos', name: 'Combos', emoji: '🎁' },
];

export const CATEGORIES: readonly MenuCategory[] = [
  { id: 'pizza-veg', groupId: 'food', name: 'Veg Pizza', emoji: '🍕' },
  { id: 'pizza-nonveg', groupId: 'food', name: 'Non-Veg Pizza', emoji: '🍕' },
  { id: 'burgers', groupId: 'food', name: 'Burgers', emoji: '🍔' },
  { id: 'sandwiches', groupId: 'food', name: 'Sandwiches', emoji: '🥪' },
  { id: 'wraps', groupId: 'food', name: 'Wraps', emoji: '🌯' },
  { id: 'wings', groupId: 'food', name: 'Chicken Wings', emoji: '🍗' },
  { id: 'fried', groupId: 'food', name: 'Fried Snacks', emoji: '🍟' },
  { id: 'momos-maggie', groupId: 'food', name: 'Momos & Maggie', emoji: '🍜' },
  { id: 'rice-noodles', groupId: 'food', name: 'Rice & Noodles', emoji: '🍚' },
  { id: 'chinese', groupId: 'food', name: 'Chinese', emoji: '🥡' },
  { id: 'pasta', groupId: 'food', name: 'Pasta', emoji: '🍝' },
  { id: 'gravy', groupId: 'food', name: 'Gravy & Breads', emoji: '🍛' },
  { id: 'sizzlers', groupId: 'food', name: 'Sizzlers', emoji: '🔥' },

  { id: 'snacks', groupId: 'snacks', name: 'Quick Snacks', emoji: '🥟' },

  { id: 'hot', groupId: 'drinks', name: 'Hot Beverages', emoji: '☕' },
  { id: 'juices', groupId: 'drinks', name: 'Fresh Juices', emoji: '🧃' },
  { id: 'lemon', groupId: 'drinks', name: 'Lemon Juice', emoji: '🍋' },
  { id: 'mojito', groupId: 'drinks', name: 'Mojito', emoji: '🌿' },
  { id: 'lassi', groupId: 'drinks', name: 'Lassi', emoji: '🥛' },
  { id: 'falooda', groupId: 'drinks', name: 'Falooda', emoji: '🍨' },
  { id: 'shakes', groupId: 'drinks', name: 'Milkshakes', emoji: '🥤', note: 'All ₹70 unless marked' },

  { id: 'combos', groupId: 'combos', name: 'Combos', emoji: '🎁' },
  { id: 'big-combos', groupId: 'combos', name: 'Big Combos', emoji: '👑' },
];

/* ── Builders ───────────────────────────────────────────────────────────────────────────────── */

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(++seq).toString(36)}`;

/** A single-price item. */
function simple(
  categoryId: string,
  groupId: GroupId,
  name: string,
  price: number,
  isVeg: boolean,
  extras: Partial<Pick<MenuItem, 'description' | 'tags' | 'prepTimeSeconds' | 'addOns'>> = {},
): MenuItem {
  const id = nextId('i');
  return {
    id,
    groupId,
    categoryId,
    name,
    isVeg,
    variants: [{ id: `${id}-v0`, name: 'Regular', pricePaise: r(price) }],
    addOns: extras.addOns ?? [],
    tags: extras.tags ?? [],
    prepTimeSeconds: extras.prepTimeSeconds ?? 420,
    inStock: true,
    ...(extras.description !== undefined ? { description: extras.description } : {}),
  };
}

/** An item sold in several sizes. */
function sized(
  categoryId: string,
  groupId: GroupId,
  name: string,
  sizes: Array<[label: string, price: number]>,
  isVeg: boolean,
  extras: Partial<Pick<MenuItem, 'description' | 'tags' | 'prepTimeSeconds' | 'addOns'>> = {},
): MenuItem {
  const id = nextId('i');
  const variants = sizes.map(([label, price], index) => ({
    id: `${id}-v${index}`,
    name: label,
    pricePaise: r(price),
  }));

  // Extra cheese on pizza scales with size, so its price is keyed by variant.
  const addOns =
    extras.addOns ??
    (categoryId.startsWith('pizza')
      ? [
          {
            id: `${id}-cheese`,
            name: 'Extra Cheese',
            priceByVariantId: {
              [variants[0]!.id]: r(40),
              [variants[1]!.id]: r(60),
              [variants[2]!.id]: r(70),
            },
          },
        ]
      : []);

  return {
    id,
    groupId,
    categoryId,
    name,
    isVeg,
    variants,
    addOns,
    tags: extras.tags ?? [],
    prepTimeSeconds: extras.prepTimeSeconds ?? 720,
    inStock: true,
    ...(extras.description !== undefined ? { description: extras.description } : {}),
  };
}

const CHEESE_20 = (owner: string): MenuAddOn[] => [
  { id: `${owner}-cheese`, name: 'Extra Cheese', pricePaise: r(20) },
];

/* ── Items ──────────────────────────────────────────────────────────────────────────────────── */

const PIZZA_VEG: MenuItem[] = [
  sized('pizza-veg', 'food', 'Garlic', [['Small', 120], ['Medium', 180], ['Large', 270]], true),
  sized('pizza-veg', 'food', 'Margherita', [['Small', 120], ['Medium', 180], ['Large', 270]], true, { tags: ['BESTSELLER'] }),
  sized('pizza-veg', 'food', 'Cheese', [['Small', 120], ['Medium', 180], ['Large', 270]], true),
  sized('pizza-veg', 'food', 'Corn', [['Small', 130], ['Medium', 200], ['Large', 290]], true),
  sized('pizza-veg', 'food', 'Jalapeno', [['Small', 120], ['Medium', 180], ['Large', 280]], true),
  sized('pizza-veg', 'food', 'Onion', [['Small', 120], ['Medium', 180], ['Large', 280]], true),
  sized('pizza-veg', 'food', 'Veg', [['Small', 120], ['Medium', 180], ['Large', 280]], true),
  sized('pizza-veg', 'food', 'Mexican', [['Small', 150], ['Medium', 200], ['Large', 310]], true),
  sized('pizza-veg', 'food', 'Paneer Tandoori', [['Small', 160], ['Medium', 240], ['Large', 350]], true, { tags: ['TRENDING'] }),
  sized('pizza-veg', 'food', 'Paneer Peri Peri', [['Small', 160], ['Medium', 240], ['Large', 350]], true),
  sized('pizza-veg', 'food', 'Paneer BBQ', [['Small', 160], ['Medium', 240], ['Large', 350]], true),
];

const PIZZA_NONVEG: MenuItem[] = [
  sized('pizza-nonveg', 'food', 'Chicken', [['Small', 160], ['Medium', 240], ['Large', 330]], false, { tags: ['BESTSELLER'] }),
  sized('pizza-nonveg', 'food', 'Pepperoni', [['Small', 170], ['Medium', 260], ['Large', 360]], false),
  sized('pizza-nonveg', 'food', 'Chicken Keema', [['Small', 170], ['Medium', 260], ['Large', 360]], false),
  sized('pizza-nonveg', 'food', 'Chicken BBQ', [['Small', 160], ['Medium', 250], ['Large', 360]], false),
  sized('pizza-nonveg', 'food', 'Chicken Mexican', [['Small', 160], ['Medium', 250], ['Large', 360]], false),
  sized('pizza-nonveg', 'food', 'Chicken Tandoori', [['Small', 160], ['Medium', 270], ['Large', 360]], false),
  sized('pizza-nonveg', 'food', 'Chicken Peri Peri', [['Small', 160], ['Medium', 250], ['Large', 360]], false),
  sized('pizza-nonveg', 'food', 'Chicken Supreme', [['Small', 160], ['Medium', 260], ['Large', 380]], false, { tags: ['TRENDING'] }),
];

const SANDWICHES: MenuItem[] = [
  simple('sandwiches', 'food', 'Veg Sandwich', 50, true, { prepTimeSeconds: 300 }),
  simple('sandwiches', 'food', 'Egg Sandwich', 50, false, { prepTimeSeconds: 300 }),
  simple('sandwiches', 'food', 'Paneer Sandwich', 60, true, { prepTimeSeconds: 300 }),
  simple('sandwiches', 'food', 'BBQ Paneer Sandwich', 80, true, { prepTimeSeconds: 330 }),
  simple('sandwiches', 'food', 'Peri Peri Paneer Sandwich', 80, true, { prepTimeSeconds: 330 }),
  simple('sandwiches', 'food', 'Tandoori Paneer Sandwich', 80, true, { prepTimeSeconds: 330 }),
  simple('sandwiches', 'food', 'Chicken Sandwich', 60, false, { prepTimeSeconds: 330 }),
  simple('sandwiches', 'food', 'BBQ Chicken Sandwich', 80, false, { prepTimeSeconds: 360 }),
  simple('sandwiches', 'food', 'Peri Peri Chicken Sandwich', 80, false, { prepTimeSeconds: 360 }),
  simple('sandwiches', 'food', 'Tandoori Chicken Sandwich', 80, false, { prepTimeSeconds: 360 }),
];

const WRAPS: MenuItem[] = [
  simple('wraps', 'food', 'Veg Wrap', 70, true, { addOns: CHEESE_20('wrap1'), prepTimeSeconds: 360 }),
  simple('wraps', 'food', 'Egg Wrap', 70, false, { addOns: CHEESE_20('wrap2'), prepTimeSeconds: 360 }),
  simple('wraps', 'food', 'Paneer Wrap', 120, true, { addOns: CHEESE_20('wrap3'), prepTimeSeconds: 390 }),
  simple('wraps', 'food', 'BBQ Paneer Wrap', 140, true, { addOns: CHEESE_20('wrap4'), prepTimeSeconds: 390 }),
  simple('wraps', 'food', 'Peri Peri Paneer Wrap', 140, true, { addOns: CHEESE_20('wrap5'), prepTimeSeconds: 390 }),
  simple('wraps', 'food', 'Tandoori Paneer Wrap', 140, true, { addOns: CHEESE_20('wrap6'), prepTimeSeconds: 390 }),
  simple('wraps', 'food', 'Chicken Wrap', 120, false, { addOns: CHEESE_20('wrap7'), tags: ['BESTSELLER'], prepTimeSeconds: 390 }),
  simple('wraps', 'food', 'BBQ Chicken Wrap', 140, false, { addOns: CHEESE_20('wrap8'), prepTimeSeconds: 420 }),
  simple('wraps', 'food', 'Peri Peri Chicken Wrap', 140, false, { addOns: CHEESE_20('wrap9'), prepTimeSeconds: 420 }),
  simple('wraps', 'food', 'Tandoori Chicken Wrap', 140, false, { addOns: CHEESE_20('wrap10'), prepTimeSeconds: 420 }),
];

const BURGERS: MenuItem[] = [
  simple('burgers', 'food', 'Veg Burger', 80, true, { prepTimeSeconds: 330 }),
  simple('burgers', 'food', 'Paneer Burger', 90, true, { prepTimeSeconds: 360 }),
  simple('burgers', 'food', 'Paneer BBQ Burger', 120, true, { prepTimeSeconds: 390 }),
  simple('burgers', 'food', 'Paneer Tandoori Burger', 120, true, { prepTimeSeconds: 390 }),
  simple('burgers', 'food', 'Paneer Peri Peri Burger', 120, true, { prepTimeSeconds: 390 }),
  simple('burgers', 'food', 'Chicken Burger', 90, false, { prepTimeSeconds: 390 }),
  simple('burgers', 'food', 'Chicken Zinger Burger', 130, false, { tags: ['BESTSELLER'], prepTimeSeconds: 420 }),
  simple('burgers', 'food', 'Chicken BBQ Burger', 160, false, { prepTimeSeconds: 420 }),
  simple('burgers', 'food', 'Chicken Tandoori Burger', 160, false, { prepTimeSeconds: 420 }),
  simple('burgers', 'food', 'Chicken Peri Peri Burger', 160, false, { prepTimeSeconds: 420 }),
  simple('burgers', 'food', 'Chicken Biggies Burger', 180, false, { prepTimeSeconds: 480 }),
  simple('burgers', 'food', 'ChickZing Biggies Burger', 250, false, { tags: ['TRENDING'], prepTimeSeconds: 540 }),
];

const WINGS: MenuItem[] = [
  simple('wings', 'food', 'Fried Wings', 180, false, { prepTimeSeconds: 480 }),
  simple('wings', 'food', 'BBQ Wings', 200, false, { prepTimeSeconds: 510 }),
  simple('wings', 'food', 'Peri Peri Wings', 200, false, { prepTimeSeconds: 510 }),
  simple('wings', 'food', 'Chicken Wings', 160, false, { prepTimeSeconds: 480 }),
  simple('wings', 'food', 'BBQ Chicken Wings', 200, false, { prepTimeSeconds: 510 }),
  simple('wings', 'food', 'Peri Peri Chicken Wings', 200, false, { prepTimeSeconds: 510 }),
];

const FRIED: MenuItem[] = [
  simple('fried', 'food', 'Veg Nuggets', 100, true, { description: '10 pcs', prepTimeSeconds: 300 }),
  simple('fried', 'food', 'Chicken Nuggets', 100, false, { description: '6 pcs', prepTimeSeconds: 330 }),
  sized('fried', 'food', 'Normal Fries', [['Half', 90], ['Full', 120]], true, { addOns: [], prepTimeSeconds: 300 }),
  sized('fried', 'food', 'Peri Peri French Fries', [['Half', 90], ['Full', 140]], true, { addOns: [], tags: ['BESTSELLER'], prepTimeSeconds: 300 }),
  simple('fried', 'food', 'Chicken Popcorn', 140, false, { description: '20 pcs', prepTimeSeconds: 360 }),
];

const MOMOS_MAGGIE: MenuItem[] = [
  simple('momos-maggie', 'food', 'Plain Maggie', 40, true, { prepTimeSeconds: 300 }),
  simple('momos-maggie', 'food', 'Cheese Maggie', 60, true, { tags: ['BESTSELLER'], prepTimeSeconds: 300 }),
  simple('momos-maggie', 'food', 'Veg Maggie', 60, true, { prepTimeSeconds: 300 }),
  simple('momos-maggie', 'food', 'Egg Maggie', 60, false, { prepTimeSeconds: 330 }),
  simple('momos-maggie', 'food', 'Paneer Maggie', 60, true, { prepTimeSeconds: 330 }),
  simple('momos-maggie', 'food', 'Chicken Maggie', 70, false, { prepTimeSeconds: 360 }),
  sized('momos-maggie', 'food', 'Veg Momos', [['Steamed', 110], ['Fried', 110]], true, { addOns: [], prepTimeSeconds: 480 }),
  sized('momos-maggie', 'food', 'Chicken Momos', [['Steamed', 110], ['Fried', 110]], false, { addOns: [], prepTimeSeconds: 510 }),
];

const RICE_NOODLES: MenuItem[] = [
  simple('rice-noodles', 'food', 'Loaded Fries (Non Veg)', 180, false, { prepTimeSeconds: 420 }),
  simple('rice-noodles', 'food', 'Peri Peri Loaded (Non Veg)', 200, false, { prepTimeSeconds: 420 }),
  simple('rice-noodles', 'food', 'Peri Peri Loaded', 190, true, { prepTimeSeconds: 420 }),
  simple('rice-noodles', 'food', 'Chicken Noodles', 120, false, { prepTimeSeconds: 480 }),
  simple('rice-noodles', 'food', 'Mushroom Noodles', 140, true, { prepTimeSeconds: 480 }),
  simple('rice-noodles', 'food', 'Chicken Fried Rice', 150, false, { tags: ['BESTSELLER'], prepTimeSeconds: 480 }),
  simple('rice-noodles', 'food', 'Chicken Schezwan Fried Rice', 160, false, { prepTimeSeconds: 480 }),
  simple('rice-noodles', 'food', 'Egg Fried Rice', 130, false, { prepTimeSeconds: 450 }),
  simple('rice-noodles', 'food', 'Veg Fried Rice', 120, true, { prepTimeSeconds: 450 }),
  simple('rice-noodles', 'food', 'Mushroom Fried Rice', 120, true, { prepTimeSeconds: 450 }),
  simple('rice-noodles', 'food', 'Paneer Fried Rice', 140, true, { prepTimeSeconds: 480 }),
];

const CHINESE: MenuItem[] = [
  sized('chinese', 'food', 'Honey Chicken', [['Gravy', 200], ['Dry', 200]], false, { addOns: [], prepTimeSeconds: 540 }),
  sized('chinese', 'food', 'Chilly Chicken', [['Gravy', 200], ['Dry', 200]], false, { addOns: [], tags: ['TRENDING'], prepTimeSeconds: 540 }),
  sized('chinese', 'food', 'Paneer Chilly', [['Gravy', 200], ['Dry', 200]], true, { addOns: [], prepTimeSeconds: 540 }),
  sized('chinese', 'food', 'Mushroom Chilly', [['Gravy', 180], ['Dry', 180]], true, { addOns: [], prepTimeSeconds: 540 }),
  simple('chinese', 'food', 'Chicken 65', 180, false, { description: '8 pcs', prepTimeSeconds: 480 }),
];

const PASTA: MenuItem[] = [
  sized('pasta', 'food', 'White Sauce Pasta', [['Half', 180], ['Full', 200]], true, { addOns: [], prepTimeSeconds: 540 }),
  sized('pasta', 'food', 'Red Sauce Pasta', [['Half', 180], ['Full', 200]], true, { addOns: [], prepTimeSeconds: 540 }),
  sized('pasta', 'food', 'Mix Sauce Pasta', [['Half', 180], ['Full', 200]], true, { addOns: [], prepTimeSeconds: 540 }),
  sized('pasta', 'food', 'Basil Pasta', [['Half', 180], ['Full', 200]], true, { addOns: [], prepTimeSeconds: 540 }),
];

const GRAVY: MenuItem[] = [
  simple('gravy', 'food', 'Chicken Gravy', 160, false, { prepTimeSeconds: 540 }),
  simple('gravy', 'food', 'Veg Kurma', 130, true, { prepTimeSeconds: 480 }),
  simple('gravy', 'food', 'Porotta', 20, true, { prepTimeSeconds: 240 }),
  simple('gravy', 'food', 'Chapathi', 10, true, { prepTimeSeconds: 240 }),
];

const SIZZLERS: MenuItem[] = [
  simple('sizzlers', 'food', 'Chicken Stick', 349, false, {
    description: 'Grilled chicken, broccoli, zucchini, pepper sauce, mashed potato',
    tags: ['TRENDING'],
    prepTimeSeconds: 900,
  }),
  simple('sizzlers', 'food', 'Chicken Sizzling', 399, false, {
    description: 'Grilled chicken, broccoli, zucchini, rice, small fries, mushroom sauce',
    tags: ['TRENDING'],
    prepTimeSeconds: 960,
  }),
];

const SNACKS: MenuItem[] = [
  simple('snacks', 'snacks', 'Puri Biji', 15, true, { description: '1 pc', prepTimeSeconds: 180 }),
  simple('snacks', 'snacks', 'Roti', 10, true, { description: '1 pc', prepTimeSeconds: 180 }),
  simple('snacks', 'snacks', 'Parotta', 10, true, { description: '1 pc', prepTimeSeconds: 180 }),
  simple('snacks', 'snacks', 'Jalebi', 20, true, { description: '100 g', prepTimeSeconds: 180 }),
  simple('snacks', 'snacks', 'Boondi', 25, true, { description: '100 g', prepTimeSeconds: 180 }),
  simple('snacks', 'snacks', 'Bhujiya', 20, true, { description: '100 g', prepTimeSeconds: 120 }),
  simple('snacks', 'snacks', 'Namak Para', 20, true, { description: '100 g', prepTimeSeconds: 120 }),
  simple('snacks', 'snacks', 'Khasta Nimki', 10, true, { prepTimeSeconds: 120 }),
  simple('snacks', 'snacks', 'Malpua', 10, true, { prepTimeSeconds: 180 }),
  simple('snacks', 'snacks', 'Gulab Jamun', 10, true, { prepTimeSeconds: 120 }),
  simple('snacks', 'snacks', 'Goja', 10, true, { prepTimeSeconds: 120 }),
  simple('snacks', 'snacks', 'Spring Roll', 10, true, { prepTimeSeconds: 240 }),
  simple('snacks', 'snacks', 'Khurma', 10, true, { prepTimeSeconds: 120 }),
  simple('snacks', 'snacks', 'Samosa', 15, true, { tags: ['BESTSELLER'], prepTimeSeconds: 240 }),
  simple('snacks', 'snacks', 'Kachori', 15, true, { prepTimeSeconds: 240 }),
  simple('snacks', 'snacks', 'Bread Pakora', 12, true, { prepTimeSeconds: 240 }),
  simple('snacks', 'snacks', 'Chilli Pakora', 15, true, { prepTimeSeconds: 240 }),
  simple('snacks', 'snacks', 'Potato Pakora', 15, true, { prepTimeSeconds: 240 }),
  simple('snacks', 'snacks', 'Banana Pakora', 10, true, { prepTimeSeconds: 240 }),
];

const HOT: MenuItem[] = [
  simple('hot', 'drinks', 'Coffee', 20, true, { prepTimeSeconds: 180 }),
  simple('hot', 'drinks', 'Tea', 15, true, { prepTimeSeconds: 180 }),
];

const juice = (name: string, price: number, tags: string[] = []) =>
  simple('juices', 'drinks', name, price, true, { tags, prepTimeSeconds: 210 });

const JUICES: MenuItem[] = [
  juice('Mosambi', 70),
  juice('Watermelon', 50, ['BESTSELLER']),
  juice('Pineapple', 50),
  juice('Muskmelon', 50),
  juice('Amla', 50),
  juice('Guava', 50),
  juice('Strawberry', 60),
  juice('Anero (Fig)', 60),
  juice('Grape', 50),
  juice('Chikku', 60),
  juice('Mango', 50),
  juice('Pomegranate', 70),
  juice('Orange', 70),
];

const LEMON: MenuItem[] = [
  simple('lemon', 'drinks', 'Lemon Juice', 25, true, { prepTimeSeconds: 180 }),
  simple('lemon', 'drinks', 'Pineapple Lemon', 40, true, { prepTimeSeconds: 180 }),
  simple('lemon', 'drinks', 'Grape Lemon', 40, true, { prepTimeSeconds: 180 }),
  simple('lemon', 'drinks', 'Mint Lemon', 40, true, { prepTimeSeconds: 180 }),
  simple('lemon', 'drinks', 'Ginger Lemon', 30, true, { prepTimeSeconds: 180 }),
  simple('lemon', 'drinks', 'Strawberry Lemon', 60, true, { prepTimeSeconds: 180 }),
  simple('lemon', 'drinks', 'Orange Lemon', 50, true, { prepTimeSeconds: 180 }),
  simple('lemon', 'drinks', 'Mango Lemon', 50, true, { prepTimeSeconds: 180 }),
];

const MOJITO: MenuItem[] = [
  simple('mojito', 'drinks', 'Mint Lime', 60, true, { tags: ['BESTSELLER'], prepTimeSeconds: 210 }),
  simple('mojito', 'drinks', 'Blue Lime', 60, true, { prepTimeSeconds: 210 }),
  simple('mojito', 'drinks', 'Green Lime', 60, true, { prepTimeSeconds: 210 }),
  simple('mojito', 'drinks', 'Orange Lime', 60, true, { prepTimeSeconds: 210 }),
  simple('mojito', 'drinks', 'Strawberry Lime', 60, true, { prepTimeSeconds: 210 }),
  simple('mojito', 'drinks', 'Pineapple Lime', 60, true, { prepTimeSeconds: 210 }),
];

const LASSI: MenuItem[] = [
  simple('lassi', 'drinks', 'Sweet Lassi', 40, true, { prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Banana Lassi', 50, true, { prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Strawberry Lassi', 50, true, { prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Mango Lassi', 60, true, { tags: ['BESTSELLER'], prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Chikku Lassi', 50, true, { prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Vanilla Lassi', 50, true, { prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Choco Lassi', 50, true, { prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Pista Lassi', 50, true, { prepTimeSeconds: 210 }),
  simple('lassi', 'drinks', 'Butterscotch Lassi', 50, true, { prepTimeSeconds: 210 }),
];

const FALOODA: MenuItem[] = [
  simple('falooda', 'drinks', 'Rose Falooda', 110, true, { prepTimeSeconds: 300 }),
  simple('falooda', 'drinks', 'Strawberry Falooda', 120, true, { prepTimeSeconds: 300 }),
  simple('falooda', 'drinks', 'Chocolate Falooda', 120, true, { prepTimeSeconds: 300 }),
  simple('falooda', 'drinks', 'Butterscotch Falooda', 120, true, { prepTimeSeconds: 300 }),
  simple('falooda', 'drinks', 'Mixed Fruit Falooda', 130, true, { prepTimeSeconds: 300 }),
  simple('falooda', 'drinks', 'Dry Fruit Falooda', 180, true, { prepTimeSeconds: 330 }),
  simple('falooda', 'drinks', 'Special Falooda', 180, true, { tags: ['TRENDING'], prepTimeSeconds: 330 }),
];

const shake = (name: string, price = 70, tags: string[] = []) =>
  simple('shakes', 'drinks', name, price, true, { tags, prepTimeSeconds: 240 });

const SHAKES: MenuItem[] = [
  shake('Rosemilk'),
  shake('Oreo', 70, ['BESTSELLER']),
  shake('Saudi'),
  shake('Sharjah'),
  shake('Apple'),
  shake('Chikku'),
  shake('Pomegranate'),
  shake('Kiwi'),
  shake('Papaya'),
  shake('Anjeer'),
  shake('Dates'),
  shake('Mango'),
  shake('Strawberry'),
  shake('Cherry'),
  shake('Banana'),
  shake('Grape'),
  shake('Muskmelon'),
  shake('Butterscotch'),
  shake('Vanilla'),
  shake('Chocolate'),
  shake('KitKat', 70, ['TRENDING']),
  shake('Bourbon'),
  shake('Snickers'),
  shake('Galaxy'),
  shake('Choco Banana'),
  shake('Choco Chiku'),
  shake('Choco Apple'),
  shake('Pineapple'),
  shake('Dry Fruits'),
];

const COMBOS: MenuItem[] = [
  simple('combos', 'combos', 'Combo 1', 160, false, {
    description: 'Chicken Wrap · Small French Fries · Soft Drink',
    prepTimeSeconds: 600,
  }),
  simple('combos', 'combos', 'Combo 2', 150, false, {
    description: 'Chicken Burger · Small French Fries · Soft Drink',
    prepTimeSeconds: 600,
  }),
  simple('combos', 'combos', 'Combo 3', 190, false, {
    description: 'Chicken Zinger · Small French Fries · Soft Drink',
    tags: ['BESTSELLER'],
    prepTimeSeconds: 660,
  }),
  simple('combos', 'combos', 'Combo 4', 150, false, {
    description: 'Chicken Sandwich · Small French Fries · Soft Drink',
    prepTimeSeconds: 600,
  }),
];

const BIG_COMBOS: MenuItem[] = [
  simple('big-combos', 'combos', 'Chicken Burger Combo', 299, false, {
    description: 'Chicken Burger · Chicken Sandwich · Small Chicken Pizza · Small French Fries',
    tags: ['TRENDING'],
    prepTimeSeconds: 900,
  }),
  simple('big-combos', 'combos', 'Chicken Pizza Combo', 499, false, {
    description: 'Large Chicken Pizza (7") · Two Large French Fries · Two Soft Drinks (600 ml)',
    tags: ['TRENDING'],
    prepTimeSeconds: 1080,
  }),
];

/* ── Export ─────────────────────────────────────────────────────────────────────────────────── */

export const ITEMS: readonly MenuItem[] = [
  ...PIZZA_VEG,
  ...PIZZA_NONVEG,
  ...BURGERS,
  ...SANDWICHES,
  ...WRAPS,
  ...WINGS,
  ...FRIED,
  ...MOMOS_MAGGIE,
  ...RICE_NOODLES,
  ...CHINESE,
  ...PASTA,
  ...GRAVY,
  ...SIZZLERS,
  ...SNACKS,
  ...HOT,
  ...JUICES,
  ...LEMON,
  ...MOJITO,
  ...LASSI,
  ...FALOODA,
  ...SHAKES,
  ...COMBOS,
  ...BIG_COMBOS,
];

export const TAG_LABELS: Record<string, string> = {
  BESTSELLER: 'Bestseller',
  TRENDING: 'Trending',
};

export const findItem = (id: string): MenuItem | undefined => ITEMS.find((i) => i.id === id);

export const categoriesInGroup = (groupId: GroupId): MenuCategory[] =>
  CATEGORIES.filter((c) => c.groupId === groupId);

export const itemsInCategory = (categoryId: string): MenuItem[] =>
  ITEMS.filter((i) => i.categoryId === categoryId);

/** Lowest price across an item's variants — what the list row shows as "from ₹x". */
export const priceFrom = (item: MenuItem): Paise =>
  item.variants.reduce((min, v) => (v.pricePaise < min ? v.pricePaise : min), item.variants[0]!.pricePaise);

export const hasChoices = (item: MenuItem): boolean =>
  item.variants.length > 1 || item.addOns.length > 0;

/** Add-on price for a given size, falling back to the flat price. */
export function addOnPrice(addOn: MenuAddOn, variantId: string): Paise {
  return addOn.priceByVariantId?.[variantId] ?? addOn.pricePaise ?? Money.ZERO;
}
