import type { CustomPlugin } from 'svgo';

import type { CropParams } from './lib/AutocropUtils.ts';
import { plugin } from './lib/AutocropUtils.ts';

/**
 * SVGO plugin that reduces `viewBox` to visible content bounds.
 *
 * @example
 * <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
 *   <rect x="5" y="5" width="10" height="10" fill="#000"/>
 * </svg>
 *              ⬇⬇⬇⬇⬇⬇⬇
 * <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
 *   <rect x="0" y="0" width="10" height="10" fill="#000"/>
 * </svg>
 */
const autocrop: CustomPlugin<CropParams> = {
    name: 'autocrop',
    fn: (ast, params = {}, info) => {
        plugin(ast, params, info);
    },
};

/**
 * Safe preset, just cropping SVGs.
 * Changes only the `viewBox` attribute, keeping the rest of the SVG untouched to minimize visual risk.
 * Read more in `README.md`.
 */
export const paramsToBeSafe: CropParams = {
    autocrop: true,
    disableTranslate: true,
    includeWidthAndHeightAttributes: false,
    // keep the same.
    removeClass: false,
    removeStyle: false,
    removeDeprecated: false,
    setColor: undefined,
};

/**
 * Preferred preset for optimizing SVGs.
 * Crops and cleans output while preserving original colors and paint attributes.
 * Read more in `README.md`.
 */
export const paramsToBeOptimized: CropParams = {
    autocrop: true,
    // omits everything except the graphics.
    includeWidthAndHeightAttributes: false,
    removeClass: true,
    removeStyle: true,
    removeDeprecated: true,
    // keep the same.
    setColor: undefined,
};

/**
 * Preset tuned for icon packs: crops and normalizes SVGs to monochrome.
 * Uses `currentColor` so icons automatically adapt to light and dark themes.
 * Read more in `README.md`.
 */
export const paramsToBeMonochrome: CropParams = {
    autocrop: true,
    includeWidthAndHeightAttributes: false,
    removeClass: false,
    removeStyle: false,
    removeDeprecated: true,
    setColor: 'currentColor',
    setColorIssue: 'rollback',
};

/** Public options accepted by the `autocrop` plugin. */
export type { CropParams };
/** Default export for SVGO plugin registration. */
export default autocrop;
