/**
 * The Juice Stop menu.
 *
 * **Transcribed verbatim from the supplied price list.** Nothing here is inferred, rounded or
 * invented — if a price is not in the source list, the item is not in this file. Prices are
 * written in rupees for readability and converted once to integer paise by `r()`; nothing
 * downstream ever sees a rupee float (ADR-003).
 *
 * Two things worth knowing about the source data:
 *   · Extra Cheese is priced for **Veg Pizza only** (40/60/70 by size) and for **Wraps** (flat 20).
 *     Non-Veg Pizza has no cheese row, so none is offered — extrapolating one would be exactly the
 *     kind of made-up price this file exists to avoid.
 *   · The Chinese items carry "(Gravy/Dry)" in the name at a single price rather than as two
 *     priced variants, so they are modelled as one item, as listed.
 *
 * Structure is three levels so ~195 items stay navigable:
 *   GROUP     Food · Snacks · Drinks · Combos   → top-level tabs
 *   CATEGORY  Veg Pizza · Burger · Milk Shake…  → sections within a tab
 *   ITEM      with optional size variants and add-ons
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
  /**
   * Excluded from the browsable menu.
   *
   * Checkout extras are modelled as ordinary products so they price, snapshot and reach the
   * kitchen through exactly the same path as everything else — no parallel "extras" pricing to
   * drift out of sync. They simply are not browsable, because their place is at checkout.
   */
  hidden?: boolean;
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
  { id: 'pizza-nonveg', groupId: 'food', name: 'Non Veg Pizza', emoji: '🍕' },
  { id: 'burger', groupId: 'food', name: 'Burger', emoji: '🍔' },
  { id: 'sandwich', groupId: 'food', name: 'Sandwich', emoji: '🥪' },
  { id: 'wrap', groupId: 'food', name: 'Wrap', emoji: '🌯' },
  { id: 'wings', groupId: 'food', name: 'Chicken Wings', emoji: '🍗' },
  { id: 'fried-snacks', groupId: 'food', name: 'Fried Snacks', emoji: '🍟' },
  { id: 'momos-maggie', groupId: 'food', name: 'Momos & Maggie', emoji: '🍜' },
  { id: 'loaded-fries', groupId: 'food', name: 'Loaded Fries', emoji: '🧀' },
  { id: 'noodles', groupId: 'food', name: 'Noodles', emoji: '🍜' },
  { id: 'fried-rice', groupId: 'food', name: 'Fried Rice', emoji: '🍚' },
  { id: 'chinese', groupId: 'food', name: 'Chinese', emoji: '🥡' },
  { id: 'pasta', groupId: 'food', name: 'Pasta', emoji: '🍝' },
  { id: 'gravy', groupId: 'food', name: 'Gravy', emoji: '🍛' },
  { id: 'chicken-stick', groupId: 'food', name: 'Chicken Stick', emoji: '🔥' },
  { id: 'chicken-sizzling', groupId: 'food', name: 'Chicken Sizzling', emoji: '🔥' },

  { id: 'snacks', groupId: 'snacks', name: 'Snacks', emoji: '🥟' },

  { id: 'hot', groupId: 'drinks', name: 'Hot Beverage', emoji: '☕' },
  { id: 'juice', groupId: 'drinks', name: 'Fresh Juice', emoji: '🧃' },
  { id: 'lemon', groupId: 'drinks', name: 'Lemon Juice', emoji: '🍋' },
  { id: 'mojito', groupId: 'drinks', name: 'Mojito', emoji: '🌿' },
  { id: 'lassi', groupId: 'drinks', name: 'Lassi', emoji: '🥛' },
  { id: 'falooda', groupId: 'drinks', name: 'Falooda', emoji: '🍨' },
  { id: 'shakes', groupId: 'drinks', name: 'Milk Shake', emoji: '🥤', note: 'All ₹70' },

  { id: 'combo', groupId: 'combos', name: 'Combo', emoji: '🎁' },

  { id: 'extras', groupId: 'snacks', name: 'Extras', emoji: '➕', hidden: true },
];

