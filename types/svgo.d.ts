declare module 'svgo' {
	export interface XastRoot {
		type: 'root';
		children: XastChild[];
		[key: string]: unknown;
	}

	export interface XastElement {
		type: 'element';
		name: string;
		attributes: Record<string, string>;
		children: XastChild[];
		[key: string]: unknown;
	}

	export interface XastText {
		type: 'text';
		value: string;
		[key: string]: unknown;
	}

	export interface XastComment {
		type: 'comment';
		value: string;
		[key: string]: unknown;
	}

	export interface XastCdata {
		type: 'cdata';
		value: string;
		[key: string]: unknown;
	}

	export interface XastDoctype {
		type: 'doctype';
		name?: string;
		data?: string;
		[key: string]: unknown;
	}

	export interface XastInstruction {
		type: 'instruction';
		name?: string;
		value?: string;
		[key: string]: unknown;
	}

	export type XastChild =
		| XastElement
		| XastText
		| XastComment
		| XastCdata
		| XastDoctype
		| XastInstruction;

	export type XastParent = XastRoot | XastElement;

	export interface VisitorCallbacks<TNode = unknown, TParent = unknown> {
		enter?: (node: TNode, parent: TParent) => void | symbol;
		exit?: (node: TNode, parent: TParent) => void;
	}

	export interface Visitor {
		root?: VisitorCallbacks<XastRoot, null>;
		element?: VisitorCallbacks<XastElement, XastParent>;
		text?: VisitorCallbacks<XastText, XastParent>;
		comment?: VisitorCallbacks<XastComment, XastParent>;
		cdata?: VisitorCallbacks<XastCdata, XastParent>;
		doctype?: VisitorCallbacks<XastDoctype, XastParent>;
		instruction?: VisitorCallbacks<XastInstruction, XastParent>;
		[nodeType: string]: VisitorCallbacks<any, any> | undefined;
	}

	export interface PluginInfo {
		path?: string;
		multipassCount: number;
		[key: string]: unknown;
	}

	export type PluginType = 'visitor' | 'full' | 'perItem' | 'perItemReverse';

	export interface Plugin<Params = Record<string, unknown>> {
		name: string;
		type: PluginType;
		active?: boolean;
		description?: string;
		params?: Params;
		fn: (ast: XastRoot, params: Params, info: PluginInfo) => Visitor | XastRoot | null | void;
	}

	export interface OptimizeOptions {
		path?: string;
		multipass?: boolean;
		plugins?: Array<string | Plugin>;
		js2svg?: Record<string, unknown>;
		datauri?: string;
		floatPrecision?: number;
		[key: string]: unknown;
	}

	export interface OptimizeResult {
		data: string;
		path?: string;
		error?: string;
		modernError?: unknown;
		[key: string]: unknown;
	}

	export function optimize(input: string, config?: OptimizeOptions): OptimizeResult;
}

declare module 'svgo/lib/parser' {
	import type { XastRoot } from 'svgo';

	export function parseSvg(input: string, path?: string): XastRoot;
}

declare module 'svgo/lib/stringifier' {
	import type { XastRoot } from 'svgo';

	export function stringifySvg(ast: XastRoot, config?: Record<string, unknown>): { data: string };
}
