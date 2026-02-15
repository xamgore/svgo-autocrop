import type { XastRoot } from 'svgo';

import { parseSvg } from 'svgo/lib/parser';
import { stringifySvg } from 'svgo/lib/stringifier';

export default class SvgUtils {
	/**
	 * Parse the SVG/XML string provided - and return the javascript in-memory representation.
	 *
	 * @param str SVG/XML string.
	 * @param path Optional SVG path - only used if reporting error.
	 */
	static svg2js(str: string, path?: string): XastRoot {
		return parseSvg(str, path);
	}

	/**
	 * Format the AST/Javascript in-memory representation back to the SVG/XML string.
	 */
	static js2svg(ast: XastRoot): string {
		return stringifySvg(ast).data;
	}
}
