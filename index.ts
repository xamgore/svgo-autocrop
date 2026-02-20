import type { CustomPlugin } from 'svgo';

import type { CropParams } from './lib/AutocropUtils';
import { plugin } from './lib/AutocropUtils';

const autocrop: CustomPlugin<CropParams> = {
    name: 'autocrop',

    /**
     * Reduce viewBox to minimum possible size so no wasted transparent space around svg.
     *
     * @example
     * <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
     *   <rect x="5" y="5" width="10" height="10" fill="#000"/>
     * </svg>
     *             ⬇
     * <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
     *   <rect x="0" y="0" width="10" height="10" fill="#000"/>
     * </svg>
     */
    fn: (ast, params = {}, info) => {
        plugin(ast, params, info);
    },
};

export type { CropParams };
export default autocrop;
