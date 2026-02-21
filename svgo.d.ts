import type { XastChild, XastElement, XastNode, XastParent } from 'svgo';

declare module 'svgo' {
    /** Returns all matching XAST nodes for a selector. */
    export function querySelectorAll(
        node: XastParent,
        selector: string | ((node: XastElement) => boolean),
        parents?: Map<XastNode, XastParent>,
    ): XastChild[];
}
