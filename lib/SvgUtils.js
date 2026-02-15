const { stringifySvg } = require('svgo/lib/stringifier');
const { parseSvg } = require('svgo/lib/parser');

module.exports = class SvgUtils {
	/**
	 * Parse the SVG/XML string provided - and return the javascript in-memory representation.
	 *
	 * @param str SVG/XML string.
	 * @param path Optional SVG path - only used if reporting error.
	 */
	static svg2js(str, path) {
		return parseSvg(str, path);
	}

	/**
	 * Format the AST/Javascript in-memory representation back to the SVG/XML string.
	 */
	static js2svg(ast) {
		return stringifySvg(ast).data;
	}
};
