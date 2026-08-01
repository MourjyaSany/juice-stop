"""
Extract the hero burger's ingredient layers from the supplied sprite sheet.

`apps/hevo.png` already ships a clean per-ingredient alpha matte — 62% of the sheet is fully
transparent — so this does no colour keying. It labels the connected regions of that matte, crops
each one, and writes an isolated WebP per ingredient.

Two details that matter:

* Each crop is masked to **its own** component before saving. Bounding boxes overlap on this sheet
  (the tomato's box clips the onion's), so cropping the rectangle alone would drag a slice of the
  neighbour into the layer.

* RGB is bled outward under the transparent margin. WebP stores colour and alpha separately and the
  browser filters them together when scaling, so leaving the sheet's orange backdrop sitting in the
  transparent pixels would ring every edge with an orange halo the moment the layer is resized.

Run: python tools/extract-burger-sprites.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "apps" / "hevo.png"
OUT = ROOT / "apps" / "web" / "public" / "generated" / "burger"

# Alpha below this is treated as background when labelling. Low enough to keep soft edges, high
# enough that compression noise in the matte does not fuse neighbouring ingredients into one blob.
ALPHA_FLOOR = 24
PAD = 3

# Ingredients that are a single object: identified by a point that falls inside them.
# Picking by seed point rather than by component index keeps this readable and survives a re-label.
SINGLE: dict[str, tuple[int, int]] = {
    "top-bun": (756, 1260),  # the large domed sesame bun, bottom right
    "bottom-bun": (794, 1002),  # the toasted cut face, mid right
    "patty": (548, 373),
    "cheese": (175, 349),
    "lettuce": (200, 586),
    "tomato": (597, 609),
    "onion": (859, 481),
    "pickles": (859, 775),
    "sauce": (233, 1005),  # thickest of the three splashes on the sheet
}

# Scattered particles: every small component inside the region becomes one layer.
CLUSTERS: dict[str, tuple[int, int, int, int]] = {
    "sesame": (660, 20, 1000, 195),
    "crumbs": (10, 1130, 500, 1390),
}
CLUSTER_MAX_AREA = 5000
CLUSTER_MIN_AREA = 8


def bleed(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Replace colour in transparent pixels with the nearest visible colour."""
    solid = alpha > 0
    if not solid.any():
        return rgb
    # Distance transform over the *hole* gives, for every empty pixel, the index of the closest
    # filled one — one pass, no iterative dilation.
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    return rgb[iy, ix]


def save(name: str, rgba: np.ndarray) -> None:
    alpha = rgba[..., 3]
    ys, xs = np.nonzero(alpha > 0)
    if len(ys) == 0:
        print(f"  ! {name}: empty, skipped")
        return

    # Trim to the visible content, then re-pad. Alignment is preserved by the component's position
    # being recorded separately — the animation positions layers by percentage, not by sheet coords.
    y0, y1 = max(0, ys.min() - PAD), min(rgba.shape[0], ys.max() + 1 + PAD)
    x0, x1 = max(0, xs.min() - PAD), min(rgba.shape[1], xs.max() + 1 + PAD)
    crop = rgba[y0:y1, x0:x1].copy()
    crop[..., :3] = bleed(crop[..., :3], crop[..., 3])

    path = OUT / f"{name}.webp"
    Image.fromarray(crop, "RGBA").save(path, "WEBP", quality=90, method=6, alpha_quality=100)
    print(f"  {name:12} {crop.shape[1]:>4} x {crop.shape[0]:<4}  {path.stat().st_size / 1024:6.1f} KB")


def main() -> int:
    if not SHEET.exists():
        print(f"sprite sheet not found: {SHEET}")
        return 1

    sheet = np.array(Image.open(SHEET).convert("RGBA"))
    labels, count = ndimage.label(sheet[..., 3] > ALPHA_FLOOR, structure=np.ones((3, 3)))
    print(f"{SHEET.name}: {sheet.shape[1]}x{sheet.shape[0]}, {count} components")

    OUT.mkdir(parents=True, exist_ok=True)

    for name, (sx, sy) in SINGLE.items():
        component = int(labels[sy, sx])
        if component == 0:
            print(f"  ! {name}: seed ({sx},{sy}) landed on background")
            continue
        layer = sheet.copy()
        layer[..., 3] = np.where(labels == component, layer[..., 3], 0)
        save(name, layer)

    sizes = np.bincount(labels.ravel())
    for name, (x0, y0, x1, y1) in CLUSTERS.items():
        region = np.zeros(labels.shape, dtype=bool)
        region[y0:y1, x0:x1] = True
        keep = (sizes >= CLUSTER_MIN_AREA) & (sizes <= CLUSTER_MAX_AREA)
        keep[0] = False
        # A particle counts only if it lies wholly inside the region, so a cluster never clips an
        # ingredient that happens to overhang the box.
        wholly_inside = ndimage.labeled_comprehension(
            region, labels, np.arange(1, count + 1), np.all, bool, False
        )
        selected = np.zeros(count + 1, dtype=bool)
        selected[1:] = keep[1 : count + 1] & wholly_inside
        layer = sheet.copy()
        layer[..., 3] = np.where(selected[labels], layer[..., 3], 0)
        save(name, layer)

    return 0


if __name__ == "__main__":
    sys.exit(main())
