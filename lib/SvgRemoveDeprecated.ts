import type { XastElement, XastRoot } from 'svgo';

import { removeAttributesBySelector } from './SvgUtils';

export type RemoveDeprecatedParams = {
    /**
     * Removes deprecated and exporter-specific metadata attributes when `true`.
     */
    removeDeprecated?: boolean;
};

/**
 * Removes legacy/export-tool metadata that does not help icon rendering in modern pipelines.
 *
 * Icon assets collected from multiple sources often carry attributes that came from
 * older SVG specs, design tools, or editor-specific namespaces. These fields usually
 * add byte size and diff noise, and they make normalized icon output less deterministic
 * across providers without providing value in a modern browser/UI workflow.
 *
 * This pass strips those historical artifacts so output focuses on actual geometry and
 * paint semantics rather than source-tool fingerprints.
 *
 * Reimplements internal plugins:
 * - `removeUnknownsAndDefaults: { keepDataAttrs: false }`,
 * - `removeDeprecatedAttrs: { removeUnsafe: true }`,
 */
export default class SvgRemoveDeprecated {
    remove(ast: XastRoot): void {
        removeAttributesBySelector(ast, `svg[version]`, ['version']);
        removeAttributesBySelector(ast, `svg[baseProfile]`, ['baseProfile']);

        removeAttributesBySelector(ast, 'svg [enable-background]', ['enable-background']);
        removeAttributesBySelector(ast, 'svg [data-name]', ['data-name']);

        removeAttributesBySelector(ast, '[xml\\:space]', ['xml:space']);
        removeAttributesBySelector(ast, '[xmlns\\:sketch]', ['xmlns:sketch']);

        const hasAttrNamePrefix = (prefix: string) => (el: XastElement) =>
            Object.keys(el.attributes ?? {}).some((name) => name.startsWith(prefix));

        removeAttributesBySelector(ast, hasAttrNamePrefix('sketch:'), (attr) =>
            attr.startsWith('sketch:'),
        );
    }
}