/** Categories a customer can browse. */
export const BROWSABLE_CATEGORIES: readonly MenuCategory[] = CATEGORIES.filter(
  (c) => c.hidden !== true,
);

/* ── Builders ───────────────────────────────────────────────────────────────────────────────── */

let seq = 0;
const nextId = (categoryId: string) => `${categoryId}-${(++seq).toString(36)}`;

interface Opts {
  veg?: boolean;
  desc?: string;
  prep?: number;
  tags?: string[];
  addOns?: MenuAddOn[];
}

/** Single-price item. */
function one(categoryId: string, groupId: GroupId, name: string, price: number, o: Opts = {}): MenuItem {
  const id = nextId(categoryId);
  return {
    id,
    groupId,
    categoryId,
    name,
    isVeg: o.veg ?? false,
    variants: [{ id: `${id}-v0`, name: 'Regular', pricePaise: r(price) }],
    addOns: o.addOns ?? [],
    tags: o.tags ?? [],
    prepTimeSeconds: o.prep ?? 420,
    inStock: true,
    ...(o.desc !== undefined ? { description: o.desc } : {}),
  };
}

/** Item sold in several sizes. */
function sized(
  categoryId: string,
  groupId: GroupId,
  name: string,
  sizes: Array<[string, number]>,
  o: Opts = {},
): MenuItem {
  const id = nextId(categoryId);
  const variants = sizes.map(([label, price], i) => ({
    id: `${id}-v${i}`,
    name: label,
    pricePaise: r(price),
  }));
  return {
    id,
    groupId,
    categoryId,
    name,
    isVeg: o.veg ?? false,
    variants,
    addOns: o.addOns ?? [],
    tags: o.tags ?? [],
    prepTimeSeconds: o.prep ?? 720,
    inStock: true,
    ...(o.desc !== undefined ? { description: o.desc } : {}),
  };
}

/** Pizza sizes: Small / Medium / Large. */
const P = (s: number, m: number, l: number): Array<[string, number]> => [
  ['Small', s],
  ['Medium', m],
  ['Large', l],
];

/** Extra Cheese for pizza — 40 / 60 / 70 by size, exactly as listed. */
function pizzaCheese(item: MenuItem): MenuItem {
  const [s, m, l] = item.variants;
  return {
    ...item,
    addOns: [
      {
        id: `${item.id}-cheese`,
        name: 'Extra Cheese',
        priceByVariantId: { [s!.id]: r(40), [m!.id]: r(60), [l!.id]: r(70) },
      },
    ],
  };
}

/** Extra Cheese for wraps — flat 20. */
const wrapCheese = (id: string): MenuAddOn[] => [
  { id: `${id}-cheese`, name: 'Extra Cheese', pricePaise: r(20) },
];

const veg: Opts = { veg: true };

/* ── Items ──────────────────────────────────────────────────────────────────────────────────── */

const VEG_PIZZA = [
  sized('pizza-veg', 'food', 'Garlic', P(120, 180, 270), veg),
  sized('pizza-veg', 'food', 'Margherita', P(120, 180, 270), { ...veg, tags: ['BESTSELLER'] }),
  sized('pizza-veg', 'food', 'Cheese', P(120, 180, 270), veg),
  sized('pizza-veg', 'food', 'Corn', P(130, 200, 290), veg),
  sized('pizza-veg', 'food', 'Jalapeno', P(120, 180, 280), veg),
  sized('pizza-veg', 'food', 'Onion', P(120, 180, 280), veg),
  sized('pizza-veg', 'food', 'Veg', P(120, 180, 280), veg),
  sized('pizza-veg', 'food', 'Mexican', P(150, 200, 310), veg),
  sized('pizza-veg', 'food', 'Paneer Tandoori', P(160, 240, 350), { ...veg, tags: ['TRENDING'] }),
  sized('pizza-veg', 'food', 'Paneer Peri Peri', P(160, 240, 350), veg),
  sized('pizza-veg', 'food', 'Paneer BBQ', P(160, 240, 350), veg),
].map(pizzaCheese);

