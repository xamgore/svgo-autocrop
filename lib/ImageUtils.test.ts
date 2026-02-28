import { Resvg } from '@resvg/resvg-js';

import { resolveViewBoxForAutocrop, ViewBox } from './AutocropUtils.ts';
import {
    deriveViewBoxFromDimensions,
    getVisiblePixelBounds,
    parseViewBoxAttr,
} from './ImageUtils.ts';

function stringifyViewBox(vb: ViewBox): string {
    return `${vb.x} ${vb.y} ${vb.width} ${vb.height}`;
}

// todo: some of these tests should moved to autocrop.test.ts

describe('deriveViewBoxFromDimensions', () => {
    test('parses finite width and height as the fallback viewBox', () => {
        expect(deriveViewBoxFromDimensions({ width: '24', height: '12' })).toEqual({
            x: 0,
            y: 0,
            width: 24,
            height: 12,
        });
    });

    test('converts missing or invalid dimensions to zero', () => {
        expect(deriveViewBoxFromDimensions({ width: 'NaN' })).toEqual({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        });

        expect(deriveViewBoxFromDimensions({ width: 'Infinity', height: '8' })).toEqual({
            x: 0,
            y: 0,
            width: 0,
            height: 8,
        });
    });
});

describe('parseViewBoxAttr', () => {
    test('parses viewBox values separated by spaces and commas', () => {
        expect(parseViewBoxAttr(' 1, 2  3,4 ')).toEqual({
            x: 1,
            y: 2,
            width: 3,
            height: 4,
        });
    });

    test('coerces non-finite parts to zero so caller can normalize dimensions', () => {
        expect(parseViewBoxAttr('2 3 Infinity nope')).toEqual({
            x: 2,
            y: 3,
            width: 0,
            height: 0,
        });
    });

    test('throws when viewBox does not provide exactly 4 parts', () => {
        expect(() => parseViewBoxAttr('0 0 24')).toThrow(
            '[/svg/@viewBox] Invalid attribute. Expected viewBox to specify 4 parts, got "0 0 24".',
        );
    });
});

describe('viewBox resolution for autocrop flow', () => {
    test('prefers explicit viewBox over width and height attributes', () => {
        expect(
            resolveViewBoxForAutocrop({
                viewBox: '1 2 30 40',
                width: '300',
                height: '400',
            }),
        ).toEqual({
            x: 1,
            y: 2,
            width: 30,
            height: 40,
        });
    });

    test('derives from width and height when viewBox is missing', () => {
        expect(resolveViewBoxForAutocrop({ width: '30', height: '40' })).toEqual({
            x: 0,
            y: 0,
            width: 30,
            height: 40,
        });
    });

    test.each([
        {
            title: 'viewBox width is negative',
            attributes: { viewBox: '0 0 -1 20' } as Record<string, string>,
        },
        {
            title: 'fallback dimensions include zero width',
            attributes: { width: '0', height: '20' },
        },
    ])('normalizes to 0x0 when $title', ({ attributes }) => {
        expect(resolveViewBoxForAutocrop(attributes)).toEqual({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        });
    });
});

function measureVisibleBoundsFromSource(
    sourceAttributes: Record<string, string>,
    body: string,
): { sourceViewBox: ViewBox; pixelBounds: ViewBox } {
    const sourceViewBox = resolveViewBoxForAutocrop(sourceAttributes);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${stringifyViewBox(sourceViewBox)}">${body}</svg>`;

    return {
        sourceViewBox,
        pixelBounds: getVisiblePixelBounds(svg, sourceViewBox),
    };
}

