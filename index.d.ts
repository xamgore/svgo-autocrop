import type { CustomPlugin } from 'svgo';

import type { CropParams } from './lib/AutocropUtils';

declare const autocrop: CustomPlugin<CropParams>;

export type { CropParams };
export default autocrop;
