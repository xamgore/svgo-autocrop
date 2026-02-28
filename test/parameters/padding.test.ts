import { runPlugin } from '../utils.ts';

it(`doesn't apply padding when cropping is off`, () => {
    const svg = runPlugin(
        `
            <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="20" height="20"/>
            </svg>`,
        {
            autocrop: false,
            padding: 2,
        },
    );
    expect(svg.attributes.viewBox).toBe('0 0 20 20');
});

type MatrixCase = {
    translate: boolean;
    expectedViewBox: string;
};

it.each([
    {
        translate: true,
        expectedViewBox: '0 0 12 12',
    },
    {
        translate: false,
        expectedViewBox: '4 4 12 12',
    },
] as MatrixCase[])(
    'applies padding with translate=$translate',
    ({ translate, expectedViewBox }) => {
        const svg = runPlugin(
            `
                <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="5" width="10" height="10"/>
                </svg>`,
            {
                disableTranslate: !translate,
                padding: 1,
            },
        );

        expect(svg.attributes.viewBox).toBe(expectedViewBox);
    },
);

it('expands cropped bounds by the padding constant', () => {
    const actual = runPlugin(
        `
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="20" height="20"/>
        </svg>`,
        {
            autocrop: true,
            padding: 2,
        },
    );
    expect(actual.attributes.viewBox).toEqual('0 0 24 24');
});

it('applies per-side padding offsets', () => {
    const actual = runPlugin(
        `
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="20" height="20"/>
        </svg>`,
        {
            autocrop: true,
            padding: {
                top: 1,
                left: 2,
                bottom: 3,
                right: 4,
            },
        },
    );
    expect(actual.attributes.viewBox).toEqual('0 0 26 24');
});

it('executes the "padding" function over context data', () => {
    const actual = runPlugin(
        `
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="20" height="20"/>
        </svg>`,
        {
            autocrop: true,
            disableTranslate: true,
            padding: (newVb, _) => {
                newVb.x = 4;
                newVb.width = 4;
            },
        },
    );
    expect(actual.attributes.viewBox).toEqual('4 0 4 20');
});
