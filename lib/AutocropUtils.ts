// noinspection HtmlUnknownAttribute

import type { PluginInfo, XastElement, XastRoot } from 'svgo';

import { ControlFlowBreak, ControlFlowRollback } from './ControlFlowErrors.ts';
import Ensure from './Ensure.ts';
import { getVisiblePixelBounds } from './ImageUtils.ts';
import SvgRecolor, { RecolorParams } from './SvgRecolor.ts';
import SvgRemoveClass, { RemoveClassParams } from './SvgRemoveClass.ts';
import SvgRemoveDeprecated, { RemoveDeprecatedParams } from './SvgRemoveDeprecated.ts';
import SvgRemoveStyle, { RemoveStyleParams } from './SvgRemoveStyle.ts';
import SvgTranslate from './SvgTranslate.ts';
import { stringifyTree } from './SvgUtils.ts';

export type ViewBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type PaddingObject = {
    top: unknown;
    bottom: unknown;
    left: unknown;
    right: unknown;
};

type PaddingFunction = (
    viewboxNew: ViewBox,
    viewbox: ViewBox,
    ast: XastRoot,
    params: CropParams,
    info: PluginInfo,
) => void;

export type CropParams = RemoveClassParams &
    RemoveDeprecatedParams &
    RemoveStyleParams &
    RecolorParams & {
        /** Enable auto cropping. `true` by default. */
        autocrop?: boolean;
        /**
         * Controls whether the root \<svg> "width" & "height" attributes:
         *
         * - `false`: are removed, making SVG scaling depend on viewBox;
         * - `true`: are set even if missing (values are derived from the viewBox attribute);
         * - `undefined`: are updated only if they are already present (default);
         */
        includeWidthAndHeightAttributes?: boolean;
        /**
         * Adds extra padding after autocrop:
         * - number
         * - object `{ top, bottom, left, right }`
         * - function `(viewboxNew, viewbox?, ast?, params?, info?)` that mutates `viewboxNew`
         *
         * Padding is usually better handled in CSS instead of in the SVG.
         */
        padding?: number | PaddingObject | PaddingFunction;
        /**
         * Disables translating the SVG back to `(0, 0)` when `true`.
         */
        disableTranslate?: boolean;
        /**
         * Suppresses warnings when `true` if translation cannot be applied.
         */
        disableTranslateWarning?: boolean;
    };

export function plugin(ast: XastRoot, params: CropParams = {}, info: PluginInfo): void {
    params.disableTranslateWarning ??= true;

    if (params.removeClass) {
        new SvgRemoveClass().remove(ast);
    }
    if (params.removeStyle) {
        new SvgRemoveStyle().remove(ast);
    }
    if (params.removeDeprecated) {
        new SvgRemoveDeprecated().remove(ast);
    }

    const svgs = ast.children.filter(
        (node): node is XastElement => node.type === 'element' && node.name === 'svg',
    );

    for (const svg of svgs) {
        if (params.setColor) {
            transformOrRollback(svg, () => {
                new SvgRecolor(params.setColor!, params.setColorIssue).recolor(svg);
            });
        }

        const vb = svg.attributes.viewBox
            ? parseViewBoxAttr(svg.attributes.viewBox)
            : deriveViewBoxFromDimensions(svg.attributes);

        // ensure width & height are absent for correct rendering.
        const hasDimensions = Boolean(svg.attributes.width || svg.attributes.height);
        delete svg.attributes.width;
        delete svg.attributes.height;

        try {
            // only render the SVG on the first call.
            let vbNew: ViewBox = vb;
            if (info.multipassCount === 0 && params.autocrop !== false) {
                vbNew = getVisiblePixelBounds(stringifyTree(svg), vb);
                addPadding(vbNew, vb, ast, params, info);
            }

            if (!params.disableTranslate && (vbNew.x !== 0 || vbNew.y !== 0)) {
                // translate back to (0,0) if not already (0,0).
                transformOrRollback(
                    svg,
                    () => {
                        new SvgTranslate(-vbNew.x, -vbNew.y, info.multipassCount).translate(svg);
                        vbNew.x = 0;
                        vbNew.y = 0;
                    },
                    params.disableTranslateWarning
                        ? () =>
                              `Failed to translate <svg> by (${vbNew.x}, ${vbNew.y}) - this warning can be safely ignored and can be hidden by setting 'disableTranslateWarning=true'.\n` +
                              `Ideally you should update the code to fix this issue so translation can properly occur.\n` +
                              `The only impact of this warning is the top/left of the viewbox won't be (0, 0)\n`
                        : undefined,
                );
            }

            svg.attributes.viewBox = `${vbNew.x} ${vbNew.y} ${vbNew.width} ${vbNew.height}`;
            if (params.includeWidthAndHeightAttributes ?? hasDimensions) {
                svg.attributes.width = `${vbNew.width}`;
                svg.attributes.height = `${vbNew.height}`;
            }
        } catch (e) {
            console.error(`Failed to process: ${info.path}`);
            throw e;
        }
    }
}

function transformOrRollback(svg: XastElement, func: () => void, onError?: () => string) {
    const snapshot = structuredClone(svg);
    try {
        func();
    } catch (err: unknown) {
        // rollback AST because it may be in an inconsistent/partially modified state.
        svg.children = snapshot.children;
        svg.attributes = snapshot.attributes;

        if (err instanceof ControlFlowRollback) {
            return; // just rollback.
        }
        if (err instanceof ControlFlowBreak) {
            throw err; // rethrows up.
        }
        if (err instanceof Error && onError) {
            console.warn(onError(), err);
        }
    }
}

function addPadding(
    vbNew: ViewBox,
    vb: ViewBox,
    ast: XastRoot,
    params: CropParams,
    info: PluginInfo,
): void {
    const padding = params.padding;
    if (!padding) {
        return;
    }
    if (typeof padding === 'number') {
        vbNew.x -= padding;
        vbNew.y -= padding;
        vbNew.width += padding * 2;
        vbNew.height += padding * 2;
    } else if (typeof padding === 'object') {
        const top = Ensure.integer(padding.top, 'padding.top');
        const bottom = Ensure.integer(padding.bottom, 'padding.bottom');
        const left = Ensure.integer(padding.left, 'padding.left');
        const right = Ensure.integer(padding.right, 'padding.right');

        vbNew.x -= left;
        vbNew.y -= top;
        vbNew.width += left + right;
        vbNew.height += top + bottom;
    } else if (typeof padding === 'function') {
        padding(vbNew, vb, ast, params, info);
    } else {
        throw Ensure.unexpectedObject('Unsupported padding specified', padding);
    }
}

function deriveViewBoxFromDimensions(attributes: Record<string, string>): ViewBox {
    return {
        x: 0,
        y: 0,
        width: Ensure.integer(attributes.width, '/svg/@width'),
        height: Ensure.integer(attributes.height, '/svg/@height'),
    };
}

function parseViewBoxAttr(attr: string): ViewBox {
    const array = attr.split(/[ ,]+/, 4);
    if (array.length !== 4) {
        throw new Error(
            `[/svg/@viewBox] Invalid attribute. Expected viewBox to specify 4 parts, got "${attr}".`,
        );
    }
    return {
        x: Ensure.integer(array[0], '/svg/@viewBox#0'),
        y: Ensure.integer(array[1], '/svg/@viewBox#1'),
        width: Ensure.integer(array[2], '/svg/@viewBox#2'),
        height: Ensure.integer(array[3], '/svg/@viewBox#3'),
    };
}