const NONVEG_PIZZA = [
  sized('pizza-nonveg', 'food', 'Chicken', P(160, 240, 330), { tags: ['BESTSELLER'] }),
  sized('pizza-nonveg', 'food', 'Pepperoni', P(170, 260, 360)),
  sized('pizza-nonveg', 'food', 'Chicken Keema', P(170, 260, 360)),
  sized('pizza-nonveg', 'food', 'Chicken BBQ', P(160, 250, 360)),
  sized('pizza-nonveg', 'food', 'Chicken Tandoori', P(160, 270, 360)),
  sized('pizza-nonveg', 'food', 'Chicken Peri Peri', P(160, 250, 360)),
  sized('pizza-nonveg', 'food', 'Chicken Supreme', P(160, 260, 380), { tags: ['TRENDING'] }),
];

const SANDWICH = [
  one('sandwich', 'food', 'Veg Sandwich', 50, { ...veg, prep: 300 }),
  one('sandwich', 'food', 'Egg Sandwich', 50, { prep: 300 }),
  one('sandwich', 'food', 'Paneer Sandwich', 60, { ...veg, prep: 300 }),
  one('sandwich', 'food', 'BBQ Paneer Sandwich', 80, { ...veg, prep: 330 }),
  one('sandwich', 'food', 'Peri Peri Paneer Sandwich', 80, { ...veg, prep: 330 }),
  one('sandwich', 'food', 'Tandoori Paneer Sandwich', 80, { ...veg, prep: 330 }),
  one('sandwich', 'food', 'Chicken Sandwich', 60, { prep: 330 }),
  one('sandwich', 'food', 'BBQ Chicken Sandwich', 80, { prep: 360 }),
  one('sandwich', 'food', 'Peri Peri Chicken Sandwich', 80, { prep: 360 }),
  one('sandwich', 'food', 'Tandoori Chicken Sandwich', 80, { prep: 360 }),
];

const WRAP = [
  one('wrap', 'food', 'Veg Wrap', 70, { ...veg, prep: 360 }),
  one('wrap', 'food', 'Egg Wrap', 70, { prep: 360 }),
  one('wrap', 'food', 'Paneer Wrap', 120, { ...veg, prep: 390 }),
  one('wrap', 'food', 'BBQ Paneer Wrap', 140, { ...veg, prep: 390 }),
  one('wrap', 'food', 'Peri Peri Paneer Wrap', 140, { ...veg, prep: 390 }),
  one('wrap', 'food', 'Tandoori Paneer Wrap', 140, { ...veg, prep: 390 }),
  one('wrap', 'food', 'Chicken Wrap', 120, { prep: 390, tags: ['BESTSELLER'] }),
  one('wrap', 'food', 'BBQ Chicken Wrap', 140, { prep: 420 }),
  one('wrap', 'food', 'Peri Peri Chicken Wrap', 140, { prep: 420 }),
  one('wrap', 'food', 'Tandoori Chicken Wrap', 140, { prep: 420 }),
].map((item) => ({ ...item, addOns: wrapCheese(item.id) }));

const WINGS = [
  one('wings', 'food', 'Fried Wings', 180, { prep: 480 }),
  one('wings', 'food', 'BBQ Wings', 200, { prep: 510 }),
  one('wings', 'food', 'Peri Peri Wings', 200, { prep: 510 }),
  one('wings', 'food', 'Chicken Wings', 160, { prep: 480 }),
  one('wings', 'food', 'BBQ Chicken Wings', 200, { prep: 510 }),
  one('wings', 'food', 'Peri Peri Chicken Wings', 200, { prep: 510 }),
];

