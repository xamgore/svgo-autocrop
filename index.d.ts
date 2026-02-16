import type { CustomPlugin } from 'svgo';

import type { AutocropParams } from './lib/AutocropUtils';

declare const autocrop: CustomPlugin<AutocropParams>;

export type { AutocropParams };
export default autocrop;
