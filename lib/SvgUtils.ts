import { type CustomPlugin, optimize, type XastParent, type XastRoot } from 'svgo';

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
export function stringifyTree(ast: XastParent): string {
    const astCopy = structuredClone(ast);
    const injectAstPlugin: CustomPlugin = {
        name: 'inject-ast',
        fn: (root) => {
            root.children = astCopy.children;
        },
    };
    return optimize('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        multipass: false,
        plugins: [injectAstPlugin],
    }).data;
}
