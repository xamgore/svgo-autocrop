import type { Config } from 'svgo';

import autocrop, { type CropParams } from 'svgo-autocrop';

/**
 * The below configuration is for monotone (i.e. single color) svgs. Any colour will be replaced with 'currentColor' so the color is inherited from the html/css.
 *
 * If your svgs contain multiple colours, then remove the 'setColor'/'setColorIssue' attributes.
 */

const config: Config = {
    // Keep running optimizations until doesn't optimize anymore.
    multipass: true,
    plugins: [
        // Removes the width and height attribute from the top-most <svg> element if specified, and replaces it with the viewBox attribute if it's missing.
        // https://svgo.dev/docs/plugins/removeDimensions/
        'removeDimensions',

        // Sort attributes - helps with readability/compression.
        // https://svgo.dev/docs/plugins/sortAttrs/
        'sortAttrs',

        // Keep styles consistent
        // https://svgo.dev/docs/plugins/convertStyleToAttrs/
        'convertStyleToAttrs',

        // Remove <style> if present in svg
        // https://svgo.dev/docs/plugins/removeStyleElement/
        'removeStyleElement',

        // Remove <script> if present in svg
        // https://svgo.dev/docs/plugins/removeScripts/
        'removeScripts',

        {
            // Run autocrop last (you'll get fewer issues if autocrop runs after the SVGO's default 'convertTransform' and 'convertShapeToPath' plugins)
            ...autocrop,
            params: {
                autocrop: true,
                includeWidthAndHeightAttributes: false, // Mirrors https://svgo.dev/docs/plugins/removeDimensions/ behavior.

                removeClass: true, // Remove 'class' attribute if encountered.
                removeStyle: true, // Remove 'style'/'font-family' attribute if encountered.
                removeDeprecated: true, // Remove deprecated attributes - like <svg version/baseProfile>/etc.

                setColor: 'currentColor', // Replace any colors encountered with 'currentColor'.
                setColorIssue: 'fail', // Fail if more than one color encountered.
            } as CropParams,
        },
    ],
};

export default config;