const FRIED_SNACKS = [
  one('fried-snacks', 'food', 'Veg Nuggets', 100, { ...veg, desc: '10 pcs', prep: 300 }),
  one('fried-snacks', 'food', 'Chicken Nuggets', 100, { desc: '6 pcs', prep: 330 }),
  sized('fried-snacks', 'food', 'Normal Fries', [['Half', 90], ['Full', 120]], { ...veg, prep: 300 }),
  sized('fried-snacks', 'food', 'Peri Peri French Fries', [['Half', 90], ['Full', 140]], {
    ...veg,
    prep: 300,
    tags: ['BESTSELLER'],
  }),
  one('fried-snacks', 'food', 'Chicken Popcorn', 140, { desc: '20 pcs', prep: 360 }),
];

const MOMOS_MAGGIE = [
  one('momos-maggie', 'food', 'Plain Maggie', 40, { ...veg, prep: 300 }),
  one('momos-maggie', 'food', 'Cheese Maggie', 60, { ...veg, prep: 300, tags: ['BESTSELLER'] }),
  one('momos-maggie', 'food', 'Veg Maggie', 60, { ...veg, prep: 300 }),
  one('momos-maggie', 'food', 'Egg Maggie', 60, { prep: 330 }),
  one('momos-maggie', 'food', 'Paneer Maggie', 60, { ...veg, prep: 330 }),
  one('momos-maggie', 'food', 'Chicken Maggie', 70, { prep: 360 }),
  sized('momos-maggie', 'food', 'Veg Momos', [['Steam', 110], ['Fried', 100]], { ...veg, prep: 480 }),
  sized('momos-maggie', 'food', 'Chicken Momos', [['Steam', 110], ['Fried', 100]], { prep: 510 }),
];

const BURGER = [
  one('burger', 'food', 'Veg Burger', 80, { ...veg, prep: 330 }),
  one('burger', 'food', 'Paneer Burger', 90, { ...veg, prep: 360 }),
  one('burger', 'food', 'Paneer BBQ Burger', 120, { ...veg, prep: 390 }),
  one('burger', 'food', 'Paneer Tandoori Burger', 120, { ...veg, prep: 390 }),
  one('burger', 'food', 'Paneer Peri Peri Burger', 120, { ...veg, prep: 390 }),
  one('burger', 'food', 'Chicken Burger', 90, { prep: 390 }),
  one('burger', 'food', 'Chicken Biggies Burger', 180, { prep: 480 }),
  one('burger', 'food', 'Chicken BBQ Burger', 160, { prep: 420 }),
  one('burger', 'food', 'Chicken Tandoori Burger', 160, { prep: 420 }),
  one('burger', 'food', 'Chicken Peri Peri Burger', 160, { prep: 420 }),
  one('burger', 'food', 'Chicken Zinger Burger', 130, { prep: 420, tags: ['BESTSELLER'] }),
  one('burger', 'food', 'ChickZing Biggies Burger', 250, { prep: 540, tags: ['TRENDING'] }),
];

const LOADED_FRIES = [
  one('loaded-fries', 'food', 'Loaded Fries (Non Veg)', 180, { prep: 420 }),
  one('loaded-fries', 'food', 'Peri Peri Loaded (Non Veg)', 200, { prep: 420 }),
  one('loaded-fries', 'food', 'Peri Peri Paneer Loaded', 190, { ...veg, prep: 420 }),
];

const NOODLES = [
  one('noodles', 'food', 'Chicken Noodles', 120, { prep: 480 }),
  one('noodles', 'food', 'Mushroom Noodles', 140, { ...veg, prep: 480 }),
];

const FRIED_RICE = [
  one('fried-rice', 'food', 'Chicken Fried Rice', 150, { prep: 480, tags: ['BESTSELLER'] }),
  one('fried-rice', 'food', 'Chicken Schezwan Fried Rice', 160, { prep: 480 }),
  one('fried-rice', 'food', 'Egg Fried Rice', 130, { prep: 450 }),
  one('fried-rice', 'food', 'Veg Fried Rice', 120, { ...veg, prep: 450 }),
  one('fried-rice', 'food', 'Mushroom Fried Rice', 120, { ...veg, prep: 450 }),
  one('fried-rice', 'food', 'Paneer Fried Rice', 140, { ...veg, prep: 480 }),
];

