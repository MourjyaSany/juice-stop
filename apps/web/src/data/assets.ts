/**
 * Generated asset registry.
 *
 * Every image site in the app renders through `<GeneratedImage slug="…" />`, which resolves to
 * `/generated/<slug>.webp` and falls back to a styled gradient plate when the file is absent.
 *
 * That indirection is the point: assets are not yet generated (the Higgsfield CLI is
 * unauthenticated), so the app must look deliberate *without* them and require **zero component
 * changes** when they arrive. Dropping files into `public/generated/` is the entire integration.
 *
 * The prompts live here rather than in a shell script so the house style is version-controlled
 * and reviewable — consistency across ~25 images comes from reusing one style suffix verbatim,
 * not from remembering what was typed last time.
 */

/** Appended to every prompt. The single source of visual consistency. */
export const HOUSE_STYLE =
  'shot on a matte charcoal surface, deep #0B0B0F background, dramatic low-key rim lighting in ' +
  'warm orange (#FF6B1A) from the left and neon violet (#A855F7) from the right, subtle volumetric ' +
  'haze, shallow depth of field, premium food photography, crisp specular highlights, no text, ' +
  'no watermark, no people unless specified, centred composition, square crop';

export type AssetTone = 'warm' | 'violet' | 'mixed';

export interface GeneratedAsset {
  slug: string;
  alt: string;
  prompt: string;
  /** Shown inside the gradient plate until the real asset exists. */
  fallback: string;
  tone: AssetTone;
}

const asset = (
  slug: string,
  alt: string,
  subject: string,
  fallback: string,
  tone: AssetTone = 'warm',
): GeneratedAsset => ({ slug, alt, prompt: `${subject}, ${HOUSE_STYLE}`, fallback, tone });

/* ── Food ───────────────────────────────────────────────────────────────────────────────────── */

export const FOOD_ASSETS: GeneratedAsset[] = [
  asset('burger', 'Chicken burger', 'a towering crispy fried chicken burger, sesame brioche bun, melted cheese pull', '🍔'),
  asset('pizza', 'Pizza', 'a wood-fired margherita pizza slice being lifted, cheese stretching', '🍕'),
  asset('fries', 'Loaded fries', 'peri peri loaded fries in a paper cone, chilli flakes suspended mid-air', '🍟'),
  asset('wrap', 'Chicken wrap', 'a sliced chicken tikka wrap, grill marks, fillings visible in cross-section', '🌯'),
  asset('sandwich', 'Grilled sandwich', 'a pressed grilled sandwich cut diagonally, steam rising', '🥪'),
  asset('wings', 'Chicken wings', 'glazed BBQ chicken wings stacked on slate, glossy sauce', '🍗'),
  asset('momos', 'Steamed momos', 'steamed momos in a bamboo basket, wisps of steam, chilli dip beside', '🥟'),
  asset('maggie', 'Cheese Maggi', 'a bowl of cheesy instant noodles, fork lifting a twirl, molten cheese', '🍜'),
  asset('rice', 'Fried rice', 'a wok of chicken fried rice mid-toss, grains suspended in the air', '🍚'),
  asset('pasta', 'Pasta', 'creamy white sauce pasta in a matte black bowl, basil leaf on top', '🍝'),
  asset('chinese', 'Chilli chicken', 'glossy chilli chicken in a black wok, peppers and spring onion', '🥡'),
  asset('sizzler', 'Sizzler', 'a cast-iron sizzler platter with grilled chicken and vegetables, dramatic steam', '🔥'),
  asset('milkshake', 'Milkshake', 'a thick Oreo milkshake in a tall glass, cookie crumb rim, condensation', '🥤', 'violet'),
  asset('coldcoffee', 'Cold coffee', 'iced cold coffee in a tall glass, cream swirl caught mid-pour', '☕', 'violet'),
  asset('falooda', 'Falooda', 'a layered rose falooda in a tall glass, vermicelli and basil seeds visible', '🍨', 'violet'),
  asset('juice', 'Fresh juice', 'a glass of fresh watermelon juice, fruit slice on the rim, backlit', '🧃', 'warm'),
  asset('mojito', 'Mint mojito', 'a mint lime mojito, crushed ice and mint leaves, backlit condensation', '🌿', 'violet'),
  asset('lassi', 'Mango lassi', 'a thick mango lassi in a clay cup, saffron strands on top', '🥛', 'warm'),
  asset('snacks', 'Fried snacks', 'assorted Indian fried snacks — samosa and pakora on textured paper', '🥟'),
  asset('combo', 'Combo meal', 'a complete combo — burger, fries and a drink arranged as a hero shot', '🎁', 'mixed'),
  asset('bread', 'Parotta', 'flaky layered parotta stacked, ghee sheen, curry bowl behind', '🍛'),
];

