import { Resvg } from '@resvg/resvg-js';

import Ensure from './Ensure';

export type ImageBounds = {
    width: number;
    height: number;
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
};

/** Render svg and return width/height and bounds of visible pixels. */
export function getBounds(svg: string, width: number, height: number): ImageBounds {
    width = Ensure.integerStrict(width, 'width');
    height = Ensure.integerStrict(height, 'height');

    if (!svg) {
        throw new Error('No svg provided');
    } else if (width <= 0 || height <= 0) {
        throw new Error(`Invalid width/height provided; width=${width}, height=${height}`);
    }

    const img = new Resvg(svg).render();
    return getVisiblePixelBounds(img.pixels, img.width, img.height);
}

function getVisiblePixelBounds(pixels: Buffer, width: number, height: number): ImageBounds {
    const expectedPixelCount = width * height * 4;
    if (!pixels || pixels.length !== expectedPixelCount) {
        throw new Error(
            `Invalid rendered image pixels; expected length=${expectedPixelCount}, actual=${pixels?.length ?? null}`,
        );
    }

    // Scan image determining bounds of visible pixels.
    let xMin = width;
    let yMin = height;
    let xMax = -1;
    let yMax = -1;
    const rowStride = width * 4;

    for (let y = 0; y < height; y++) {
        const rowStart = y * rowStride;
        for (let x = 0; x < width; x++) {
            const alpha = pixels[rowStart + x * 4 + 3]!;
            // the pixel is visible?
            if (alpha > 0) {
                if (x < xMin) {
                    xMin = x;
                } else if (x > xMax) {
                    xMax = x;
                }

                if (y < yMin) {
                    yMin = y;
                } else if (y > yMax) {
                    yMax = y;
                }
            }
        }
    }

    if (xMax < 0 || yMax < 0) {
        throw new Error('Image has no visible pixels');
    }

    const result = { width, height, xMin, yMin, xMax, yMax };
    if (0 <= xMin && xMin <= xMax && xMax < width && 0 <= yMin && yMin <= yMax && yMax < height) {
        return result;
    }

    throw new Error(`Unexpected - invalid bounds calculated: ${JSON.stringify(result)}`);
}
