import type { XastElement, XastRoot } from 'svgo';

import { SVGPathData } from 'svg-pathdata';

import Ensure from './Ensure';
import SvgTranslateError from './SvgTranslateError';
import { stringifyTree } from './SvgUtils';

export default class SvgTranslate {
    /**
     * @removeDeprecated If true, then delete <svg version/baseProfile> attributes. Also deletes other non-standard/not useful attributes like 'sketch:type'/'data-name'/etc.
     */
    constructor(
        private x: number,
        private y: number,
        private multipassCount = 0,
        private removeDeprecated = false,
    ) {}

    /**
     * Translate the AST by (x, y).
     *
     * Implementation works off a whitelist of known svg elements/attributes - if anything unknown is encountered, an exception is thrown.
     * If an exception is thrown, the caller has to roll back the AST themselves to the original unmodified version.
     */
    translate(ast: XastRoot) {
        for (const child of ast.children) {
            if (child.type === 'element' && child.name === 'svg') {
                this.#rootSvg(child);
            } else {
                // Can ignore comments and instructions like <?xml ... ?>
            }
        }
    }

    #rootSvg(svg: XastElement) {
        this.#svg(svg);
    }

    #svg(svg: XastElement) {
        for (const attr in svg.attributes) {
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
                    delete svg.attributes[attr];
                }
            } else if (attr === 'x' || attr === 'y') {
                const str = svg.attributes[attr];
                if (!str || str === '0' || str === '0px') {
                    delete svg.attributes[attr]; // Can just remove this - completely redundant.
                } else {
                    this.#unhandledAttribute(svg, attr);
                }
            } else {
                this.#unhandledAttribute(svg, attr);
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
        if (node.children.length > 0) {
            throw Ensure.unexpectedObject('Unexpected/unhandled children', node);
        }
    }

    #unhandledAttribute(node: XastElement, attr: string) {
        // For full list, see: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute
        if (
            attr === 'fill' ||
            attr === 'stroke' ||
            attr === 'color' ||
            attr === 'stop-color' ||
            attr === 'flood-color' ||
            attr === 'lighting-color'
        ) {
            return; // Handled by recolor pass.
        } else if (attr === 'class') {
            // Handled by class-cleanup pass.
            return;
        } else if (attr === 'style' || attr === 'font-family' || attr === 'overflow') {
            // Handled by style-cleanup pass.
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
                delete node.attributes[attr];
            }
            return;
        } else if (attr === 'transform') {
            // the attribute should have been already simplified and removed
            this.#bailIfAnotherPluginMustRunFirst('convertTransform', node);
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
        throw Ensure.unexpectedObject(`Unhandled <${node.name} ${attr}> attribute`, node);
    }

    #translateX(node: XastElement, attr: string) {
        if (this.x === 0) return;
        const newX = this.x + this.#unwrapNumberAttr(node, attr);
        node.attributes[attr] = newX.toString();
    }

    #translateY(node: XastElement, attr: string) {
        if (this.y === 0) return;
        const newY = this.y + this.#unwrapNumberAttr(node, attr);
        node.attributes[attr] = newY.toString();
    }

    #unwrapAttr(node: XastElement, attr: string): string {
        const value = node.attributes[attr];
        if (!value) {
            throw Ensure.unexpectedObject(
                `Invalid <${node.name} ${attr}> attribute - empty string specified for attribute`,
                node,
            );
        }
        return value;
    }

    #unwrapNumberAttr(node: XastElement, attr: string): number {
        const str = this.#unwrapAttr(node, attr);
        const num = Number(str);
        if (!isFinite(num)) {
            throw Ensure.unexpectedObject(
                `Invalid <${node.name} ${attr}="${str}"> attribute - invalid number`,
                node,
            );
        }
        return num;
    }

    /** @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/defs */
    #defs(node: XastElement) {
        for (const attr in node.attributes) {
            this.#unhandledAttribute(node, attr);
        }
        this.#ensureNoChildren(node);
    }

    /** @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/g */
    #g(node: XastElement) {
        for (const attr in node.attributes) {
            this.#unhandledAttribute(node, attr);
        }
        this.#handleChildren(node);
    }

    /** @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#path */
    #path(node: XastElement) {
        for (const attr in node.attributes) {
            if (attr === 'd') {
                if (this.x !== 0 || this.y !== 0) {
                    node.attributes.d = new SVGPathData(node.attributes.d!)
                        .toAbs()
                        .translate(this.x, this.y)
                        .round(1e14)
                        .encode();
                }
            } else {
                this.#unhandledAttribute(node, attr);
            }
        }
        this.#ensureNoChildren(node);
    }

    /** @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#rectangle */
    #rect(node: XastElement) {
        for (const attr in node.attributes) {
            if (attr === 'x') {
                this.#translateX(node, attr);
            } else if (attr === 'y') {
                this.#translateY(node, attr);
            } else if (attr === 'width' || attr === 'height' || attr === 'rx' || attr === 'ry') {
                // can safely ignore these
            } else {
                this.#unhandledAttribute(node, attr);
            }
        }
        this.#ensureNoChildren(node);
    }

    /** @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#line */
    #line(node: XastElement) {
        for (const attr in node.attributes) {
            if (attr === 'x1' || attr === 'x2') {
                this.#translateX(node, attr);
            } else if (attr === 'y1' || attr === 'y2') {
                this.#translateY(node, attr);
            } else {
                this.#unhandledAttribute(node, attr);
            }
        }
        this.#ensureNoChildren(node);
    }

    /** @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#polyline */
    #polyline(node: XastElement) {
        // <polyline> should have been converted into <path> node
        this.#bailIfAnotherPluginMustRunFirst('convertShapeToPath', node);
    }

    /** @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#polygon */
    #polygon(node: XastElement) {
        // <polygon> should have been converted into <path> node
        this.#bailIfAnotherPluginMustRunFirst('convertShapeToPath', node);
    }

    #bailIfAnotherPluginMustRunFirst(pluginName: string, node: XastElement) {
        if (this.multipassCount === 0) {
            throw SvgTranslateError.silentRollback(`This plugin will run again on the next pass.`);
        } else {
            const err =
                `Couldn't process the node as SVGO’s internal plugin "${pluginName}" had to preprocess it first:\n` +
                `  ${stringifyTree(node).slice(0, 120)}\n` +
                `You need to make sure the plugin is enabled in the SVGO configuration file.\n` +
                `Read more: https://svgo.dev/docs/plugins/${pluginName}/`;
            throw Ensure.unexpectedObject(err, node);
        }
    }

    #circle(node: XastElement) {
        // https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#circle
        for (const attr in node.attributes) {
            if (attr === 'cx') {
                this.#translateX(node, attr);
            } else if (attr === 'cy') {
                this.#translateY(node, attr);
            } else if (attr === 'r') {
                // can safely ignore these
            } else {
                this.#unhandledAttribute(node, attr);
            }
        }
        this.#ensureNoChildren(node);
    }

    #ellipse(node: XastElement) {
        // https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Basic_Shapes#ellipse
        for (const attr in node.attributes) {
            if (attr === 'cx') {
                this.#translateX(node, attr);
            } else if (attr === 'cy') {
                this.#translateY(node, attr);
            } else if (attr === 'rx' || attr === 'ry') {
                // can safely ignore these
            } else {
                this.#unhandledAttribute(node, attr);
            }
        }
        this.#ensureNoChildren(node);
    }
}