/* ── Story & journey ────────────────────────────────────────────────────────────────────────── */

export const STORY_ASSETS: GeneratedAsset[] = [
  asset('hero', 'Late night spread', 'an overhead late-night feast spread — burgers, loaded fries, milkshakes — on charcoal, neon spill', '🌙', 'mixed'),
  asset('kitchen', 'Kitchen at night', 'a professional kitchen pass at night, chef hands plating, warm service lights, motion blur', '👨‍🍳'),
  asset('ingredients', 'Fresh ingredients', 'fresh raw ingredients arranged on charcoal — peppers, herbs, chicken, cheese', '🧅'),
  asset('grill', 'Chef cooking', 'a flat-top grill with patties searing, flames licking, sparks and smoke', '🔥'),
  asset('quality', 'Quality check', 'a chef inspecting a finished burger under a service lamp, tweezers placing garnish', '🔍'),
  asset('packing', 'Packaging', 'kraft takeaway boxes being sealed with branded tape, neat stack, warm light', '📦'),
  asset('rider', 'Delivery rider', 'a delivery rider in a matte black jacket with an insulated backpack, neon-lit street at night', '🛵', 'violet'),
  asset('night-ride', 'Night ride', 'a scooter tail-light streaking through a wet neon-lit street at night, long exposure', '🌃', 'violet'),
  asset('doorstep', 'Doorstep delivery', 'a takeaway bag handed over at an apartment door at night, warm hallway light', '🚪'),
  asset('students', 'Students eating', 'four students sharing late-night food in a hostel room, laptop glow, genuine laughter', '🎉', 'mixed'),
];

export const ALL_ASSETS: GeneratedAsset[] = [...FOOD_ASSETS, ...STORY_ASSETS];

const BY_SLUG = new Map(ALL_ASSETS.map((a) => [a.slug, a]));

export const findAsset = (slug: string): GeneratedAsset | undefined => BY_SLUG.get(slug);

/* ── Category → asset ───────────────────────────────────────────────────────────────────────── */

/** Menu category id → asset slug. Keeps the mapping in one place instead of per-component. */
export const CATEGORY_ASSET: Record<string, string> = {
  'pizza-veg': 'pizza',
  'pizza-nonveg': 'pizza',
  burgers: 'burger',
  sandwiches: 'sandwich',
  wraps: 'wrap',
  wings: 'wings',
  fried: 'fries',
  'momos-maggie': 'momos',
  'rice-noodles': 'rice',
  chinese: 'chinese',
  pasta: 'pasta',
  gravy: 'bread',
  sizzlers: 'sizzler',
  snacks: 'snacks',
  hot: 'coldcoffee',
  juices: 'juice',
  lemon: 'juice',
  mojito: 'mojito',
  lassi: 'lassi',
  falooda: 'falooda',
  shakes: 'milkshake',
  combos: 'combo',
  'big-combos': 'combo',
};

export const assetForCategory = (categoryId: string): string =>
  CATEGORY_ASSET[categoryId] ?? 'burger';
