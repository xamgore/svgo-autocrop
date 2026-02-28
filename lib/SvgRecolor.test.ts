import { ControlFlowBreak } from './ControlFlowErrors';
import SvgRecolor from './SvgRecolor';
import { parseIntoTree, stringifyTree } from './SvgUtils';

function recolor(
    setColor: string,
    svg: string,
    setColorIssue?: 'fail' | 'warn' | 'ignore' | 'rollback',
) {
    const ast = parseIntoTree(svg);
    new SvgRecolor(setColor, setColorIssue).recolorTree(ast);
    return stringifyTree(ast);
}

test('recolors known color attributes on valid elements', () => {
    const actual = recolor(
        'currentColor',
        '<svg color="black" fill="black"><defs><linearGradient id="g"><stop offset="0" stop-color="black"/></linearGradient><filter id="f"><feFlood flood-color="black"/><feDiffuseLighting lighting-color="black"><feDistantLight azimuth="45" elevation="45"/></feDiffuseLighting></filter></defs><path stroke="black" fill="none" d=""/></svg>',
        'fail',
    );
    expect(actual).toEqual(
        '<svg fill="currentColor"><defs><linearGradient id="g"><stop offset="0" stop-color="currentColor"/></linearGradient><filter id="f"><feFlood flood-color="currentColor"/><feDiffuseLighting lighting-color="currentColor"><feDistantLight azimuth="45" elevation="45"/></feDiffuseLighting></filter></defs><path stroke="currentColor" fill="none" d=""/></svg>',
    );
});

test('sets root fill when no color attributes were present', () => {
    const actual = recolor('currentColor', '<svg><g><path d="M0 0L1 1"/></g></svg>', 'fail');
    expect(actual).toEqual('<svg fill="currentColor"><g><path d="M0 0L1 1"/></g></svg>');
});

test('fails on mixed colors when setColorIssue=fail', () => {
    expect(() =>
        recolor(
            'currentColor',
            '<svg><path fill="black" d=""/><path stroke="red" d=""/></svg>',
            'fail',
        ),
    ).toThrow(ControlFlowBreak);
});

test('unifies mixed colors when setColorIssue=ignore', () => {
    const actual = recolor(
        'currentColor',
        '<svg><path fill="black" d=""/><path stroke="red" d=""/></svg>',
        'ignore',
    );
    expect(actual).toEqual(
        '<svg><path fill="currentColor" d=""/><path stroke="currentColor" d=""/></svg>',
    );
});
