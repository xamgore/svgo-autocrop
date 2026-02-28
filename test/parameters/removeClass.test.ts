import { findNodes, runPlugin, runPluginOverMultipleNodes } from '../utils.ts';

it('removes class attributes', () => {
    const svg = runPlugin(
        `
        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" class="root-level">
          <circle cx="4" cy="4" r="2" class="node-level"/>
        </svg>`,
        {
            removeClass: true,
        },
    );
    expect(findNodes(svg, '[class]')).toHaveLength(0);
});

it('removes class attributes at each SVG', () => {
    const ast = runPluginOverMultipleNodes(
        `
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" class="root-1">
            <rect x="5" y="5" width="10" height="10" class="shape-1"/>
        </svg>
        <svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" class="root-2">
            <rect x="8" y="9" width="12" height="11" class="shape-2"/>
        </svg>`,
        {
            removeClass: true,
        },
    );
    expect(findNodes(ast, '[class]')).toHaveLength(0);
});