const CHINESE = [
  one('chinese', 'food', 'Honey Chicken (Gravy/Dry)', 200, { prep: 540 }),
  one('chinese', 'food', 'Chilly Chicken (Gravy/Dry)', 200, { prep: 540, tags: ['TRENDING'] }),
  one('chinese', 'food', 'Paneer Chilly (Gravy/Dry)', 200, { ...veg, prep: 540 }),
  one('chinese', 'food', 'Mushroom Chilly (Gravy/Dry)', 180, { ...veg, prep: 540 }),
  one('chinese', 'food', 'Chicken 65', 180, { desc: '8 pcs', prep: 480 }),
];

const PASTA = [
  sized('pasta', 'food', 'White Sauce', [['Half', 180], ['Full', 200]], { ...veg, prep: 540 }),
  sized('pasta', 'food', 'Red Sauce', [['Half', 180], ['Full', 200]], { ...veg, prep: 540 }),
  sized('pasta', 'food', 'Mix Sauce', [['Half', 180], ['Full', 200]], { ...veg, prep: 540 }),
  sized('pasta', 'food', 'Basil Pesto', [['Half', 180], ['Full', 200]], { ...veg, prep: 540 }),
];

const GRAVY = [
  one('gravy', 'food', 'Chicken Gravy', 180, { prep: 540 }),
  one('gravy', 'food', 'Veg Kurma', 130, { ...veg, prep: 480 }),
  one('gravy', 'food', 'Porotta', 20, { ...veg, prep: 240 }),
  one('gravy', 'food', 'Chapathi', 10, { ...veg, prep: 240 }),
];

const CHICKEN_STICK = [
  one('chicken-stick', 'food', 'Grilled Chicken Stick', 349, { prep: 900, tags: ['TRENDING'] }),
];

const CHICKEN_SIZZLING = [
  one('chicken-sizzling', 'food', 'Chicken Sizzling', 399, { prep: 960, tags: ['TRENDING'] }),
];

const SNACKS = [
  one('snacks', 'snacks', 'Puri Bhaji', 15, { ...veg, prep: 180 }),
  one('snacks', 'snacks', 'Roti', 15, { ...veg, prep: 180 }),
  one('snacks', 'snacks', 'Parota', 10, { ...veg, prep: 180 }),
  one('snacks', 'snacks', 'Jalebi', 20, { ...veg, prep: 180 }),
  one('snacks', 'snacks', 'Boondi', 25, { ...veg, prep: 180 }),
  one('snacks', 'snacks', 'Bhujiya', 20, { ...veg, prep: 120 }),
  one('snacks', 'snacks', 'Namak Para', 20, { ...veg, prep: 120 }),
  one('snacks', 'snacks', 'Khasta Nimki', 10, { ...veg, prep: 120 }),
  one('snacks', 'snacks', 'Malpua', 10, { ...veg, prep: 180 }),
  one('snacks', 'snacks', 'Gulab Jamun', 10, { ...veg, prep: 120 }),
  one('snacks', 'snacks', 'Goja', 10, { ...veg, prep: 120 }),
  one('snacks', 'snacks', 'Spring Roll', 10, { ...veg, prep: 240 }),
  one('snacks', 'snacks', 'Khurma', 10, { ...veg, prep: 120 }),
  one('snacks', 'snacks', 'Samosa', 10, { ...veg, prep: 240, tags: ['BESTSELLER'] }),
  one('snacks', 'snacks', 'Kachori', 15, { ...veg, prep: 240 }),
  one('snacks', 'snacks', 'Bread Pakora', 12, { ...veg, prep: 240 }),
  one('snacks', 'snacks', 'Chilli Pakora', 15, { ...veg, prep: 240 }),
  one('snacks', 'snacks', 'Potato Pakora', 15, { ...veg, prep: 240 }),
  one('snacks', 'snacks', 'Banana Pakora', 10, { ...veg, prep: 240 }),
];

