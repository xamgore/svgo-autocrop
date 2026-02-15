import util from 'node:util';

export default class Ensure {
	static unexpectedObject(message: string, obj: any) {
		const dbg = util.inspect(obj, { showHidden: false, depth: 2 });
		return new Error(`${message}: ${dbg}`);
	}

	static notNull<T>(obj: T, objDescription = 'object'): NonNullable<T> {
		if (!obj) {
			throw Ensure.unexpectedObject(`Expected non-null ${objDescription}`, obj);
		}
		return obj;
	}

	static type(expectedType: string, obj: unknown, objDescription = 'object') {
		Ensure.notNull(obj, objDescription);
		if (typeof obj !== expectedType) {
			throw Ensure.unexpectedObject(
				`Expected type '${expectedType}' for ${objDescription}, instead '${typeof obj}'`,
				obj,
			);
		}
		return obj;
	}

	static string(obj: unknown, objDescription = 'string'): string {
		if (typeof obj === 'string') {
			return obj;
		}
		throw Ensure.unexpectedObject(
			`Expected type 'string' for ${objDescription}, instead '${typeof obj}'`,
			obj,
		);
	}

	static integer(value: unknown, valueDescription = 'integer'): number {
		Ensure.notNull(value, valueDescription);

		if (typeof value === 'string') {
			let _value = parseInt(value, 10);
			if (!isFinite(_value)) {
				throw new TypeError(
					`[${valueDescription}] Couldn't convert string to integer: ${value}`,
				);
			}
			value = _value;
		}

		// Ensure number - or if a string, then convert to number
		if (typeof value !== 'number') {
			throw Ensure.unexpectedObject(
				`Expected type 'number' (or 'string' that can be converted to 'number') for ${valueDescription}, instead '${typeof value}'`,
				value,
			);
		} else if (isFinite(value) && value !== Math.trunc(value)) {
			// Ensure integer
			throw new Error(`[${valueDescription}] Number is not integer: ${value}`);
		}

		return value;
	}

	/**
	 * Faster/less flexible version of above method.
	 */
	static integerStrict(value: number, valueDescription = 'integer') {
		if (isFinite(value) && value !== Math.trunc(value)) {
			throw new Error(`[${valueDescription}] Not valid integer: ${value}`);
		}
		return value;
	}
}
