import assert from 'node:assert/strict';

import { Resvg } from '@resvg/resvg-js';

import { ViewBox } from './AutocropUtils.ts';

const CH = 4;
const ALPHA_CH = 3;

/**
 * Renders SVG to RGBA pixels using `resvg` and calculate non-transparent bounds.
 *
 * The returned bounding box is always inside the SVG’s viewBox.
 *
 * @throws Error if the SVG is malformed, or has an invalid viewBox.
 *
 * @see https://github.com/thx/resvg-js
 */
export function getVisiblePixelBounds(svg: string, vb: ViewBox): ViewBox {
    // negative viewBox width/height is an error; 0 disables rendering.
    // https://svgwg.org/svg2-draft/coords.html#ViewBoxAttribute
    if (vb.width <= 0 || vb.height <= 0) {
        return { ...vb, width: 0, height: 0 };
    }

    const img = new Resvg(svg).render();
    const pixels = img.pixels;

    assert.equal(
        pixels.length,
        img.width * img.height * CH,
        'Rendered pixel buffer shape is malformed; RGBA indexing becomes unreliable and can produce incorrect visible bounds.',
    );

    // we may use `new Resvg(svg).getBBox()` for float coordinates in the future.
    let boxL = img.width;
    let boxT = img.height;
    let boxR = -1;
    let boxB = -1;

    // scan the 'intersected' bounds and extend 'optimal' bounds when non-visible pixels are met.
    for (let y = 0; y < img.height; y++) {
        const rowStart = y * img.width * CH;

        for (let x = 0; x < img.width; x++) {
            const alpha = pixels[rowStart + x * CH + ALPHA_CH]!;
            if (alpha <= 0) continue; // skip invisible pixels.

            boxL = Math.min(boxL, x);
            boxT = Math.min(boxT, y);
            boxR = Math.max(boxR, x);
            boxB = Math.max(boxB, y);
        }
    }

    return {
        x: vb.x + boxL,
        y: vb.y + boxT,
        width: boxR - boxL + 1,
        height: boxB - boxT + 1,
    };
}
