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

/** Public options accepted by the `autocrop` plugin. */
export type { CropParams };
/** Default export for SVGO plugin registration. */
export default autocrop;
