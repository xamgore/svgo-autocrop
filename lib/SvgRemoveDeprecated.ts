import type { XastElement, XastRoot } from 'svgo';

export type RemoveDeprecatedParams = {
    /**
     * Removes deprecated and exporter-specific metadata attributes when `true`.
     */
    removeDeprecated?: boolean;
};

const DEPRECATED_ATTRIBUTES = new Set([
    'version',
    'baseProfile',
    'enable-background',
    'data-name',
    'xml:space',
    'xmlns:sketch',
]);

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
        for (const node of ast.children) {
            if (node.type === 'element' && node.name === 'svg') {
                this.visitElement(node);
            }
        }
    }

    visitElement(node: XastElement): void {
        for (const attr in node.attributes) {
            if (DEPRECATED_ATTRIBUTES.has(attr) || attr.startsWith('sketch:')) {
                delete node.attributes[attr];
            }
        }

        for (const child of node.children) {
            if (child.type === 'element') {
                this.visitElement(child);
            }
        }
    }
}
