import type { XastChild, XastElement, XastRoot } from 'svgo';

import { ControlFlowBreak, ControlFlowRollback } from './ControlFlowErrors.ts';
import Ensure from './Ensure.ts';

export type ColorIssueReaction = 'fail' | 'warn' | 'ignore' | 'rollback';

export type RecolorParams = {
    /**
     * Replaces all colors with this value when set (usually `currentColor`).
     * When multiple colors are encountered, behavior is controlled by `setColorIssue`.
     */
    setColor?: string;
    /**
     * Controls what happens when `setColor` is set and multiple colors are found:
     * - `warn`: log a warning
     * - `fail`: throw an error and stop processing
     * - `rollback`: undo recoloring
     * - `ignore`: force all colors to `setColor` with no warning/error
     */
    setColorIssue?: ColorIssueReaction;
};

/**
 * Normalizes arbitrary SVGs into "icon-friendly" monochrome assets.
 *
 * Many SVG libraries ship icons with hard-coded paint values (`#000`, `black`, etc.)
 * and inconsistent use of paint attributes (`fill`, `stroke`, gradients, stops).
 * For UI icon systems, the common goal is a single themeable color (typically
 * `currentColor`) so the same SVG can be tinted via CSS without per-asset edits.
 *
 * This class enforces that constraint and, importantly, prevents silent foot-guns:
 * if the input is actually multicolor artwork, `onColorIssue` decides whether to
 * warn, fail, rollback the broader transform step, or forcibly flatten anyway.
 *
 * It also makes output deterministic for inputs that rely on SVG "initial" paint
 * defaults (no explicit color attributes). In that case, the root `<svg>` gets a
 * `fill` so the result is explicitly themeable instead of implicitly "black".
 *
 * Depends on these internal plugins:
 * - https://svgo.dev/docs/plugins/convertColors/
 */
export default class SvgRecolor {
    /** @see https://www.w3.org/TR/SVG11/single-page.html#types-DataTypeColor */
    static COLOR_ATTRIBUTES = new Set([
        'color',
        'fill',
        'flood-color',
        'lighting-color',
        'stop-color',
        'stroke',
    ]);

    /**
     * The first color being set for any of the color attributes in the SVG.
     * If another color is encountered during tree traversal, that's an issue.
     * Stored in lowercase.
     */
    private firstSeenColor: string | null = null;

    constructor(
        private newColor: string,
        private onColorIssue: ColorIssueReaction = 'warn',
    ) {
        // todo: zod validation
        if (!['warn', 'fail', 'rollback', 'ignore'].includes(onColorIssue)) {
            throw Ensure.unexpectedObject(
                'Invalid "params.setColorIssue" value specified',
                onColorIssue,
            );
        }
    }

    recolorTree(ast: XastRoot) {
        for (const node of ast.children) {
            this.recolor(node);
        }
    }

    recolor(node: XastChild) {
        if (node.type === 'element' && node.name === 'svg') {
            this.firstSeenColor = null;
            this.visitElement(node);
            // if the SVG has no explicit color attributes, it falls back to the "initial" colors.
            // that’s why we set `fill` on the root <svg> element.
            if (!this.firstSeenColor) {
                node.attributes.fill = this.newColor;
            }
        }
    }

    visitElement(node: XastElement) {
        for (const attr in node.attributes) {
            if (SvgRecolor.COLOR_ATTRIBUTES.has(attr)) {
                this.visitColorAttribute(node, attr);
            }
        }

        for (const child of node.children) {
            if (child.type === 'element') {
                this.visitElement(child);
            }
        }
    }

    visitColorAttribute(node: XastElement, attr: string) {
        const value = node.attributes[attr]?.trim()?.toLowerCase();

        // "none" = "invisible", can't touch it.
        if (value === 'none') return;

        // can be safely removed because:
        // – an empty attribute is invalid, and is handled as if the attribute wasn’t specified
        // – `color="currentColor" is a tautology and effectively no-op for rendering.
        if (!value || (attr === 'color' && this.newColor === 'currentColor')) {
            delete node.attributes[attr];
            return;
        }

        this.firstSeenColor ??= value;
        node.attributes[attr] = this.newColor;

        if (this.firstSeenColor !== value && this.onColorIssue !== 'ignore') {
            this.notifyColorsAreMixed();
        }
    }

    notifyColorsAreMixed() {
        const message = 'Expected a monochrome (single-color) SVG, but found multiple colors.';
        if (this.onColorIssue === 'warn') {
            console.warn(message);
        } else if (this.onColorIssue === 'rollback') {
            throw new ControlFlowRollback(message);
        } else {
            throw new ControlFlowBreak(message);
        }
    }
}
