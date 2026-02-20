import { getVisiblePixelBounds } from './ImageUtils';

test('getBounds returns no-op bounds for viewBox-derived width/height = 0', () => {
    const svg = `
        <svg viewBox="0 0 0 0" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="4" height="4" fill="#000"/>
        </svg>`;

    // Matches call-site semantics: getBounds(svg, vb.width, vb.height)
    expect(getVisiblePixelBounds(svg, { x: 0, y: 0, width: 0, height: 0 })).toEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    });
});

test('getBounds returns no-op bounds for width-derived width=0 when viewBox is missing', () => {
    const svg = `
        <svg width="0" height="10" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="1" height="1" fill="#000"/>
        </svg>`;

    // Matches call-site semantics: vb.width/vb.height derived from width/height attrs.
    expect(getVisiblePixelBounds(svg, { x: 0, y: 0, width: 0, height: 10 })).toEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    });
});

test('returns 2x2 bounds for a centered 2px rectangle in 0 0 10 10 viewBox', () => {
    const svg = `
        <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="2" height="2" fill="#000"/>
        </svg>`;

    expect(getVisiblePixelBounds(svg, { x: 0, y: 0, width: 10, height: 10 })).toEqual({
        x: 4,
        y: 4,
        width: 2,
        height: 2,
    });
});

test('ignores 2px border path outside deep viewBox and keeps centered 2x2 bounds', () => {
    const svg = `
        <svg viewBox="2 2 6 6" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0H10V10H0Z" fill="none" stroke="#000" stroke-width="1"/>
            <rect x="4" y="4" width="2" height="2" fill="#000"/>
        </svg>`;

    expect(getVisiblePixelBounds(svg, { x: 2, y: 2, width: 6, height: 6 })).toEqual({
        x: 4,
        y: 4,
        width: 2,
        height: 2,
    });
});

test('does not clip last visible row when viewBox origin is negative', () => {
    const svg = `
        <svg viewBox="-1 -2 32 32" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="26" height="25" fill="#000"/>
        </svg>`;

    expect(getVisiblePixelBounds(svg, { x: -1, y: -2, width: 32, height: 32 })).toEqual({
        x: 3,
        y: 4,
        width: 26,
        height: 25,
    });
});
