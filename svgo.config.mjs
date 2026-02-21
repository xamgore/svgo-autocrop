import autocrop from 'svgo-autocrop';

/**
 * The below configuration is for monotone (i.e. single color) svgs. Any colour will be replaced with 'currentColor' so the color is inherited from the html/css.
 *
 * If your svgs contain multiple colours, then remove the 'setColor'/'setColorIssue' attributes.
 */

const config = {
    // Keep running optimizations until doesn't optimize anymore.
    multipass: true,
    plugins: [
        // Use SVGO's standard baseline optimization set.
        // https://svgo.dev/docs/preset-default/
        'preset-default',

        // Removes the width and height attribute from the top-most <svg> element if specified, and replaces it with the viewBox attribute if it's missing.
        // https://svgo.dev/docs/plugins/removeDimensions/
        'removeDimensions',

        {
            name: 'removeUnknownsAndDefaults',
            params: {
                keepDataAttrs: true,
            },
        },

        // Removes deprecated attributes from elements in the document.
        // https://svgo.dev/docs/plugins/removeDeprecatedAttrs/
        {
            name: 'removeDeprecatedAttrs',
            params: {
                removeAny: true,
            },
        },

        {
            ...autocrop,
            params: {
                autocrop: true,
                includeWidthAndHeightAttributes: false,
                removeClass: true,
                removeStyle: true,
                removeDeprecated: true,
                setColor: 'currentColor',
                setColorIssue: 'rollback',
            },
        },

        // Keep styles consistent
        // https://svgo.dev/docs/plugins/convertStyleToAttrs/
        'convertStyleToAttrs',

        // Remove <style> if present in svg
        // https://svgo.dev/docs/plugins/removeStyleElement/
        'removeStyleElement',

        // Remove <script> if present in svg
        // https://svgo.dev/docs/plugins/removeScripts/
        'removeScripts',
    ],
};

/** Example SVGO configuration that wires in this plugin. */
export default config;
