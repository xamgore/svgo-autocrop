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
    const geometricPrecision = 2;
    const resvg = new Resvg(svg, {
        shapeRendering: geometricPrecision,
        textRendering: geometricPrecision,
        font: { loadSystemFonts: false },
    });
    const img = resvg.render();
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
    let hasVisiblePixel = false;

    // scan the 'intersected' bounds and extend 'optimal' bounds when non-visible pixels are met.
    for (let y = 0; y < img.height; y++) {
        const rowStart = y * img.width * CH;

        for (let x = 0; x < img.width; x++) {
            const alpha = pixels[rowStart + x * CH + ALPHA_CH]!;
            if (alpha <= 0) continue; // skip invisible pixels.

            hasVisiblePixel = true;
            boxL = Math.min(boxL, x);
            boxT = Math.min(boxT, y);
            boxR = Math.max(boxR, x);
            boxB = Math.max(boxB, y);
        }
    }

    // Preserve a valid minimal viewBox when the rendered image is fully transparent.
    if (!hasVisiblePixel) {
        return {
            x: vb.x,
            y: vb.y,
            width: 1,
            height: 1,
        };
    }

    return {
        x: vb.x + boxL,
        y: vb.y + boxT,
        width: boxR - boxL + 1,
        height: boxB - boxT + 1,
    };
}

/** Builds a fallback viewBox from width/height attributes when viewBox is absent. */
export function deriveViewBoxFromDimensions(attributes: Record<string, string>): ViewBox {
    return {
        x: 0,
        y: 0,
        width: finiteNumOrZero(attributes.width),
        height: finiteNumOrZero(attributes.height),
    };
}

function finiteNumOrZero(value?: string): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

/** Parses an SVG `viewBox` attribute into numeric coordinates. */
export function parseViewBoxAttr(attr: string): ViewBox {
    const list = attr.trim().split(/[ ,]+/).map(finiteNumOrZero);
    if (list.length !== 4) {
        throw new Error(
            `[/svg/@viewBox] Invalid attribute. Expected viewBox to specify 4 parts, got "${attr}".`,
        );
    }
    return { x: list[0]!, y: list[1]!, width: list[2]!, height: list[3]! };
}