const HOT = [
  one('hot', 'drinks', 'Coffee', 20, { ...veg, prep: 180 }),
  one('hot', 'drinks', 'Tea', 15, { ...veg, prep: 180 }),
];

const JUICE = (
  [
    ['Mosambi', 70], ['Watermelon', 50], ['Pineapple', 50], ['Muskmelon', 50], ['Amla', 50],
    ['Guava', 50], ['Strawberry', 60], ['Aner(Fig)', 50], ['Grape', 50], ['Chiku', 60],
    ['Mango', 70], ['Pomegranate', 70], ['Orange', 70],
  ] as Array<[string, number]>
).map(([n, p]) =>
  one('juice', 'drinks', n, p, { ...veg, prep: 210, ...(n === 'Watermelon' ? { tags: ['BESTSELLER'] } : {}) }),
);

const LEMON = (
  [
    ['Lemon Juice', 25], ['Pineapple Lemon', 40], ['Grape Lemon', 40], ['Mint Lemon', 40],
    ['Ginger Lemon', 30], ['Strawberry Lemon', 50], ['Orange Lemon', 50], ['Mango Lemon', 50],
  ] as Array<[string, number]>
).map(([n, p]) => one('lemon', 'drinks', n, p, { ...veg, prep: 180 }));

const MOJITO = (
  [
    ['Mint Lime', 60], ['Blue Lime', 60], ['Green Lime', 60],
    ['Orange Lime', 60], ['Strawberry Lime', 60], ['Pineapple Lime', 60],
  ] as Array<[string, number]>
).map(([n, p]) =>
  one('mojito', 'drinks', n, p, { ...veg, prep: 210, ...(n === 'Mint Lime' ? { tags: ['BESTSELLER'] } : {}) }),
);

const LASSI = (
  [
    ['Sweet', 40], ['Banana', 50], ['Strawberry', 50], ['Mango', 60], ['Chiku', 50],
    ['Vanilla', 50], ['Choco', 50], ['Pista', 50], ['Butterscotch', 50],
  ] as Array<[string, number]>
).map(([n, p]) =>
  one('lassi', 'drinks', n, p, { ...veg, prep: 210, ...(n === 'Mango' ? { tags: ['BESTSELLER'] } : {}) }),
);

const FALOODA = (
  [
    ['Rose', 110], ['Strawberry', 120], ['Chocolate', 120], ['Butterscotch', 120],
    ['Mixed Fruit', 130], ['Dry Fruit', 140], ['Special', 180],
  ] as Array<[string, number]>
).map(([n, p]) =>
  one('falooda', 'drinks', n, p, { ...veg, prep: 300, ...(n === 'Special' ? { tags: ['TRENDING'] } : {}) }),
);

const SHAKES = (
  [
    'Rosemilk', 'Oreo', 'Saudi', 'Sharjah', 'Apple', 'Chiku', 'Pomegranate', 'Kiwi', 'Papaya',
    'Anjeer', 'Dates', 'Mango', 'Strawberry', 'Cherry', 'Banana', 'Grape', 'Muskmelon',
    'Butterscotch', 'Vanilla', 'Chocolate', 'Kitkat', 'Bourbon', 'Snickers', 'Galaxy',
    'Choco Banana', 'Choco Chiku', 'Choco Apple', 'Pineapple', 'Dry Fruits',
  ] as string[]
).map((n) =>
  one('shakes', 'drinks', n, 70, {
    ...veg,
    prep: 240,
    ...(n === 'Oreo' ? { tags: ['BESTSELLER'] } : n === 'Kitkat' ? { tags: ['TRENDING'] } : {}),
  }),
);

