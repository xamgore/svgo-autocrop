import type { XastRoot } from 'svgo';

import { removeAttributesBySelector } from './SvgUtils.ts';

export type RemoveStyleParams = {
    /**
     * Removes all `style`, `font-family`, and `overflow="visible"` attributes when `true`.
     */
    removeStyle?: boolean;
};

/**
 * Strips export/editor styling noise to make SVG icons deterministic and themeable.
 *
 * Many icon sources ship with inline `style`, `font-family`, and redundant
 * `overflow="visible"` declarations (often introduced or surfaced by SVGO passes
 * like `convertStyleToAttrs`). In an icon pipeline this is usually accidental:
 * it bloats output, creates noisy diffs, and can fight downstream theming (for
 * example when recoloring to `currentColor` and styling via CSS).
 *
 * Conflicts with these internal plugins:
 * - https://svgo.dev/docs/plugins/convertStyleToAttrs/
 */
export default class SvgRemoveStyle {
    remove(ast: XastRoot) {
        removeAttributesBySelector(ast, `[style]`, ['style']);
        removeAttributesBySelector(ast, `[font-family]`, ['font-family']);

        // Note: avoid blanket assumptions here. In SVG, promoting CSS `style` to presentation
        // attributes (e.g. via `convertStyleToAttrs`) is not always behavior-preserving because
        // cascade precedence can change. Also, removing explicit `overflow="visible"` is not
        // generally safe: on some SVG viewport elements it can affect clipping/rendering.
        // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/overflow
        removeAttributesBySelector(ast, `[overflow=""], [overflow="visible"]`, ['overflow']);
    }
}
