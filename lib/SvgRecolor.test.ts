import SvgRecolor from './SvgRecolor';
import SvgTranslateError from './SvgTranslateError';
import { parseIntoTree, stringifyTree } from './SvgUtils';

function recolor(
    setColor: string,
    svg: string,
    setColorIssue?: 'fail' | 'warn' | 'ignore' | 'rollback',
) {
    const ast = parseIntoTree(svg);
    new SvgRecolor(setColor, setColorIssue).recolor(ast);
    return stringifyTree(ast);
}

test('recolors known color attributes', () => {
    const actual = recolor(
        'currentColor',
        '<svg color="black" fill="black"><path stroke="black" fill="none"/></svg>',
        'fail',
    );
    expect(actual).toEqual(
        '<svg fill="currentColor"><path stroke="currentColor" fill="none"/></svg>',
    );
});

test('sets root fill when no color attributes were present', () => {
    const actual = recolor('currentColor', '<svg><g><path d="M0 0L1 1"/></g></svg>', 'fail');
    expect(actual).toEqual('<svg fill="currentColor"><g><path d="M0 0L1 1"/></g></svg>');
});

test('fails on mixed colors when setColorIssue=fail', () => {
    expect(() =>
        recolor('currentColor', '<svg><path fill="black"/><path stroke="red"/></svg>', 'fail'),
    ).toThrow(SvgTranslateError);
});

test('converts mixed colors when setColorIssue=ignore', () => {
    const actual = recolor(
        'currentColor',
        '<svg><path fill="black"/><path stroke="red"/></svg>',
        'ignore',
    );
    expect(actual).toEqual('<svg><path fill="currentColor"/><path stroke="currentColor"/></svg>');
});
