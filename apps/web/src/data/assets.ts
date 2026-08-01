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

/* ── Burger assembly layers ─────────────────────────────────────────────────────────────────── */

/**
 * The hero's scroll-assembled burger is not one image — it is a stack of ingredient cut-outs that
 * fly in and settle as the customer scrolls.
 *
 * Every layer must therefore be shot as if it were part of the *same photograph*: identical camera
 * height, identical focal length, identical light rig. If the lettuce is lit from a different side
 * than the patty, no amount of animation hides it — the stack reads as clip-art. That consistency
 * is what `CUTOUT_STYLE` exists to guarantee, and why it is appended verbatim rather than
 * paraphrased per layer.
 *
 * These are the only assets in the app that require a **transparent background**. A generator that
 * cannot produce alpha cannot fill these slots, so they intentionally have no jpg fallback path
 * that would quietly look wrong.
 */
export const CUTOUT_STYLE =
  'isolated on a fully transparent background, alpha channel, no backdrop, no surface, no shadow ' +
  'cast onto anything, straight-on eye-level product shot at 85mm, identical camera height and ' +
  'distance, soft key light from the upper left at 45 degrees plus a warm orange (#FF6B1A) rim ' +
  'from the left and a cool violet (#A855F7) rim from the right, ultra realistic food photography, ' +
  'razor-sharp macro detail, visible texture, photoreal, not an illustration, not 3D render, ' +
  'no text, no watermark, centred, square crop';

const layer = (slug: string, alt: string, subject: string, fallback: string): GeneratedAsset => ({
  slug,
  alt,
  prompt: `${subject}, ${CUTOUT_STYLE}`,
  fallback,
  tone: 'warm',
});

export const BURGER_LAYER_ASSETS: GeneratedAsset[] = [
  layer('bl-bun-bottom', 'Bottom bun', 'the bottom half of a toasted sesame brioche burger bun, cut side up, glossy butter-toasted face', '🍞'),
  layer('bl-sauce', 'Burger sauce', 'a thick swirl of creamy burger sauce, glossy, mid-drip', '🥣'),
  layer('bl-lettuce', 'Lettuce', 'a single ruffled leaf of crisp iceberg lettuce, water droplets, vivid green', '🥬'),
  layer('bl-tomato', 'Tomato', 'two overlapping slices of ripe beefsteak tomato, seeds and juice visible', '🍅'),
  layer('bl-onion', 'Onion', 'three rings of raw red onion, translucent edges', '🧅'),
  layer('bl-pickles', 'Pickles', 'four crinkle-cut dill pickle slices, glossy brine sheen', '🥒'),
  layer('bl-patty', 'Beef patty', 'a thick flame-grilled patty with deep charred grill marks and rendered juices', '🥩'),
  layer('bl-cheese', 'Melted cheese', 'a slice of cheddar melting and draping over an edge, molten cheese pull', '🧀'),
  layer('bl-bun-top', 'Top bun', 'the domed top half of a sesame brioche burger bun, glossy egg wash, scattered sesame seeds', '🍔'),
  layer('bl-steam', 'Steam', 'wisps of white steam and heat haze rising, soft and translucent', '💨'),
  layer('bl-sesame', 'Sesame seeds', 'a few loose sesame seeds suspended in mid-air, sharp focus', '⚪'),
  layer('bl-assembled', 'Assembled burger', 'a complete stacked cheeseburger — sesame brioche bun, flame-grilled patty, melted cheddar, lettuce, tomato, onion, pickles', '🍔'),
];

export const ALL_ASSETS: GeneratedAsset[] = [
  ...FOOD_ASSETS,
  ...STORY_ASSETS,
  ...BURGER_LAYER_ASSETS,
];

const BY_SLUG = new Map(ALL_ASSETS.map((a) => [a.slug, a]));

export const findAsset = (slug: string): GeneratedAsset | undefined => BY_SLUG.get(slug);

/* ── Category → asset ───────────────────────────────────────────────────────────────────────── */

/** Menu category id → asset slug. One mapping, not a lookup reinvented per component. */
export const CATEGORY_ASSET: Record<string, string> = {
  'pizza-veg': 'pizza',
  'pizza-nonveg': 'pizza',
  burger: 'burger',
  sandwich: 'sandwich',
  wrap: 'wrap',
  wings: 'wings',
  'fried-snacks': 'fries',
  'momos-maggie': 'momos',
  'loaded-fries': 'fries',
  noodles: 'maggie',
  'fried-rice': 'rice',
  chinese: 'chinese',
  pasta: 'pasta',
  gravy: 'bread',
  'chicken-stick': 'sizzler',
  'chicken-sizzling': 'sizzler',
  snacks: 'snacks',
  hot: 'coldcoffee',
  juice: 'juice',
  lemon: 'juice',
  mojito: 'mojito',
  lassi: 'lassi',
  falooda: 'falooda',
  shakes: 'milkshake',
  combo: 'combo',
};

export const assetForCategory = (categoryId: string): string =>
  CATEGORY_ASSET[categoryId] ?? 'burger';

/**
 * Per-item overrides, for items whose category image would be misleading.
 *
 * Only a handful: a Maggi bowl under the "Momos & Maggie" category photo of momos is a small lie,
 * and food photography is exactly where small lies get noticed.
 */
export const ITEM_ASSET_HINTS: Array<[match: RegExp, slug: string]> = [
  [/maggie/i, 'maggie'],
  [/momos/i, 'momos'],
  [/fries|popcorn|nugget/i, 'fries'],
  [/sizzling|stick/i, 'sizzler'],
  [/coffee|tea/i, 'coldcoffee'],
];

/** Best asset for an item: name hint first, category fallback second. */
export function assetForItem(name: string, categoryId: string): string {
  for (const [pattern, slug] of ITEM_ASSET_HINTS) {
    if (pattern.test(name)) return slug;
  }
  return assetForCategory(categoryId);
}
