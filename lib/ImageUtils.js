const Ensure = require('./Ensure');

const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');

module.exports = class ImageUtils {
	/**
	 * Render svg and return width/height and bounds of visible pixels.
	 *
	 * @return Returns {width, height, xMin, yMin, xMax, yMax}
	 */
	static getBounds(svg, width, height, debugWriteFilePrefix) {
		svg = Ensure.string(svg, 'svg');
		width = Ensure.integerStrict(width, 'width');
		height = Ensure.integerStrict(height, 'height');

		if (!svg) {
			throw new Error('No svg provided');
		} else if (width <= 0 || height <= 0) {
			throw new Error(`Invalid width/height provided; width=${width}, height=${height}`);
		}

		let renderedImage = new Resvg(svg).render();

		if (debugWriteFilePrefix) {
			fs.writeFileSync(`${debugWriteFilePrefix}.png`, renderedImage.asPng());
			fs.writeFileSync(`${debugWriteFilePrefix}.svg`, svg);
		}

		return ImageUtils.getVisiblePixelBounds(
			renderedImage.pixels,
			renderedImage.width,
			renderedImage.height,
		);
	}

	static getVisiblePixelBounds(pixels, width, height) {
		let expectedPixelCount = width * height * 4;
		if (!pixels || pixels.length !== expectedPixelCount) {
			throw new Error(
				`Invalid rendered image pixels; expected length=${expectedPixelCount}, actual=${pixels?.length ?? null}`,
			);
		}

		// Scan image determining bounds of visible pixels.
		let xMin = width;
		let yMin = height;
		let xMax = -1;
		let yMax = -1;
		let rowStride = width * 4;

		for (let y = 0; y < height; y++) {
			let rowStart = y * rowStride;
			for (let x = 0; x < width; x++) {
				let alpha = pixels[rowStart + x * 4 + 3];
				// the pixel is visible?
				if (alpha > 0) {
					if (x < xMin) {
						xMin = x;
					} else if (x > xMax) {
						xMax = x;
					}

					if (y < yMin) {
						yMin = y;
					} else if (y > yMax) {
						yMax = y;
					}
				}
			}
		}

		if (xMax < 0 || yMax < 0) {
			throw new Error('Image has no visible pixels');
		}

		let result = {
			width: width,
			height: height,
			xMin: xMin,
			yMin: yMin,
			xMax: xMax,
			yMax: yMax,
		};
		if (
			!(
				0 <= xMin &&
				xMin <= xMax &&
				xMax < width &&
				0 <= yMin &&
				yMin <= yMax &&
				yMax < height
			)
		) {
			throw new Error(`Unexpected - invalid bounds calculated: ${JSON.stringify(result)}`);
		}
		return result;
	}
};
