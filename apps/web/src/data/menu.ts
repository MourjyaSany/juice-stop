/**
 * Placeholder catalogue.
 *
 * Replaced in M1 by `GET /menu`, which ships the entire menu as one edge-cached payload under
 * 60 KB — so switching category is a client-side filter with no network round trip, and search
 * makes no request at all (01-system-architecture.md §12).
 *
 * The shape here deliberately mirrors the API response so swapping the source is a one-line
 * change rather than a component rewrite.
 */

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
}

export interface MenuProduct {
  id: string;
  categoryId: string;
  name: string;
  tagline: string;
  /** Integer paise. Never a float, never rupees (ADR-003). */
  pricePaise: bigint;
  compareAtPaise: bigint | null;
  emoji: string;
  isVeg: boolean;
  spiceLevel: 0 | 1 | 2 | 3;
  prepTimeSeconds: number;
  rating: number;
  ratingCount: number;
  tags: readonly string[];
  inStock: boolean;
}

export const CATEGORIES: readonly MenuCategory[] = [
  { id: 'c1', name: 'Burgers', slug: 'burgers' },
  { id: 'c2', name: 'Rolls', slug: 'rolls' },
  { id: 'c3', name: 'Fries & Sides', slug: 'sides' },
  { id: 'c4', name: 'Maggi', slug: 'maggi' },
  { id: 'c5', name: 'Shakes', slug: 'shakes' },
] as const;

