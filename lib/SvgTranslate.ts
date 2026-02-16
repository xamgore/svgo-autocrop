import type { XastElement, XastNode } from 'svgo';

import { SVGPathData } from 'svg-pathdata';

import Ensure from './Ensure';
import SvgTranslateError from './SvgTranslateError';

export type ColorIssueReaction = 'fail' | 'warn' | 'ignore' | 'rollback';

export default class SvgTranslate {
	private previousColor: string | null;

	/**
	 * @removeClass If true, then delete 'class' attribute.
	 * @removeStyle If true, then delete 'style' and other styling attributes.
	 * @removeDeprecated If true, then delete <svg version/baseProfile> attributes. Also deletes other non-standard/not useful attributes like 'sketch:type'/'data-name'/etc.
	 * @setColor If provided, then replace all colors with color specified. Usually set to 'currentColor'.
	 * @setColorIssue Either undefined/'warn', 'fail', 'rollback' or 'ignore'. See "README.md#Parameters" for a full description of these values.
	 */
	constructor(
		private x: number,
		private y: number,
		private multipassCount = 0,
		private removeClass = false,
		private removeStyle = false,
		private removeDeprecated = false,
		private setColor: string | null = null,
		private setColorIssue: ColorIssueReaction | null = null,
	) {
		// Used to store lowercase color previously encountered.
		// If 'setColor' is defined, and we encounter more than one color, then we fail.
		this.previousColor = null;
		if (!setColorIssue || setColorIssue === 'warn') {
			this.setColorIssue = null;
		} else if (
			!(
				setColorIssue === 'fail' ||
				setColorIssue === 'rollback' ||
				setColorIssue === 'ignore'
			)
		) {
			throw Ensure.unexpectedObject(
				'Invalid "params.setColorIssue" value specified',
				setColorIssue,
			);
		}
	}

	/**
	 * Translate the ast by (x, y).
	 *
	 * Implementation works off a whitelist of known svg elements/attributes - if anything unknown is encountered, an exception is thrown.
	 * If an exception is thrown, the caller has to rollback the ast themselves to the original unmodified version.
	 */
	translate(ast: XastNode) {
		if (ast.type !== 'root') {
			throw Ensure.unexpectedObject('Expected root', ast);
		}
		let hasSvg = false;
		for (const child of ast.children) {
			const type = child.type;
			if (type === 'element' && child.name === 'svg') {
				if (hasSvg) {
					throw Ensure.unexpectedObject('Multiple <svg> elements found', ast);
				}
				hasSvg = true;
				this.#rootSvg(child);
			} else if (type === 'comment' || type === 'instruction' || type === 'doctype') {
				// Can ignore comments and instructions like <?xml ... ?>
			} else {
				throw Ensure.unexpectedObject('Unhandled node', child);
			}
		}
		if (!hasSvg) {
			throw Ensure.unexpectedObject('No <svg> element found', ast);
		}
	}

	#rootSvg(svg: XastElement) {
		this.#svg(svg);

