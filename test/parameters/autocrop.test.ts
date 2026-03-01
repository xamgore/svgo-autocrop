import { stringifyTree } from '../../lib/SvgUtils.ts';
import { runPlugin, runPluginOverMultipleNodes } from '../utils.ts';

it(`crops an SVG with no visible content to 1×1 size`, () => {
    const svg = runPlugin(
        `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect x="0" y="0" width="20" height="20" fill="none"/>
        </svg>`,
    );
    expect(svg.attributes.viewBox).toEqual('0 0 1 1');
});

it('crops each SVG at the same source individually', () => {
    const ast = runPluginOverMultipleNodes(
        `
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" class="root-1">
            <rect x="5" y="5" width="10" height="10"/>
        </svg>
        <svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" class="root-2">
            <rect x="8" y="9" width="12" height="11"/>
        </svg>`,
    );
    expect(stringifyTree(ast)).toMatchSnapshot();
});

it('crops an SVG with a path', () => {
    const svg = runPlugin(
        `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -24 48 48">
            <path d="M0 0h24v24H0z"/>
        </svg>`,
        { disableTranslate: true },
    );
    expect(stringifyTree(svg)).toMatchSnapshot();
});

it('satisfies idempotence', () => {
    const input = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>`;
    const first = runPlugin(input, { autocrop: true });
    const second = runPlugin(stringifyTree(first), { autocrop: true });
    expect(second).toEqual(first);
});

// oxlint-disable-next-line jest/no-disabled-tests todo: for the best time.
it.skip('produces fractional viewBox size', () => {
    const svg = runPlugin(
        `
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.25" y="2.5" width="0.5" height="0.5"/>
        </svg>`,
        {
            autocrop: true,
            disableTranslate: true,
        },
    );

    expect(svg.attributes.viewBox).toEqual('1.25 2.5 0.5 0.5');
});

it('keeps the viewBox fractional when transformations are disabled', () => {
    const svg = runPlugin(
        `
        <svg viewBox="0.5 1.25 20.75 30.5" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="2" width="3" height="4"/>
        </svg>`,
        {
            autocrop: false,
            disableTranslate: true,
        },
    );

    expect(svg.attributes.viewBox).toEqual('0.5 1.25 20.75 30.5');
});
