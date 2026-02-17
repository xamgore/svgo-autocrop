import type { XastRoot } from 'svgo';

import { removeAttributesBySelector } from './SvgUtils';

export type RemoveClassParams = {
    /**
     * Removes all `class` attributes when `true`.
     */
    removeClass?: boolean;
};

/**
 * Removes CSS class metadata that is usually accidental for icon assets.
 *
 * Upstream icon packs often embed pack-specific class names (`bi bi-...`, `icon-...`)
 * that are useful in an HTML sprite workflow, but become baggage in a raw SVG
 * asset pipeline. Keeping these classes makes output noisy, less deterministic,
 * and can unexpectedly couple icons to host-page CSS selectors.
 *
 * This utility strips that metadata so produced SVGs remain self-contained and
 * behave consistently regardless of where they are embedded. It exists only because
 * the internal plugin `removeUnknownsAndDefaults` doesn't remove the class attribute
 * at typical elements like `rect`, `path`, `svg`.
 */
export default class SvgRemoveClass {
    remove(ast: XastRoot) {
        removeAttributesBySelector(ast, `[class]`, ['class']);
    }
}
