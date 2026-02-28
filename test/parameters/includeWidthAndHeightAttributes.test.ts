'use strict';

import { runPlugin } from '../utils.ts';

type MatrixCase = {
    name: string;
    includeWidthAndHeightAttributes?: boolean;
    dimensionsIn: boolean;
    dimensionsOut?: string;
};

describe('includeWidthAndHeightAttributes', () => {
    it.each([
        {
            name: 'adds root dimensions when parameter=true and input had none',
            includeWidthAndHeightAttributes: true,
            dimensionsIn: false,
            dimensionsOut: '20',
        },
        {
            name: 'does not add root dimensions when parameter=undefined and input had none',
            includeWidthAndHeightAttributes: undefined,
            dimensionsIn: false,
            dimensionsOut: undefined,
        },
        {
            name: 'keeps root dimensions absent when parameter=false and input had none',
            includeWidthAndHeightAttributes: false,
            dimensionsIn: false,
            dimensionsOut: undefined,
        },
        {
            name: 'keeps root dimensions when parameter=true and input had width+height',
            includeWidthAndHeightAttributes: true,
            dimensionsIn: true,
            dimensionsOut: '20',
        },
        {
            name: 'keeps root dimensions when parameter=undefined and input had width+height',
            includeWidthAndHeightAttributes: undefined,
            dimensionsIn: true,
            dimensionsOut: '20',
        },
        {
            name: 'removes root dimensions when parameter=false and input had width+height',
            includeWidthAndHeightAttributes: false,
            dimensionsIn: true,
            dimensionsOut: undefined,
        },
    ] as MatrixCase[])(
        '$name',
        ({ includeWidthAndHeightAttributes, dimensionsIn, dimensionsOut }) => {
            const input = `<svg ${dimensionsIn ? 'width="20" height="20"' : ''}
                            viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="20"/></svg>`;

            const svg = runPlugin(input, {
                autocrop: false,
                includeWidthAndHeightAttributes,
            });

            expect(svg.attributes.width).toBe(dimensionsOut);
            expect(svg.attributes.height).toBe(dimensionsOut);
        },
    );
});
