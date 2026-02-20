import type { XastChild, XastElement, XastNode, XastParent } from 'svgo';

declare module 'svgo' {
    export function querySelectorAll(
        node: XastParent,
        selector: string | ((node: XastElement) => boolean),
        parents?: Map<XastNode, XastParent>,
    ): XastChild[];
}
