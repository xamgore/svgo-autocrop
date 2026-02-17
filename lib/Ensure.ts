import util from 'node:util';

export default class Ensure {
    static unexpectedObject(message: string, obj: any) {
        const dbg = util.inspect(obj, { showHidden: false, depth: 2 });
        return new Error(`${message}: ${dbg}`);
    }

    static notNull<T>(obj: T, xpath: string): NonNullable<T> {
        if (!obj) {
            throw Ensure.unexpectedObject(`[${xpath}] Missing required value`, obj);
        }
        return obj;
    }

    static string(obj: unknown, xpath: string): string {
        if (typeof obj === 'string') {
            return obj;
        }
        throw Ensure.unexpectedObject(`[${xpath}] Expected string, got ${typeof obj}`, obj);
    }

    static integer(value: unknown, xpath: string): number {
        Ensure.notNull(value, xpath);

        if (typeof value === 'string') {
            const _value = parseInt(value, 10);
            if (!isFinite(_value)) {
                throw new TypeError(`[${xpath}] Invalid integer: cannot parse "${value}"`);
            }
            value = _value;
        }

        // Ensure number - or if a string, then convert to number
        if (typeof value !== 'number') {
            throw Ensure.unexpectedObject(
                `[${xpath}] Expected integer (number or numeric string), got ${typeof value}`,
                value,
            );
        } else if (isFinite(value) && value !== Math.trunc(value)) {
            // Ensure integer
            throw new Error(`[${xpath}] Invalid integer: ${value}`);
        }

        return value;
    }

    /**
     * Faster/less flexible version of above method.
     */
    static integerStrict(value: number, xpath: string) {
        if (!Number.isSafeInteger(value)) {
            throw new TypeError(`[${xpath}] Not valid integer: ${value}`);
        }
        return value;
    }
}
