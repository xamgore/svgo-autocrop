import type { XastRoot } from 'svgo';

import { parseSvg } from 'svgo/lib/parser';
import { stringifySvg } from 'svgo/lib/stringifier';

/**
 * Parse the SVG/XML string provided - and return the javascript in-memory representation.
 *
 * @param str SVG/XML string.
 * @param path Optional SVG path - only used if reporting error.
 */
export function svg2js(str: string, path?: string): XastRoot {
	return parseSvg(str, path);
}

/**
 * Format the AST/Javascript in-memory representation back to the SVG/XML string.
 */
export function js2svg(ast: XastRoot): string {
	return stringifySvg(ast).data;
}