describe('getVisiblePixelBounds', () => {
    test('finds real pixel bounds inside the resolved source viewBox', () => {
        const { pixelBounds } = measureVisibleBoundsFromSource(
            { viewBox: '0 0 10 10' },
            '<rect x="4" y="4" width="2" height="2"/>',
        );

        expect(pixelBounds).toEqual({
            x: 4,
            y: 4,
            width: 2,
            height: 2,
        });
    });

    test('clips content outside the source viewBox before scanning visible pixels', () => {
        const { pixelBounds } = measureVisibleBoundsFromSource(
            { viewBox: '2 2 6 6' },
            '<path d="M0 0H10V10H0Z" fill="none" stroke="#000" stroke-width="1"/><rect x="4" y="4" width="2" height="2"/>',
        );

        expect(pixelBounds).toEqual({
            x: 4,
            y: 4,
            width: 2,
            height: 2,
        });
    });

    test('preserves negative viewBox origin in the reported bounds', () => {
        const { pixelBounds } = measureVisibleBoundsFromSource(
            { viewBox: '-1 -2 32 32' },
            '<rect x="3" y="4" width="26" height="25"/>',
        );

        expect(pixelBounds).toEqual({
            x: 3,
            y: 4,
            width: 26,
            height: 25,
        });
    });

    test('recomputes bounds from pixels when fallback dimensions resolve to 0x0', () => {
        const { sourceViewBox, pixelBounds } = measureVisibleBoundsFromSource(
            { width: '0', height: '10' },
            '<rect x="0" y="0" width="1" height="1"/>',
        );

        expect(sourceViewBox).toEqual({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        });
        expect(pixelBounds).toEqual({
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        });
    });

    test('fractional geometric bbox can still rasterize to full 20x20 pixel coverage', () => {
        const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20"><path fill="currentColor" d="m1.515 13.81 7.393 1.978q-.014.788.046 1.575l4.616 1.235a9.3 9.3 0 0 1-4.329.67l-.14-.012-.033-.003-.065-.007-.073-.008-.122-.015-.083-.011-.085-.013-.248-.04-.033-.005-.058-.01-.083-.016-.054-.012-.072-.014-.058-.013-.074-.015-.075-.018-.073-.017-.053-.013-.068-.017-.07-.019-.073-.02-.064-.017-.084-.023-.048-.016-.065-.02-.072-.021-.082-.026-.045-.015-.062-.02-.07-.024-.05-.019-.035-.011-.052-.02-.079-.029-.044-.017-.062-.023-.067-.027-.068-.027-.062-.025-.073-.03-.05-.023-.048-.02-.032-.014-.05-.024-.08-.036-.041-.019-.074-.035-.048-.024-.066-.03-.066-.035-.072-.036-.04-.021-.08-.043-.045-.023-.045-.025-.035-.02-.073-.041-.047-.026-.04-.024-.055-.031-.063-.04-.072-.043-.04-.024-.066-.041-.047-.03-.061-.04-.055-.036-.04-.027-.043-.028-.034-.023-.034-.023-.03-.022-.045-.031-.059-.042-.053-.039-.058-.041-.043-.033-.059-.044-.059-.046-.066-.052-.035-.027-.05-.04-.057-.047-.07-.056-.035-.03-.036-.03-.033-.03-.035-.03-.047-.041-.054-.049-.053-.046-.048-.045-.052-.048-.041-.039-.068-.065-.077-.075-.022-.022-.032-.032-.054-.055-.038-.04-.04-.04-.13-.139-.061-.068-.048-.054-.055-.062-.033-.038-.041-.048-.045-.053-.036-.043-.02-.026-.036-.043-.05-.063-.032-.04-.04-.05-.015-.02a9.3 9.3 0 0 1-1.116-1.861m-.79-4.49 8.798 2.353a16 16 0 0 0-.363 1.559l8.383 2.243a9.4 9.4 0 0 1-1.43 1.553L1.21 13.04l-.012-.035-.027-.08-.04-.12-.005-.017a9 9 0 0 1-.16-.575l-.023-.097-.014-.062-.016-.075-.014-.063-.014-.07-.013-.065-.014-.073q-.031-.165-.055-.33l-.014-.091-.008-.065-.01-.079-.015-.125-.004-.036A9.4 9.4 0 0 1 .726 9.32M1.96 5.328l9.26 2.477q-.428.705-.783 1.453L19.19 11.6a9.2 9.2 0 0 1-.518 1.833l-8.951-2.394L.796 8.652l.012-.078.006-.038.008-.052.011-.067.014-.076a9 9 0 0 1 .068-.343l.022-.096.016-.066.018-.075q.025-.105.055-.208l.021-.079.018-.064.023-.077.02-.064.023-.074.02-.064.024-.074a9.2 9.2 0 0 1 .783-1.73zm3.443-3.41 8.746 2.34q-.694.628-1.308 1.333l6.062 1.622c.207.66.343 1.352.398 2.066L2.332 4.74l.035-.05.021-.031.03-.043.037-.05.042-.06.042-.055.05-.067.038-.05.045-.057.042-.054.047-.057.042-.054.05-.06.043-.05.05-.06.042-.047.056-.063.04-.047.053-.057.041-.045.057-.06.045-.047.049-.052.13-.132.078-.076.045-.043.06-.055a9.4 9.4 0 0 1 1.76-1.3M10.013.7h.139l.053.002.042.001.053.002h.036l.059.003.036.001.046.003.042.001.068.004.081.006.112.008.068.006.034.003.06.006.063.006.037.004.079.01.038.004.084.01.063.008.032.005.05.008.161.025.055.009.05.008.108.02.072.015.085.017.035.007.059.013.031.008.048.01.033.007.05.012.038.01.055.012.075.02.087.022.087.024.088.024.038.012.055.015.06.02.057.017.039.012.038.013.06.02.076.025.079.028.037.013.05.018.072.026.085.032.09.035.077.03.037.016.046.019.032.014.049.02.031.014.044.02.085.036.078.036.057.027.058.028.047.022.071.035.07.035.08.04.04.022.039.02.035.019.047.026.032.017.04.022.068.039.082.046.068.04.044.026.041.025.075.046.068.042.076.048.027.019.05.032.065.043.031.021.048.033.048.033.018.013.125.088.064.047.05.037.044.033.067.05.063.05.031.024.039.031.067.054.06.05.067.055a9.4 9.4 0 0 1 1.48 1.574L6.296 1.47l.048-.02.05-.022.063-.027.067-.027q.131-.053.264-.101l.075-.027.072-.026L7 1.197l.074-.024q.103-.035.205-.066l.07-.021.067-.02.079-.023.066-.017.077-.02.067-.02.07-.017.07-.017.074-.017.07-.016.076-.016.07-.015.074-.014L8.28.86l.077-.014.071-.013.076-.013.071-.01.075-.012.072-.01.079-.01.07-.01.082-.009.07-.008.08-.007.218-.02.082-.005.07-.004.085-.005.072-.003.078-.003.075-.002.076-.001z"/></svg>
    `;
        const viewBox = parseViewBoxAttr('0 0 20 20');
        const bbox = new Resvg(svg).getBBox() as ViewBox;
        const pixelBounds = getVisiblePixelBounds(svg, viewBox);

        expect(bbox.x).toBeGreaterThan(0);
        expect(bbox.y).toBeGreaterThan(0);
        expect(bbox.x + bbox.width).toBeLessThan(20);
        expect(bbox.y + bbox.height).toBeLessThan(20);

        expect(pixelBounds).toEqual({
            x: 0,
            y: 0,
            width: 20,
            height: 20,
        });
    });

    test('blur can make visual pixel bounds wider than geometric getBBox', () => {
        const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <defs>
            <filter id="b" x="-100%" y="-100%" width="300%" height="300%" filterUnits="objectBoundingBox">
                <feGaussianBlur stdDeviation="2"/>
            </filter>
        </defs>
        <rect x="6" y="6" width="8" height="8" fill="#000" filter="url(#b)"/>
    </svg>
    `;
        const viewBox = parseViewBoxAttr('0 0 20 20');
        const geomBbox = new Resvg(svg).getBBox() as ViewBox;
        const pixelBbox = getVisiblePixelBounds(svg, viewBox);

        expect(pixelBbox.x).toBeLessThan(geomBbox.x);
        expect(pixelBbox.y).toBeLessThan(geomBbox.y);
        expect(pixelBbox.x + pixelBbox.width).toBeGreaterThan(geomBbox.x + geomBbox.width);
        expect(pixelBbox.y + pixelBbox.height).toBeGreaterThan(geomBbox.y + geomBbox.height);
    });

    test('mask can make visual pixel bounds smaller than geometric getBBox', () => {
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <defs>
                <mask id="m">
                    <rect x="7" y="7" width="6" height="6" fill="#fff"/>
                </mask>
            </defs>
            <rect x="2" y="2" width="16" height="16" fill="#000" mask="url(#m)"/>
        </svg>
    `;
        const viewBox = parseViewBoxAttr('0 0 20 20');
        const bbox = new Resvg(svg).getBBox() as ViewBox;
        const pixelBounds = getVisiblePixelBounds(svg, viewBox);

        expect(pixelBounds.x).toBeGreaterThan(bbox.x);
        expect(pixelBounds.y).toBeGreaterThan(bbox.y);
        expect(pixelBounds.width).toBeLessThan(bbox.width);
        expect(pixelBounds.height).toBeLessThan(bbox.height);
    });
});
