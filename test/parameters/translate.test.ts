import { stringifyTree } from '../../lib/SvgUtils.ts';
import { findNode, runPlugin } from '../utils.ts';

it('translates coordinates', () => {
    const svg = runPlugin(
        `
        <svg viewBox="10 10 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="10" height="10"/>
        </svg>`,
        {
            autocrop: false,
            disableTranslateWarning: true,
        },
    );
    expect(svg.attributes.viewBox).toEqual('0 0 20 20');
    expect(findNode(svg, 'rect')!.attributes).toMatchObject({
        x: '0',
        y: '0',
        width: '10',
        height: '10',
    });
});

it('translates coordinates after cropping', () => {
    const svg = runPlugin(
        `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <path d="M2 2H26V26H2z"/>
        </svg>`,
    );
    expect(stringifyTree(svg)).toMatchSnapshot();
});

it('rollbacks coordinates when unknown attribute is met', () => {
    const svg = runPlugin(
        `
        <svg viewBox="10 10 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="10" height="10" unsupported="abc"/>
        </svg>`,
        {
            autocrop: false,
            disableTranslateWarning: true,
        },
    );
    expect(svg.attributes.viewBox).toEqual('10 10 20 20');
    expect(findNode(svg, 'rect')!.attributes).toMatchObject({
        x: '10',
        y: '10',
        width: '10',
        height: '10',
    });
});

it('cleans the SVG even when translate was rolled back', () => {
    const svg = runPlugin(
        `
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" class="root" version="1.1">
            <rect x="5" y="5" width="10" height="10" style="fill:#000" class="shape" unsupported="abc" />
        </svg>`,
        {
            removeClass: true,
            removeStyle: true,
            removeDeprecated: true,
        },
    );
    expect(stringifyTree(svg)).toMatchSnapshot();
});
