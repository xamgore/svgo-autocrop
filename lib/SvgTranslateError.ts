/**
 * Allows customisation of error handling;
 *  (*) If type=='fail' - throw the error back to svgo/the user.
 *  (*) If type=='silent-rollback' - silently rollback <svg> and continue.
 *
 * If any other exception is thrown when 'SvgTranslate.translate()' is being called, the change is just rolled back.
 */
export default class SvgTranslateError extends Error {
	readonly type: string;

	// Don't use this constructor - use static creator methods below.
	constructor(message: string, type: string) {
		super(message);
		this.type = type;
	}

	static fail(message: string) {
		return new SvgTranslateError(message, 'fail');
	}

	static silentRollback(message: string) {
		return new SvgTranslateError(message, 'silentRollback');
	}
}
