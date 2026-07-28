/**
 * The canonical Juice Stop menu.
 *
 * Once the storefront reads from the API, **this file is the source of truth** and the copy in
 * `apps/web/src/data/menu.ts` goes away. Until then the two are kept deliberately identical in
 * shape so the swap is a fetch, not a rewrite.
 *
 * Prices are written in rupees for readability and converted to integer paise on insert. Nothing
 * downstream ever sees a rupee float (ADR-003).
 */

export interface SeedCategory {
  id: string;
  groupId: 'food' | 'snacks' | 'drinks' | 'combos';
  name: string;
  emoji: string;
  note?: string;
}

/** `[name, price]` for a single-price item; `[name, [sizes...]]` for a multi-size item. */
export type SeedItem = [
  name: string,
  price: number | Array<[label: string, price: number]>,
  opts?: { veg?: boolean; desc?: string; prep?: number; tags?: string[]; cheese?: number | 'pizza' },
];

export const SEED_CATEGORIES: SeedCategory[] = [
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

const S = (s: number, m: number, l: number): Array<[string, number]> => [
  ['Small', s],
  ['Medium', m],
  ['Large', l],
];

export const SEED_ITEMS: Record<string, SeedItem[]> = {
  'pizza-veg': [
    ['Garlic', S(120, 180, 270), { veg: true, cheese: 'pizza' }],
    ['Margherita', S(120, 180, 270), { veg: true, cheese: 'pizza', tags: ['BESTSELLER'] }],
    ['Cheese', S(120, 180, 270), { veg: true, cheese: 'pizza' }],
    ['Corn', S(130, 200, 290), { veg: true, cheese: 'pizza' }],
    ['Jalapeno', S(120, 180, 280), { veg: true, cheese: 'pizza' }],
    ['Onion', S(120, 180, 280), { veg: true, cheese: 'pizza' }],
    ['Veg', S(120, 180, 280), { veg: true, cheese: 'pizza' }],
    ['Mexican', S(150, 200, 310), { veg: true, cheese: 'pizza' }],
    ['Paneer Tandoori', S(160, 240, 350), { veg: true, cheese: 'pizza', tags: ['TRENDING'] }],
    ['Paneer Peri Peri', S(160, 240, 350), { veg: true, cheese: 'pizza' }],
    ['Paneer BBQ', S(160, 240, 350), { veg: true, cheese: 'pizza' }],
  ],
  'pizza-nonveg': [
    ['Chicken', S(160, 240, 330), { cheese: 'pizza', tags: ['BESTSELLER'] }],
    ['Pepperoni', S(170, 260, 360), { cheese: 'pizza' }],
    ['Chicken Keema', S(170, 260, 360), { cheese: 'pizza' }],
    ['Chicken BBQ', S(160, 250, 360), { cheese: 'pizza' }],
    ['Chicken Mexican', S(160, 250, 360), { cheese: 'pizza' }],
    ['Chicken Tandoori', S(160, 270, 360), { cheese: 'pizza' }],
    ['Chicken Peri Peri', S(160, 250, 360), { cheese: 'pizza' }],
    ['Chicken Supreme', S(160, 260, 380), { cheese: 'pizza', tags: ['TRENDING'] }],
  ],
  burgers: [
    ['Veg Burger', 80, { veg: true, prep: 330 }],
    ['Paneer Burger', 90, { veg: true, prep: 360 }],
    ['Paneer BBQ Burger', 120, { veg: true, prep: 390 }],
    ['Paneer Tandoori Burger', 120, { veg: true, prep: 390 }],
    ['Paneer Peri Peri Burger', 120, { veg: true, prep: 390 }],
    ['Chicken Burger', 90, { prep: 390 }],
    ['Chicken Zinger Burger', 130, { prep: 420, tags: ['BESTSELLER'] }],
    ['Chicken BBQ Burger', 160, { prep: 420 }],
    ['Chicken Tandoori Burger', 160, { prep: 420 }],
    ['Chicken Peri Peri Burger', 160, { prep: 420 }],
    ['Chicken Biggies Burger', 180, { prep: 480 }],
    ['ChickZing Biggies Burger', 250, { prep: 540, tags: ['TRENDING'] }],
  ],
  sandwiches: [
    ['Veg Sandwich', 50, { veg: true, prep: 300 }],
    ['Egg Sandwich', 50, { prep: 300 }],
    ['Paneer Sandwich', 60, { veg: true, prep: 300 }],
    ['BBQ Paneer Sandwich', 80, { veg: true, prep: 330 }],
    ['Peri Peri Paneer Sandwich', 80, { veg: true, prep: 330 }],
    ['Tandoori Paneer Sandwich', 80, { veg: true, prep: 330 }],
    ['Chicken Sandwich', 60, { prep: 330 }],
    ['BBQ Chicken Sandwich', 80, { prep: 360 }],
    ['Peri Peri Chicken Sandwich', 80, { prep: 360 }],
    ['Tandoori Chicken Sandwich', 80, { prep: 360 }],
  ],
  wraps: [
    ['Veg Wrap', 70, { veg: true, prep: 360, cheese: 20 }],
    ['Egg Wrap', 70, { prep: 360, cheese: 20 }],
    ['Paneer Wrap', 120, { veg: true, prep: 390, cheese: 20 }],
    ['BBQ Paneer Wrap', 140, { veg: true, prep: 390, cheese: 20 }],
    ['Peri Peri Paneer Wrap', 140, { veg: true, prep: 390, cheese: 20 }],
    ['Tandoori Paneer Wrap', 140, { veg: true, prep: 390, cheese: 20 }],
    ['Chicken Wrap', 120, { prep: 390, cheese: 20, tags: ['BESTSELLER'] }],
    ['BBQ Chicken Wrap', 140, { prep: 420, cheese: 20 }],
    ['Peri Peri Chicken Wrap', 140, { prep: 420, cheese: 20 }],
    ['Tandoori Chicken Wrap', 140, { prep: 420, cheese: 20 }],
  ],
  wings: [
    ['Fried Wings', 180, { prep: 480 }],
    ['BBQ Wings', 200, { prep: 510 }],
    ['Peri Peri Wings', 200, { prep: 510 }],
    ['Chicken Wings', 160, { prep: 480 }],
    ['BBQ Chicken Wings', 200, { prep: 510 }],
    ['Peri Peri Chicken Wings', 200, { prep: 510 }],
  ],
  fried: [
    ['Veg Nuggets', 100, { veg: true, desc: '10 pcs', prep: 300 }],
    ['Chicken Nuggets', 100, { desc: '6 pcs', prep: 330 }],
    ['Normal Fries', [['Half', 90], ['Full', 120]], { veg: true, prep: 300 }],
    ['Peri Peri French Fries', [['Half', 90], ['Full', 140]], { veg: true, prep: 300, tags: ['BESTSELLER'] }],
    ['Chicken Popcorn', 140, { desc: '20 pcs', prep: 360 }],
  ],
  'momos-maggie': [
    ['Plain Maggie', 40, { veg: true, prep: 300 }],
    ['Cheese Maggie', 60, { veg: true, prep: 300, tags: ['BESTSELLER'] }],
    ['Veg Maggie', 60, { veg: true, prep: 300 }],
    ['Egg Maggie', 60, { prep: 330 }],
    ['Paneer Maggie', 60, { veg: true, prep: 330 }],
    ['Chicken Maggie', 70, { prep: 360 }],
    ['Veg Momos', [['Steamed', 110], ['Fried', 110]], { veg: true, prep: 480 }],
    ['Chicken Momos', [['Steamed', 110], ['Fried', 110]], { prep: 510 }],
  ],
  'rice-noodles': [
    ['Loaded Fries (Non Veg)', 180, { prep: 420 }],
    ['Peri Peri Loaded (Non Veg)', 200, { prep: 420 }],
    ['Peri Peri Loaded', 190, { veg: true, prep: 420 }],
    ['Chicken Noodles', 120, { prep: 480 }],
    ['Mushroom Noodles', 140, { veg: true, prep: 480 }],
    ['Chicken Fried Rice', 150, { prep: 480, tags: ['BESTSELLER'] }],
    ['Chicken Schezwan Fried Rice', 160, { prep: 480 }],
    ['Egg Fried Rice', 130, { prep: 450 }],
    ['Veg Fried Rice', 120, { veg: true, prep: 450 }],
    ['Mushroom Fried Rice', 120, { veg: true, prep: 450 }],
    ['Paneer Fried Rice', 140, { veg: true, prep: 480 }],
  ],
  chinese: [
    ['Honey Chicken', [['Gravy', 200], ['Dry', 200]], { prep: 540 }],
    ['Chilly Chicken', [['Gravy', 200], ['Dry', 200]], { prep: 540, tags: ['TRENDING'] }],
    ['Paneer Chilly', [['Gravy', 200], ['Dry', 200]], { veg: true, prep: 540 }],
    ['Mushroom Chilly', [['Gravy', 180], ['Dry', 180]], { veg: true, prep: 540 }],
    ['Chicken 65', 180, { desc: '8 pcs', prep: 480 }],
  ],
  pasta: [
    ['White Sauce Pasta', [['Half', 180], ['Full', 200]], { veg: true, prep: 540 }],
    ['Red Sauce Pasta', [['Half', 180], ['Full', 200]], { veg: true, prep: 540 }],
    ['Mix Sauce Pasta', [['Half', 180], ['Full', 200]], { veg: true, prep: 540 }],
    ['Basil Pasta', [['Half', 180], ['Full', 200]], { veg: true, prep: 540 }],
  ],
  gravy: [
    ['Chicken Gravy', 160, { prep: 540 }],
    ['Veg Kurma', 130, { veg: true, prep: 480 }],
    ['Porotta', 20, { veg: true, prep: 240 }],
    ['Chapathi', 10, { veg: true, prep: 240 }],
  ],
  sizzlers: [
    ['Chicken Stick', 349, { prep: 900, tags: ['TRENDING'], desc: 'Grilled chicken, broccoli, zucchini, pepper sauce, mashed potato' }],
    ['Chicken Sizzling', 399, { prep: 960, tags: ['TRENDING'], desc: 'Grilled chicken, broccoli, zucchini, rice, small fries, mushroom sauce' }],
  ],
  snacks: [
    ['Puri Biji', 15, { veg: true, desc: '1 pc', prep: 180 }],
    ['Roti', 10, { veg: true, desc: '1 pc', prep: 180 }],
    ['Parotta', 10, { veg: true, desc: '1 pc', prep: 180 }],
    ['Jalebi', 20, { veg: true, desc: '100 g', prep: 180 }],
    ['Boondi', 25, { veg: true, desc: '100 g', prep: 180 }],
    ['Bhujiya', 20, { veg: true, desc: '100 g', prep: 120 }],
    ['Namak Para', 20, { veg: true, desc: '100 g', prep: 120 }],
    ['Khasta Nimki', 10, { veg: true, prep: 120 }],
    ['Malpua', 10, { veg: true, prep: 180 }],
    ['Gulab Jamun', 10, { veg: true, prep: 120 }],
    ['Goja', 10, { veg: true, prep: 120 }],
    ['Spring Roll', 10, { veg: true, prep: 240 }],
    ['Khurma', 10, { veg: true, prep: 120 }],
    ['Samosa', 15, { veg: true, prep: 240, tags: ['BESTSELLER'] }],
    ['Kachori', 15, { veg: true, prep: 240 }],
    ['Bread Pakora', 12, { veg: true, prep: 240 }],
    ['Chilli Pakora', 15, { veg: true, prep: 240 }],
    ['Potato Pakora', 15, { veg: true, prep: 240 }],
    ['Banana Pakora', 10, { veg: true, prep: 240 }],
  ],
  hot: [
    ['Coffee', 20, { veg: true, prep: 180 }],
    ['Tea', 15, { veg: true, prep: 180 }],
  ],
  juices: (
    [
      ['Mosambi', 70], ['Watermelon', 50], ['Pineapple', 50], ['Muskmelon', 50], ['Amla', 50],
      ['Guava', 50], ['Strawberry', 60], ['Anero (Fig)', 60], ['Grape', 50], ['Chikku', 60],
      ['Mango', 50], ['Pomegranate', 70], ['Orange', 70],
    ] as Array<[string, number]>
  ).map(([n, p]): SeedItem => [n, p, { veg: true, prep: 210, ...(n === 'Watermelon' ? { tags: ['BESTSELLER'] } : {}) }]),
  lemon: [
    ['Lemon Juice', 25, { veg: true, prep: 180 }],
    ['Pineapple Lemon', 40, { veg: true, prep: 180 }],
    ['Grape Lemon', 40, { veg: true, prep: 180 }],
    ['Mint Lemon', 40, { veg: true, prep: 180 }],
    ['Ginger Lemon', 30, { veg: true, prep: 180 }],
    ['Strawberry Lemon', 60, { veg: true, prep: 180 }],
    ['Orange Lemon', 50, { veg: true, prep: 180 }],
    ['Mango Lemon', 50, { veg: true, prep: 180 }],
  ],
  mojito: [
    ['Mint Lime', 60, { veg: true, prep: 210, tags: ['BESTSELLER'] }],
    ['Blue Lime', 60, { veg: true, prep: 210 }],
    ['Green Lime', 60, { veg: true, prep: 210 }],
    ['Orange Lime', 60, { veg: true, prep: 210 }],
    ['Strawberry Lime', 60, { veg: true, prep: 210 }],
    ['Pineapple Lime', 60, { veg: true, prep: 210 }],
  ],
  lassi: [
    ['Sweet Lassi', 40, { veg: true, prep: 210 }],
    ['Banana Lassi', 50, { veg: true, prep: 210 }],
    ['Strawberry Lassi', 50, { veg: true, prep: 210 }],
    ['Mango Lassi', 60, { veg: true, prep: 210, tags: ['BESTSELLER'] }],
    ['Chikku Lassi', 50, { veg: true, prep: 210 }],
    ['Vanilla Lassi', 50, { veg: true, prep: 210 }],
    ['Choco Lassi', 50, { veg: true, prep: 210 }],
    ['Pista Lassi', 50, { veg: true, prep: 210 }],
    ['Butterscotch Lassi', 50, { veg: true, prep: 210 }],
  ],
  falooda: [
    ['Rose Falooda', 110, { veg: true, prep: 300 }],
    ['Strawberry Falooda', 120, { veg: true, prep: 300 }],
    ['Chocolate Falooda', 120, { veg: true, prep: 300 }],
    ['Butterscotch Falooda', 120, { veg: true, prep: 300 }],
    ['Mixed Fruit Falooda', 130, { veg: true, prep: 300 }],
    ['Dry Fruit Falooda', 180, { veg: true, prep: 330 }],
    ['Special Falooda', 180, { veg: true, prep: 330, tags: ['TRENDING'] }],
  ],
  shakes: (
    [
      'Rosemilk', 'Oreo', 'Saudi', 'Sharjah', 'Apple', 'Chikku', 'Pomegranate', 'Kiwi', 'Papaya',
      'Anjeer', 'Dates', 'Mango', 'Strawberry', 'Cherry', 'Banana', 'Grape', 'Muskmelon',
      'Butterscotch', 'Vanilla', 'Chocolate', 'KitKat', 'Bourbon', 'Snickers', 'Galaxy',
      'Choco Banana', 'Choco Chiku', 'Choco Apple', 'Pineapple', 'Dry Fruits',
    ] as string[]
  ).map((n): SeedItem => [
    n,
    70,
    { veg: true, prep: 240, ...(n === 'Oreo' ? { tags: ['BESTSELLER'] } : n === 'KitKat' ? { tags: ['TRENDING'] } : {}) },
  ]),
  combos: [
    ['Combo 1', 160, { prep: 600, desc: 'Chicken Wrap · Small French Fries · Soft Drink' }],
    ['Combo 2', 150, { prep: 600, desc: 'Chicken Burger · Small French Fries · Soft Drink' }],
    ['Combo 3', 190, { prep: 660, desc: 'Chicken Zinger · Small French Fries · Soft Drink', tags: ['BESTSELLER'] }],
    ['Combo 4', 150, { prep: 600, desc: 'Chicken Sandwich · Small French Fries · Soft Drink' }],
  ],
  'big-combos': [
    ['Chicken Burger Combo', 299, { prep: 900, tags: ['TRENDING'], desc: 'Chicken Burger · Chicken Sandwich · Small Chicken Pizza · Small French Fries' }],
    ['Chicken Pizza Combo', 499, { prep: 1080, tags: ['TRENDING'], desc: 'Large Chicken Pizza (7") · Two Large French Fries · Two Soft Drinks (600 ml)' }],
  ],
};