		// Ensure color set to root <svg> if not set to any other part of the <svg>
		let setColor = this.setColor;
		if (setColor && !this.previousColor) {
			svg.attributes['fill'] = setColor;
		}
	}

	#svg(svg: XastElement) {
		const attributes = svg.attributes;
		for (const attr in attributes) {
			if (attr === 'viewBox') {
				// TODO maybe do something?
			} else if (
				attr === 'width' ||
				attr === 'height' ||
				attr === 'xmlns' ||
				attr === 'enable-background' ||
				attr === 'preserveAspectRatio'
			) {
				// Ignore
			} else if (attr === 'version' || attr === 'baseProfile') {
				if (this.removeDeprecated) {
					// Remove deprecated if requested
					delete attributes[attr];
				}
			} else if (attr === 'x' || attr === 'y') {
				let str = attributes[attr];
				if (!str || str === '0' || str === '0px') {
					delete attributes[attr]; // Can just remove this - completely redundant.
				} else {
					this.#unhandledAttribute(svg, attributes, attr);
				}
			} else {
				this.#unhandledAttribute(svg, attributes, attr);
			}
		}
		this.#handleChildren(svg);
	}

	#handleChildren(node: XastElement) {
		for (const child of node.children) {
			const type = child.type;
			if (type === 'element') {
				const name = child.name.toLowerCase();
				if (name === 'g') {
					this.#g(child);
				} else if (name === 'path') {
					this.#path(child);
				} else if (name === 'rect') {
					this.#rect(child);
				} else if (name === 'line') {
					this.#line(child);
				} else if (name === 'polyline') {
					this.#polyline(child);
				} else if (name === 'polygon') {
					this.#polygon(child);
				} else if (name === 'circle') {
					this.#circle(child);
				} else if (name === 'ellipse') {
					this.#ellipse(child);
				} else if (name === 'defs') {
					this.#defs(child);
				} else if (name === 'title' || name === 'desc') {
					// Can just ignore title/description
				} else {
					throw Ensure.unexpectedObject('Unhandled element', child);
				}
			} else if (type === 'comment') {
				// Can ignore comments
			} else {
				throw Ensure.unexpectedObject(`Unhandled node type "${type}"`, child);
			}
		}
	}

	#ensureNoChildren(node: XastElement) {
		let children = node.children;
		if (children && children.length > 0) {
			throw Ensure.unexpectedObject('Unexpected/unhandled children', node);
		}
	}

	#unhandledAttribute(node: XastElement, attributes: Record<string, string>, attr: string) {
		if (attr) {
			// For full list, see: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute
			if (
				attr === 'fill' ||
				attr === 'stroke' ||
				attr === 'color' ||
				attr === 'stop-color' ||
				attr === 'flood-color' ||
				attr === 'lighting-color'
			) {
				this.#translateColor(node, attributes, attr);
				return;
			} else if (attr === 'class') {
				if (this.removeClass) {
					delete attributes[attr];
				}
				return;
			} else if (attr === 'style' || attr === 'font-family') {
				if (this.removeStyle) {
					delete attributes[attr];
				}
				return;
			} else if (attr === 'overflow') {
				// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/overflow
				if (this.removeStyle) {
					let value = attributes[attr];
					if (!value || value === 'visible') {
						// 'overflow=visible' is the default - so just remove this.
						delete attributes[attr];
					}
				}
				return;
			} else if (
				attr === 'enable-background' ||
				attr === 'data-name' ||
				attr === 'xml:space' ||
				attr === 'xmlns:sketch' ||
				attr.startsWith('sketch:')
			) {
				// Note: most common 'sketch:' attribute is 'sketch:type'.
				if (this.removeDeprecated) {
					// Remove deprecated/redundant if requested
					delete attributes[attr];
				}
				return;
			} else if (attr === 'transform') {
				if (this.multipassCount === 0) {
					throw SvgTranslateError.silentRollback(
						"Svgo's 'convertTransform' plugin will often remove transforms. During the next run potentially no transform attribute will be present.",
					);
				} else {
					throw Ensure.unexpectedObject(
						"Svgo's 'convertTransform' is either not enabled or failed to remove <" +
							node.name +
							" transform='" +
							attributes[attr] +
							"'> on the first pass.\n" +
							"If this was a simple transform, consider confirming the svgo default plugins or at least the 'convertTransform' plugin are in your svgo configuration file.",
						node,
					);
				}
			} else if (
				attr === 'id' ||
				attr === 'opacity' ||
				attr === 'display' ||
				attr === 'role' ||
				attr === 'tabindex' ||
				attr === 'focusable' ||
				attr === 'preserveAspectRatio' ||
				attr === 'pointer-events' ||
				attr === 'shape-rendering' ||
				attr === 'color-rendering' ||
				attr === 'text-rendering' ||
				attr.startsWith('fill-') ||
				attr.startsWith('stroke-') ||
				attr.startsWith('clip-') ||
				attr.startsWith('aria-') ||
				attr.startsWith('data-') ||
				attr.startsWith('xmlns:') ||
				attr.startsWith('xml:')
			) {
				return; // Can somewhat safely ignore these.
			}
		}
		throw Ensure.unexpectedObject(`Unhandled <${node.name} ${attr}> attribute`, node);
	}

	#translateX(node: XastElement, attributes: Record<string, string>, attr: string) {
		let x = this.x;
		if (x !== 0) {
			let num = this.#getNumberAttr(node, attributes, attr);
			attributes[attr] = '' + (num + x);
		}
	}

	#translateY(node: XastElement, attributes: Record<string, string>, attr: string) {
		let y = this.y;
		if (y !== 0) {
			let num = this.#getNumberAttr(node, attributes, attr);
			attributes[attr] = '' + (num + y);
		}
	}

	#translateColor(node: XastElement, attributes: Record<string, string>, attr: string) {
		let setColor = this.setColor;
		if (!setColor) {
			return;
		}

		// Get value
		let value = attributes[attr];
		if (!value || (value = value.trim()).length <= 0) {
			delete attributes[attr];
			return;
		}
		value = value.toLowerCase();

		// Set color
		if (value !== 'none') {
			// 'color="currentColor"' is always redundant - setting color to the 'currentColor' has no effect given the previous color was already 'currentColor'.
			if (attr === 'color' && setColor === 'currentColor') {
				delete attributes[attr];
				return;
			}

			// Compare to previous color
			let previousColor = this.previousColor;
			if (!previousColor) {
				this.previousColor = value;
			} else if (previousColor !== value) {
				// Note: case-insensitive comparison.
				let setColorIssue = this.setColorIssue;
				if (setColorIssue !== 'ignore') {
					let message = `Expected single color/monotone <svg>, however multiple colors encountered in <svg> - previous color "${previousColor}", but just encountered <${node.name} ${attr}="${attributes[attr]}"> attribute with different color`;
					if (!setColorIssue || setColorIssue === 'warn') {
						console.warn(message);
					} else if (setColorIssue === 'rollback') {
						throw Ensure.unexpectedObject(message, node);
					} else {
						throw SvgTranslateError.fail(message);
					}
				}
			}

			// Set color
			attributes[attr] = setColor;
		}
	}

	#getAttribString(node: XastElement, attributes: Record<string, string>, attr: string) {
		let str = attributes[attr];
		if (typeof str !== 'string') {
			throw Ensure.unexpectedObject(
				`Invalid <${node.name} ${attr}> attribute - expected string`,
				node,
			);
		} else if (str.length <= 0) {
			throw Ensure.unexpectedObject(
				`Invalid <${node.name} ${attr}> attribute - empty string specified for attribute`,
				node,
			);
		}
		return str;
	}

	#getNumberAttr(node: XastElement, attributes: Record<string, string>, attr: string) {
		let str = this.#getAttribString(node, attributes, attr);
		let num = Number(str);
		if (!isFinite(num)) {
			throw Ensure.unexpectedObject(
				`Invalid <${node.name} ${attr}="${str}"> attribute - invalid number`,
				node,
			);
		}
		return num;
	}

	#defs(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Element/defs
		const attributes = node.attributes;
		for (const attr in attributes) {
			this.#unhandledAttribute(node, attributes, attr);
		}
		this.#ensureNoChildren(node);
	}

	#g(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Element/g
		const attributes = node.attributes;
		for (const attr in attributes) {
			this.#unhandledAttribute(node, attributes, attr);
		}
		this.#handleChildren(node);
	}

	#path(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#path
		const attributes = node.attributes;
		for (const attr in attributes) {
			if (attr === 'd') {
				let x = this.x;
				let y = this.y;
				if (x !== 0 || y !== 0) {
					let data = attributes.d;
					let dataNew = new SVGPathData(data)
						.toAbs()
						.translate(x, y)
						.round(1e14)
						.encode();
					attributes.d = dataNew;
				}
			} else {
				this.#unhandledAttribute(node, attributes, attr);
			}
		}
		this.#ensureNoChildren(node);
	}

	#rect(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#rectangle
		const attributes = node.attributes;
		for (const attr in attributes) {
			if (attr === 'x') {
				this.#translateX(node, attributes, attr);
			} else if (attr === 'y') {
				this.#translateY(node, attributes, attr);
			} else if (attr === 'width' || attr === 'height' || attr === 'rx' || attr === 'ry') {
				// Can safely ignore these
			} else {
				this.#unhandledAttribute(node, attributes, attr);
			}
		}
		this.#ensureNoChildren(node);
	}

	#line(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#line
		const attributes = node.attributes;
		for (const attr in attributes) {
			if (attr === 'x1' || attr === 'x2') {
				this.#translateX(node, attributes, attr);
			} else if (attr === 'y1' || attr === 'y2') {
				this.#translateY(node, attributes, attr);
			} else {
				this.#unhandledAttribute(node, attributes, attr);
			}
		}
		this.#ensureNoChildren(node);
	}

	#polyline(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#polyline
		this.#_silentRollbackIfFirstPass(node);
	}

	#polygon(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#polygon
		this.#_silentRollbackIfFirstPass(node);
	}

	#_silentRollbackIfFirstPass(node: XastElement) {
		let multipassCount = this.multipassCount;
		if (multipassCount === 0) {
			throw SvgTranslateError.silentRollback(
				"Svgo's 'convertShapeToPath' plugin will convert this to <path d> - which we can translate on next call",
			);
		} else {
			const err =
				`Svgo's 'convertShapeToPath' was meant to convert <${node.name}> to <path d> on the first pass, however it's multipassCount=${multipassCount} and this <${node.name}> element hasn't been replaced.\n` +
				`Please confirm svgo default plugins or at least the 'convertShapeToPath' plugin are in your svgo configuration file.`;
			throw Ensure.unexpectedObject(err, node);
		}
	}

	#circle(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#circle
		const attributes = node.attributes;
		for (const attr in attributes) {
			if (attr === 'cx') {
				this.#translateX(node, attributes, attr);
			} else if (attr === 'cy') {
				this.#translateY(node, attributes, attr);
			} else if (attr === 'r') {
				// Can safely ignore these
			} else {
				this.#unhandledAttribute(node, attributes, attr);
			}
		}
		this.#ensureNoChildren(node);
	}

	#ellipse(node: XastElement) {
		// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#ellipse
		const attributes = node.attributes;
		for (const attr in attributes) {
			if (attr === 'cx') {
				this.#translateX(node, attributes, attr);
			} else if (attr === 'cy') {
				this.#translateY(node, attributes, attr);
			} else if (attr === 'rx' || attr === 'ry') {
				// Can safely ignore these
			} else {
				this.#unhandledAttribute(node, attributes, attr);
			}
		}
		this.#ensureNoChildren(node);
	}
}
