const util = require('util');

module.exports = class Ensure {
	static unexpectedObject(message, obj) {
		return new Error(message + ': ' + util.inspect(obj, { showHidden: false, depth: 2 }));
	}

	static notNull(obj, objDescription = 'object') {
		if (!obj) {
			throw Ensure.unexpectedObject('Expected non-null ' + objDescription, obj);
		}
		return obj;
	}

	static type(expectedType, obj, objDescription = 'object') {
		Ensure.notNull(obj, objDescription);
		let actualType = typeof obj;
		if (actualType !== expectedType) {
			throw Ensure.unexpectedObject(
				"Expected type '" +
					expectedType +
					"' for " +
					objDescription +
					", instead '" +
					actualType +
					"'",
				obj,
			);
		}
		return obj;
	}

	static string(obj, objDescription = 'string') {
		return Ensure.type('string', obj, objDescription);
	}

	static integer(value, valueDescription = 'integer') {
		Ensure.notNull(value, valueDescription);

		// Ensure number - or if string, then convert to number
		let type = typeof value;
		if (type !== 'number') {
			if (type === 'string') {
				let _value = parseInt(value, 10);
				if (!isFinite(_value)) {
					throw new Error(
						'[' + valueDescription + "] Couldn't convert string to integer: " + value,
					);
				}
				value = _value;
			} else {
				throw Ensure.unexpectedObject(
					"Expected type 'number' (or 'string' that can be converted to 'number') for " +
						objDescription +
						", instead '" +
						type +
						"'",
					obj,
				);
			}
		}

		// Ensure integer
		if (isFinite(value) && value != Math.trunc(value)) {
			throw new Error('[' + valueDescription + '] Number is not integer: ' + value);
		}
		return value;
	}

	/**
	 * Faster/less flexible version of above method.
	 */
	static integerStrict(value, valueDescription = 'integer') {
		if (isFinite(value) && value != Math.trunc(value)) {
			throw new Error('[' + valueDescription + '] Not valid integer: ' + value);
		}
		return value;
	}
};
