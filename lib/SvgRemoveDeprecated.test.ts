import { optimize } from 'svgo';

import SvgRemoveDeprecated from './SvgRemoveDeprecated';
import { parseIntoTree, stringifyTree } from './SvgUtils';

function removeDeprecated(svg: string): string {
    const ast = parseIntoTree(svg);
    new SvgRemoveDeprecated().remove(ast);
    return stringifyTree(ast);
}

function optimizeWithPresetDefaultDeprecatedCleanup(svg: string): string {
    return optimize(svg, {
        plugins: [
            {
                name: 'preset-default',
                params: {
                    overrides: {
                        removeUnknownsAndDefaults: { keepDataAttrs: false },
                        removeDeprecatedAttrs: { removeUnsafe: true },
                    },
                },
            },
        ],
    }).data;
}

test('removes deprecated and sketch metadata attributes', () => {
    const actual = removeDeprecated(
        '<svg version="1.1" baseProfile="tiny" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns"><g sketch:type="MSPage" data-name="icon" enable-background="new" xml:space="preserve"><path/></g></svg>',
    );
    expect(actual).toEqual('<svg><g><path/></g></svg>');
});

test('keeps non-deprecated attributes unchanged', () => {
    const actual = removeDeprecated(
        '<svg xmlns="http://www.w3.org/2000/svg"><g id="a" data-test="x"><path fill="none"/></g></svg>',
    );
    expect(actual).toEqual(
        '<svg xmlns="http://www.w3.org/2000/svg"><g id="a" data-test="x"><path fill="none"/></g></svg>',
    );
});

describe('svgo preset-default deprecated cleanup', () => {
    test('removes deprecated/data attributes with configured overrides', () => {
        const actual = optimizeWithPresetDefaultDeprecatedCleanup(
            '<svg xmlns="http://www.w3.org/2000/svg" version="2.0" baseProfile="tiny" data-name="icon" enable-background="new" xml:space="preserve"><g data-name="layer" enable-background="new" xml:space="preserve"><path d="M0 0h10v10H0z"/></g></svg>',
        );

        expect(actual).not.toContain('version=');
        expect(actual).not.toContain('baseProfile=');
        expect(actual).not.toContain('data-name=');
        expect(actual).not.toContain('enable-background=');
        expect(actual).not.toContain('xml:space=');
    });

    test('removes sketch namespace declaration and sketch:* attributes', () => {
        const actual = optimizeWithPresetDefaultDeprecatedCleanup(
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns"><g sketch:type="MSPage"><path d="M0 0h10v10H0z"/></g></svg>',
        );

        expect(actual).not.toContain('xmlns:sketch=');
        expect(actual).not.toContain('sketch:type=');
    });
});
