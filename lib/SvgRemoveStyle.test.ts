import SvgRemoveStyle from './SvgRemoveStyle';
import { parseIntoTree, stringifyTree } from './SvgUtils';

function removeStyle(svg: string): string {
    const ast = parseIntoTree(svg);
    new SvgRemoveStyle().remove(ast);
    return stringifyTree(ast);
}

test('removes style and font-family attributes', () => {
    const actual = removeStyle(
        '<svg style="display:block" font-family="Arial"><g style="opacity:1"><path font-family="Verdana" /></g></svg>',
    );
    expect(actual).toEqual('<svg><g><path/></g></svg>');
});

test('removes overflow="visible" but keeps non-default overflow values', () => {
    const actual = removeStyle(
        '<svg overflow="visible"><g overflow="hidden"/><path overflow="visible"/></svg>',
    );
    expect(actual).toEqual('<svg><g overflow="hidden"/><path/></svg>');
});
