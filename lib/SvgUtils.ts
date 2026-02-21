import {
    type CustomPlugin,
    optimize,
    querySelectorAll,
    type XastElement,
    type XastParent,
    type XastRoot,
} from 'svgo';

/**
 * Parse the SVG/XML string provided - and return the javascript in-memory representation.
 *
 * @param str SVG/XML string.
 * @param path Optional SVG path - only used if reporting error.
 */
export function parseIntoTree(str: string, path?: string): XastRoot {
    let ast: XastRoot | null = null;
    const captureAstPlugin: CustomPlugin = {
        name: 'capture-ast',
        fn: (root) => {
            ast = structuredClone(root);
        },
    };
    optimize(str, {
        path: path,
        multipass: false,
        plugins: [captureAstPlugin],
    });
    if (!ast) {
        throw new Error('Failed to parse SVG.');
    }
    return ast;
}

/**
 * Format the AST/Javascript in-memory representation back to the SVG/XML string.
 */
export function stringifyTree(node: XastParent): string {
    const nodeCopy = structuredClone(node);
    const injectAstPlugin: CustomPlugin = {
        name: 'inject-ast',
        fn: (root) => {
            // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
            root.children = node.type === 'element' ? [nodeCopy as XastElement] : node.children;
        },
    };
    return optimize('<svg></svg>', {
        multipass: false,
        plugins: [injectAstPlugin],
    }).data;
}

/**
 * Removes one or more attributes from all nodes matching the selector.
 */
export function removeAttributesBySelector(
    ast: XastRoot,
    selector: string,
    attributes: string[] | ((attr: string, value: string) => boolean),
) {
    const nodes = querySelectorAll(ast, selector);
    for (const node of nodes) {
        if (node.type !== 'element') continue;

        if (typeof attributes === 'function') {
            for (const [name, value] of Object.entries(node.attributes)) {
                if (attributes(name, value)) {
                    delete node.attributes[name];
                }
            }
        } else {
            for (const name of attributes) {
                delete node.attributes[name];
            }
        }
    }
}
