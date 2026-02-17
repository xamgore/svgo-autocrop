import { optimize } from 'svgo';

import SvgRemoveClass from './SvgRemoveClass';
import { parseIntoTree, stringifyTree } from './SvgUtils';

function removeClass(svg: string): string {
    const ast = parseIntoTree(svg);
    new SvgRemoveClass().remove(ast);
    return stringifyTree(ast);
}

test('removes class attributes from all elements', () => {
    const actual = removeClass(
        '<svg class="root"><g class="group"><path class="shape" d="M0 0L1 1"/></g></svg>',
    );
    expect(actual).toEqual('<svg><g><path d="M0 0L1 1"/></g></svg>');
});

test('keeps non-class attributes intact', () => {
    const actual = removeClass(
        '<svg data-name="icon"><path id="a" fill="none" class="tmp"/></svg>',
    );
    expect(actual).toEqual('<svg data-name="icon"><path id="a" fill="none"/></svg>');
});

describe('class handling vs removeUnknownsAndDefaults', () => {
    const input =
        '<svg class="root"><rect class="shape" width="1" height="1"/><view class="view-only"/></svg>';

    test('removeUnknownsAndDefaults keeps class on known elements only', () => {
        const optimizedByUnknownsAndDefaults = optimize(input, {
            plugins: [{ name: 'removeUnknownsAndDefaults' }],
        }).data;

        expect(optimizedByUnknownsAndDefaults).toContain('class="root"');
        expect(optimizedByUnknownsAndDefaults).toContain('class="shape"');
        expect(optimizedByUnknownsAndDefaults).not.toContain('class="view-only"');
    });

    test('SvgRemoveClass removes class attributes from all elements', () => {
        const optimizedBySvgRemoveClass = removeClass(input);
        expect(optimizedBySvgRemoveClass).toEqual('<svg><rect width="1" height="1"/><view/></svg>');
    });
});
