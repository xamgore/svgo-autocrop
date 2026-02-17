// noinspection HtmlUnknownAttribute

import type { PluginInfo, XastElement, XastRoot } from 'svgo';

import Ensure from './Ensure';
import { getBounds } from './ImageUtils';
import SvgRecolor, { RecolorParams } from './SvgRecolor';
import SvgTranslate from './SvgTranslate';
import SvgTranslateError from './SvgTranslateError';
import { stringifyTree } from './SvgUtils';

type ViewBox = {
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

export type CropParams = RecolorParams & {
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
	 * Removes all `class` attributes when `true`.
	 */
	removeClass?: boolean;
	/**
	 * Removes all `style` and `font-family` attributes when `true`.
	 */
	removeStyle?: boolean;
	/**
	 * Removes deprecated & redundant root \<svg> attributes
	 * like "version", "baseProfile", "sketch:type", and "data-name".
	 */
	removeDeprecated?: boolean;
	/**
	 * Disables translating the SVG back to `(0, 0)` when `true`.
	 * Also disables translate-based cleanup (`removeClass`, `removeStyle`, `removeDeprecated`, `setColor`).
	 */
	disableTranslate?: boolean;
	/**
	 * Suppresses warnings when `true` if translation/cleanup cannot be applied.
	 */
	disableTranslateWarning?: boolean;
};

export function plugin(ast: XastRoot, params: CropParams = {}, info: PluginInfo): void {
	params = { ...params };
	try {
		// Get root <svg> node and attributes
		let svgNode = unwrapSingleSvgElement(ast);
		let attrs = svgNode.attributes;
		const dimensionsPresent = Boolean(attrs.width || attrs.height);

		const vb = attrs.viewBox
			? parseViewBoxAttr(attrs.viewBox)
			: deriveViewBoxFromDimensions(attrs);

		// Ensure width/height set (need svg to be fixed size rather than scaling to screen)
		attrs.width = `${vb.width}`;
		attrs.height = `${vb.height}`;
		const svg = stringifyTree(ast);
		const astSnapshot = structuredClone(ast);

		// Only render the SVG on the first call.
		// We still do everything else (like translate) because after the <svg>
		// is optimized, translate may succeed if it was previously failing.
		let vbNew: ViewBox;
		if (info.multipassCount === 0 && params.autocrop !== false) {
			vbNew = getViewboxWithoutPadding(svg, vb);
			addPadding(vbNew, vb, ast, params, info);
		} else {
			vbNew = vb;
		}

		// Attempt to translate back to (0,0) if not already (0,0)
		const ok = translate(ast, params, vbNew, info.multipassCount);
		if (!ok) {
			// rollback AST because it may be in an inconsistent/partially modified state.
			ast.children = astSnapshot.children;
			svgNode = unwrapSingleSvgElement(ast);
			attrs = svgNode.attributes;
		}

		attrs.viewBox = `${vbNew.x} ${vbNew.y} ${vbNew.width} ${vbNew.height}`;
		if (params.includeWidthAndHeightAttributes ?? dimensionsPresent) {
			attrs.width = `${vbNew.width}`;
			attrs.height = `${vbNew.height}`;
		} else {
			delete attrs.width;
			delete attrs.height;
		}
	} catch (e) {
		console.error(`Failed to process: ${info.path}`);
		throw e;
	}
}

function getViewboxWithoutPadding(svg: string, vb: ViewBox): ViewBox {
	// Render SVG to RGBA pixels using resvg and calculate non-transparent bounds.
	const bounds = getBounds(svg, vb.width, vb.height);
	if (bounds.width !== vb.width || bounds.height !== vb.height) {
		throw new Error(
			`Loaded png had unexpected width/height\n<svg viewbox>=${JSON.stringify(vb)}, png bounds=${JSON.stringify(bounds)}`,
		);
	}
	return {
		x: vb.x + bounds.xMin,
		y: vb.y + bounds.yMin,
		width: bounds.xMax - bounds.xMin + 1,
		height: bounds.yMax - bounds.yMin + 1,
	};
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

/**
 * @return `true` on success (including when no action is needed);
 *         `false` on failure, in which case the AST must be rolled back.
 */
function translate(
	ast: XastRoot,
	params: CropParams,
	vbNew: ViewBox,
	multipassCount: number,
): boolean {
	if (params.disableTranslate) {
		return true; // Nothing to do.
	}
	const x = vbNew.x;
	const y = vbNew.y;
	const removeClass = params.removeClass;
	const removeStyle = params.removeStyle;
	const removeDeprecated = params.removeDeprecated;
	const requiresTranslatePass =
		x !== 0 || y !== 0 || removeClass || removeStyle || removeDeprecated;
	const requiresRecolorPass = Boolean(params.setColor);
	if (!requiresTranslatePass && !requiresRecolorPass) {
		return true; // Nothing to do.
	}

	try {
		if (requiresTranslatePass) {
			// Attempt to translate back to (0, 0)
			new SvgTranslate(
				-x,
				-y,
				multipassCount,
				removeClass,
				removeStyle,
				removeDeprecated,
			).translate(ast);

			vbNew.x = 0;
			vbNew.y = 0;
		}

		if (requiresRecolorPass) {
			new SvgRecolor(params.setColor!, params.setColorIssue).recolor(ast);
		}
	} catch (err) {
		if (err instanceof SvgTranslateError) {
			if (err.type === 'silentRollback') {
				return false; // Rollback!
			}
			throw err; // Fail outright when this error is thrown.
		} else if (!params.disableTranslateWarning) {
			console.warn(
				`Failed to translate <svg> by (${x}, ${y}) - this warning can be safely ignored and can be hidden by setting 'disableTranslateWarning=true'.\n` +
					`Ideally you should update the code to fix this issue so translation can properly occur.\n` +
					`The only impact of this warning is the top/left of the viewbox won't be (0, 0)\n`,
				err,
			);
		}
		return false; // Rollback!
	}

	return true;
}

function unwrapSingleSvgElement(ast: XastRoot): XastElement {
	const svgs = ast.children.filter(
		(node): node is XastElement => node.type === 'element' && node.name === 'svg',
	);

	if (ast.children.length === 0) {
		throw new Error('AST contains no nodes');
	} else if (svgs.length === 0) {
		throw new Error("AST doesn't contain root <svg> element");
	} else if (svgs.length > 1) {
		throw new Error('AST contains multiple root <svg> elements');
	}

	return svgs[0]!;
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