export const PRODUCTS: readonly MenuProduct[] = [
  { id: 'p1', categoryId: 'c1', name: 'Chicken Zinger', tagline: 'Crispy, spicy, unfair', pricePaise: 18900n, compareAtPaise: 22900n, emoji: '🍔', isVeg: false, spiceLevel: 2, prepTimeSeconds: 420, rating: 4.6, ratingCount: 231, tags: ['BESTSELLER'], inStock: true },
  { id: 'p2', categoryId: 'c1', name: 'Double Trouble', tagline: 'Two patties. No regrets.', pricePaise: 24900n, compareAtPaise: null, emoji: '🍔', isVeg: false, spiceLevel: 1, prepTimeSeconds: 540, rating: 4.7, ratingCount: 142, tags: ['TRENDING'], inStock: true },
  { id: 'p3', categoryId: 'c1', name: 'Paneer Crunch', tagline: 'Veg, but make it loud', pricePaise: 16900n, compareAtPaise: null, emoji: '🍔', isVeg: true, spiceLevel: 2, prepTimeSeconds: 400, rating: 4.4, ratingCount: 98, tags: [], inStock: true },
  { id: 'p4', categoryId: 'c1', name: 'Classic Veg', tagline: 'The reliable one', pricePaise: 12900n, compareAtPaise: null, emoji: '🍔', isVeg: true, spiceLevel: 0, prepTimeSeconds: 360, rating: 4.2, ratingCount: 176, tags: [], inStock: true },

  { id: 'p5', categoryId: 'c2', name: 'Chicken Tikka Roll', tagline: 'Smoky, saucy, gone in 4 bites', pricePaise: 15900n, compareAtPaise: null, emoji: '🌯', isVeg: false, spiceLevel: 2, prepTimeSeconds: 380, rating: 4.8, ratingCount: 304, tags: ['BESTSELLER'], inStock: true },
  { id: 'p6', categoryId: 'c2', name: 'Paneer Kathi Roll', tagline: 'Certified hostel fuel', pricePaise: 14900n, compareAtPaise: null, emoji: '🌯', isVeg: true, spiceLevel: 1, prepTimeSeconds: 360, rating: 4.5, ratingCount: 187, tags: [], inStock: false },
  { id: 'p7', categoryId: 'c2', name: 'Egg Roll', tagline: 'Cheap. Fast. Undefeated.', pricePaise: 9900n, compareAtPaise: null, emoji: '🌯', isVeg: false, spiceLevel: 1, prepTimeSeconds: 300, rating: 4.6, ratingCount: 265, tags: ['LATE_NIGHT_DEAL'], inStock: true },

  { id: 'p8', categoryId: 'c3', name: 'Peri Peri Fries', tagline: 'Dangerously reorderable', pricePaise: 7900n, compareAtPaise: null, emoji: '🍟', isVeg: true, spiceLevel: 2, prepTimeSeconds: 240, rating: 4.8, ratingCount: 412, tags: ['BESTSELLER'], inStock: true },
  { id: 'p9', categoryId: 'c3', name: 'Cheese Loaded Fries', tagline: 'A meal pretending to be a side', pricePaise: 12900n, compareAtPaise: 14900n, emoji: '🧀', isVeg: true, spiceLevel: 0, prepTimeSeconds: 300, rating: 4.7, ratingCount: 289, tags: ['TRENDING'], inStock: true },
  { id: 'p10', categoryId: 'c3', name: 'Chicken Popcorn', tagline: 'Shareable in theory', pricePaise: 11900n, compareAtPaise: null, emoji: '🍗', isVeg: false, spiceLevel: 1, prepTimeSeconds: 320, rating: 4.5, ratingCount: 154, tags: [], inStock: true },
  { id: 'p11', categoryId: 'c3', name: 'Garlic Bread', tagline: 'Quiet achiever', pricePaise: 8900n, compareAtPaise: null, emoji: '🥖', isVeg: true, spiceLevel: 0, prepTimeSeconds: 240, rating: 4.3, ratingCount: 87, tags: [], inStock: true },

  { id: 'p12', categoryId: 'c4', name: 'Cheese Maggi', tagline: '2 AM comfort, certified', pricePaise: 9900n, compareAtPaise: null, emoji: '🍜', isVeg: true, spiceLevel: 1, prepTimeSeconds: 300, rating: 4.7, ratingCount: 388, tags: ['BESTSELLER'], inStock: true },
  { id: 'p13', categoryId: 'c4', name: 'Chicken Maggi', tagline: 'Protein arc unlocked', pricePaise: 12900n, compareAtPaise: null, emoji: '🍜', isVeg: false, spiceLevel: 2, prepTimeSeconds: 340, rating: 4.6, ratingCount: 211, tags: [], inStock: true },
  { id: 'p14', categoryId: 'c4', name: 'Tandoori Maggi', tagline: 'Spice level: consequences', pricePaise: 11900n, compareAtPaise: null, emoji: '🍜', isVeg: true, spiceLevel: 3, prepTimeSeconds: 330, rating: 4.4, ratingCount: 96, tags: ['LATE_NIGHT_DEAL'], inStock: true },

  { id: 'p15', categoryId: 'c5', name: 'Oreo Thick Shake', tagline: 'Basically a dessert', pricePaise: 12900n, compareAtPaise: 14900n, emoji: '🥤', isVeg: true, spiceLevel: 0, prepTimeSeconds: 180, rating: 4.5, ratingCount: 156, tags: ['TRENDING'], inStock: true },
  { id: 'p16', categoryId: 'c5', name: 'Cold Coffee', tagline: 'For the 3 AM deadline', pricePaise: 9900n, compareAtPaise: null, emoji: '☕', isVeg: true, spiceLevel: 0, prepTimeSeconds: 150, rating: 4.6, ratingCount: 243, tags: [], inStock: true },
  { id: 'p17', categoryId: 'c5', name: 'Mango Shake', tagline: 'Seasonal and smug about it', pricePaise: 10900n, compareAtPaise: null, emoji: '🥭', isVeg: true, spiceLevel: 0, prepTimeSeconds: 160, rating: 4.4, ratingCount: 74, tags: [], inStock: true },
] as const;

export const TAG_LABELS: Record<string, string> = {
  BESTSELLER: '🔥 Bestseller',
  TRENDING: '📈 Trending',
  LATE_NIGHT_DEAL: '🌙 Late night deal',
};
