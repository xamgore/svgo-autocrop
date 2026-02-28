import {
    CustomPlugin,
    optimize,
    querySelector,
    querySelectorAll,
    type XastElement,
    XastRoot,
} from 'svgo';
import autocrop, { CropParams } from 'svgo-autocrop';

import { parseIntoTree } from '../lib/SvgUtils.ts';

export function findNode(node: XastElement | XastRoot, selector: string): XastElement | null {
    const result = querySelector(node, selector);
    return result?.type === 'element' ? result : null;
}

export function findNodes(node: XastElement | XastRoot, selector: string): XastElement[] {
    const results = querySelectorAll(node, selector);
    return results.filter((it): it is XastElement => it.type === 'element');
}

export function runPlugin(input: string, params: CropParams = {}): XastElement {
    const plugin: CustomPlugin<CropParams> = {
        ...autocrop,
        params,
    };
    const result = optimize(input, {
        plugins: [plugin],
    });

    const ast = parseIntoTree(result.data);
    const svg = ast.children.find(
        (node): node is XastElement => node.type === 'element' && node.name === 'svg',
    );
    if (!svg) {
        throw new Error('Expected output to contain a root <svg> element.');
    }
    return svg;
}

export function runPluginOverMultipleNodes(input: string, params: CropParams = {}): XastRoot {
    const plugin: CustomPlugin<CropParams> = {
        ...autocrop,
        params,
    };
    const result = optimize(input, {
        plugins: [plugin],
    });

    const ast = parseIntoTree(result.data);
    const svg = ast.children.find(
        (node): node is XastElement => node.type === 'element' && node.name === 'svg',
    );
    if (!svg) {
        throw new Error('Expected output to contain a root <svg> element.');
    }
    return ast;
}