const COMBO = [
  one('combo', 'combos', 'Chicken Wrap Combo', 160, {
    desc: 'Chicken Wrap + Small French Fries + Soft Drink',
    prep: 600,
  }),
  one('combo', 'combos', 'Chicken Burger Combo', 150, {
    desc: 'Chicken Burger + Small French Fries + Soft Drink',
    prep: 600,
  }),
  one('combo', 'combos', 'Chicken Zinger Combo', 190, {
    desc: 'Chicken Zinger + Small French Fries + Soft Drink',
    prep: 660,
    tags: ['BESTSELLER'],
  }),
  one('combo', 'combos', 'Chicken Sandwich Combo', 150, {
    desc: 'Chicken Sandwich + Small French Fries + Soft Drink',
    prep: 600,
  }),
  one('combo', 'combos', 'Feast Combo', 299, {
    desc: 'Chicken Burger + Chicken Sandwich + Chicken Pizza (S) + Small French Fries',
    prep: 900,
    tags: ['TRENDING'],
  }),
  one('combo', 'combos', 'Party Combo', 499, {
    desc: 'Chicken Pizza (L) + 2 Large French Fries + 2 Soft Drinks (600ml)',
    prep: 1080,
    tags: ['TRENDING'],
  }),
];

/**
 * Checkout extras — small last-minute additions, each repeatable.
 *
 * Real products, so they price and snapshot through the same code as everything else. They live
 * in a hidden category because their moment is at checkout, not while browsing.
 */
const EXTRAS = [
  one('extras', 'snacks', 'Mayo', 20, { veg: true, prep: 20 }),
  one('extras', 'snacks', 'Kurkure', 20, { veg: true, prep: 20 }),
  one('extras', 'snacks', 'Compact Cigarette', 15, { veg: true, prep: 20 }),
];

/* ── Export ─────────────────────────────────────────────────────────────────────────────────── */

export const ITEMS: readonly MenuItem[] = [
  ...VEG_PIZZA, ...NONVEG_PIZZA, ...BURGER, ...SANDWICH, ...WRAP, ...WINGS, ...FRIED_SNACKS,
  ...MOMOS_MAGGIE, ...LOADED_FRIES, ...NOODLES, ...FRIED_RICE, ...CHINESE, ...PASTA, ...GRAVY,
  ...CHICKEN_STICK, ...CHICKEN_SIZZLING,
  ...SNACKS,
  ...HOT, ...JUICE, ...LEMON, ...MOJITO, ...LASSI, ...FALOODA, ...SHAKES,
  ...COMBO,
  ...EXTRAS,
];

/** The checkout extras, in display order. */
export const CHECKOUT_EXTRAS: readonly MenuItem[] = EXTRAS;

/** Everything a customer can browse — excludes hidden categories such as checkout extras. */
export const BROWSABLE_ITEMS: readonly MenuItem[] = ITEMS.filter(
  (item) => !CATEGORIES.some((c) => c.id === item.categoryId && c.hidden === true),
);

export const TAG_LABELS: Record<string, string> = {
  BESTSELLER: 'Bestseller',
  TRENDING: 'Trending',
};

export const findItem = (id: string): MenuItem | undefined => ITEMS.find((i) => i.id === id);

export const categoriesInGroup = (groupId: GroupId): MenuCategory[] =>
  CATEGORIES.filter((c) => c.groupId === groupId);

export const itemsInCategory = (categoryId: string): MenuItem[] =>
  ITEMS.filter((i) => i.categoryId === categoryId);

/** Lowest price across an item's variants — what a list row shows as "from ₹x". */
export const priceFrom = (item: MenuItem): Paise =>
  item.variants.reduce((min, v) => (v.pricePaise < min ? v.pricePaise : min), item.variants[0]!.pricePaise);

export const hasChoices = (item: MenuItem): boolean =>
  item.variants.length > 1 || item.addOns.length > 0;

/** Add-on price for a given size, falling back to the flat price. */
export function addOnPrice(addOn: MenuAddOn, variantId: string): Paise {
  return addOn.priceByVariantId?.[variantId] ?? addOn.pricePaise ?? Money.ZERO;
}
