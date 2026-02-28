import autocrop from '@strebz/svgo-autocrop';

/**
 * The below configuration is for monotone (i.e. single color) svgs. Any colour will be replaced with 'currentColor' so the color is inherited from the html/css.
 *
 * If your svgs contain multiple colours, then remove the 'setColor'/'setColorIssue' attributes.
 */

const config = {
    multipass: true, // keep running optimizations until they optimize.
    plugins: [
        {
            // https://svgo.dev/docs/preset-default/
            name: 'preset-default',
            params: {
                overrides: {
                    convertPathData: { floatPrecision: 6 }, // keeps complex self-intersecting paths visually stable
                    inlineStyles: { onlyMatchedOnce: false }, // inlines CSS defined by class attributes.
                    removeUnknownsAndDefaults: {
                        keepDataAttrs: false,
                    },
                },
            },
        },
        'removeDimensions',
        'removeScripts',
        'convertStyleToAttrs',
        'convertShapeToPath',
        { name: 'removeDeprecatedAttrs', params: { removeAny: true } },
        {
            ...autocrop,
            params: {
                autocrop: true,
                includeWidthAndHeightAttributes: false,
                removeClass: true,
                removeStyle: true,
                removeDeprecated: true,
                setColor: undefined,
                setColorIssue: 'warn',
            },
        },
    ],
};

/** Example SVGO configuration that wires in this plugin. */
export default config;
