'use strict';

import { runPlugin } from './utils.ts';

test('prefers root viewBox over root width and height when all are present', () => {
    const svg = runPlugin(
        `<svg viewBox="0 0 20 20" width="99" height="99" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="20"/></svg>`,
        {
            autocrop: false,
        },
    );

    expect(svg.attributes.viewBox).toBe('0 0 20 20');
});

test('preserves floating viewBox coordinates', () => {
    const svg = runPlugin(
        `<svg viewBox="0.5 1.25 20.75 30.5" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="1.25" width="20.75" height="30.5"/></svg>`,
        {
            autocrop: false,
            disableTranslate: true,
        },
    );

    expect(svg.attributes.viewBox).toBe('0.5 1.25 20.75 30.5');
});

test('autocrop keeps top content when source viewBox size is fractional', () => {
    const svg = runPlugin(
        `<svg viewBox="-7.5 153.5 507.5 191" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="160" width="10" height="10"/><rect x="10" y="330" width="10" height="10"/></svg>`,
        {
            autocrop: true,
            disableTranslate: true,
        },
    );

    const [x, y, width, height] = svg.attributes.viewBox!.split(/\s+/).map(Number);
    expect(x).toBeLessThanOrEqual(10);
    expect(y).toBeLessThan(200);
    expect(width).toBeGreaterThan(0);
    expect(y! + height!).toBeGreaterThanOrEqual(340);
});

test('derives viewBox from root width and height when viewBox is missing', () => {
    const svg = runPlugin(
        `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="20"/></svg>`,
        {
            autocrop: false,
        },
    );

    expect(svg.attributes.viewBox).toBe('0 0 20 20');
});

test('derives zero viewBox when both viewBox and root dimensions are missing', () => {
    const svg = runPlugin(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="20"/></svg>`,
        {
            autocrop: false,
        },
    );

    expect(svg.attributes.viewBox).toBe('0 0 0 0');
});

test("doesn't recompute viewBox from rendered geometry even when the input viewBox has zero size", () => {
    const svg = runPlugin(
        `<svg viewBox="0 0 0 0" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="20"/></svg>`,
        {
            autocrop: false,
        },
    );

    expect(svg.attributes.viewBox).toBe('0 0 0 0');
});

test('normalizes negative viewBox width to 0x0 viewBox', () => {
    const svg = runPlugin(
        `<svg viewBox="0 0 -1 20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="20"/></svg>`,
        {
            autocrop: false,
        },
    );

    expect(svg.attributes.viewBox).toBe('0 0 0 0');
});
