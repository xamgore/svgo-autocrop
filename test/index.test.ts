// noinspection HtmlUnknownAttribute,HtmlDeprecatedAttribute,HttpUrlsUsage

'use strict';

/**
 * Modified copy of https://github.com/svg/svgo/tree/master/test/plugins (see _index.test.js).
 */

import { EOL } from 'node:os';
import * as PATH from 'node:path';
import { optimize, type Plugin } from 'svgo';

import type { AutocropParams } from '../lib/AutocropUtils';
import autocrop = require('../index');

it('01 - 10x10 box - viewBox - no parameters.', function () {
	const actual = runPlugin(
		'01',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it("02 - 10x10 box - viewBox - 'includeWidthAndHeightAttributes' parameter.", function () {
	const actual = runPlugin(
		'02',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			includeWidthAndHeightAttributes: true,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('03 - 10x10 box - width/height - no parameters.', function () {
	const actual = runPlugin(
		'03',
		`
        <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it("04 - 10x10 box - width/height - 'includeWidthAndHeightAttributes' parameter.", function () {
	const actual = runPlugin(
		'04',
		`
        <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			includeWidthAndHeightAttributes: false,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('05 - 11x11 box.', function () {
	const actual = runPlugin(
		'05',
		`
        <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="11" height="11" fill="#000"/>
        </svg>`,
		{
			includeWidthAndHeightAttributes: false,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('06 - 12x12 box.', function () {
	const actual = runPlugin(
		'06',
		`
        <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="12" height="12" fill="#000"/>
        </svg>`,
		{
			includeWidthAndHeightAttributes: false,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('07 - 12x12 box.', function () {
	const actual = runPlugin(
		'07',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" stroke="#000" stroke-width="1" stroke-linecap="square"/>
        </svg>`,
		{
			includeWidthAndHeightAttributes: false,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it("08 - '$' sign.", function () {
	const actual = runPlugin(
		'08',
		`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path fill="none" d="M0 0h24v24H0z"/>
            <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
        </svg>`,
		{
			includeWidthAndHeightAttributes: false,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('09 - 10x10 box - viewBox - padding 1px.', function () {
	const actual = runPlugin(
		'09',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			padding: 1,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('10 - 10x10 box - viewBox - padding 2px.', function () {
	const actual = runPlugin(
		'10',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			padding: 2,
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('11 - 10x10 box - viewBox - padding custom 1.', function () {
	const actual = runPlugin(
		'11',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			padding: {
				top: 1,
				left: 2,
				bottom: 3,
				right: 4,
			},
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it('12 - 10x10 box - viewBox - padding custom 2.', function () {
	const actual = runPlugin(
		'12',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" fill="#000"/>
        </svg>`,
		{
			padding: {
				top: 10,
				left: 20,
				bottom: 30,
				right: 40,
			},
			debug: false,
			debugWriteFiles: false,
		},
	);
	expect(actual).toMatchSnapshot();
});

it("13 - 12x12 box - with unsupported 'unsupported' attribute preventing translate back to (0,0).", function () {
	const actual = runPlugin(
		'13',
		`
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="10" height="10" stroke="#000" stroke-width="1" stroke-linecap="square" unsupported="abc" />
        </svg>`,
		{
			disableTranslateWarning: true,
		},
	);
	expect(actual).toMatchSnapshot();
});

it("14 - Messy 'icon-43-note-remove.svg'", function () {
	const actual = runPlugin(
		'14',
		`
        <?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="32px" height="32px" viewBox="-1 -2 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns">
        <!-- Generator: Sketch 3.0.3 (7891) - http://www.bohemiancoding.com/sketch -->
        <title>icon 43 note remove</title>
        <desc>Created with Sketch.</desc>
        <defs></defs>
        <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage">
            <g id="icon-43-note-remove" sketch:type="MSArtboardGroup" fill="#157EFB">
                <path d="M18.0218178,27 L5.00086422,27 C3.89581743,27 3,26.0983727 3,24.9991358 L3,10 L26,10 L26,17.4981633 C25.2304079,17.1772281 24.3859009,17 23.5,17 C19.9101489,17 17,19.9101489 17,23.5 C17,24.7886423 17.3749964,25.9896995 18.0218178,27 L18.0218178,27 L18.0218178,27 Z M3,9 L3,6.00086422 C3,4.89581743 3.90162726,4 5.00086422,4 L23.9991358,4 C25.1041826,4 26,4.90162726 26,6.00086422 L26,9 L3,9 L3,9 Z M23.5,29 C26.5375663,29 29,26.5375663 29,23.5 C29,20.4624337 26.5375663,18 23.5,18 C20.4624337,18 18,20.4624337 18,23.5 C18,26.5375663 20.4624337,29 23.5,29 L23.5,29 Z M20,23 L20,24 L27,24 L27,23 L20,23 L20,23 Z" id="note-remove" sketch:type="MSShapeGroup"></path>
            </g>
        </g>
        </svg>`,
		{},
	);
	expect(actual).toMatchSnapshot();
});

it("15 - Bootstrap 'tornado.svg'", function () {
	const actual = runPlugin(
		'15',
		`
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="blue" class="bi bi-tornado" viewBox="0 0 16 16">
          <path d="M1.125 2.45A.892.892 0 0 1 1 2c0-.26.116-.474.258-.634a1.9 1.9 0 0 1 .513-.389c.387-.21.913-.385 1.52-.525C4.514.17 6.18 0 8 0c1.821 0 3.486.17 4.709.452.607.14 1.133.314 1.52.525.193.106.374.233.513.389.141.16.258.374.258.634 0 1.011-.35 1.612-.634 2.102-.04.07-.08.137-.116.203a2.55 2.55 0 0 0-.313.809 2.938 2.938 0 0 0-.011.891.5.5 0 0 1 .428.849c-.06.06-.133.126-.215.195.204 1.116.088 1.99-.3 2.711-.453.84-1.231 1.383-2.02 1.856-.204.123-.412.243-.62.364-1.444.832-2.928 1.689-3.735 3.706a.5.5 0 0 1-.748.226l-.001-.001-.002-.001-.004-.003-.01-.008a2.142 2.142 0 0 1-.147-.115 4.095 4.095 0 0 1-1.179-1.656 3.786 3.786 0 0 1-.247-1.296A.498.498 0 0 1 5 12.5v-.018a.62.62 0 0 1 .008-.079.728.728 0 0 1 .188-.386c.09-.489.272-1.014.573-1.574a.5.5 0 0 1 .073-.918 3.29 3.29 0 0 1 .617-.144l.15-.193c.285-.356.404-.639.437-.861a.948.948 0 0 0-.122-.619c-.249-.455-.815-.903-1.613-1.43-.193-.127-.398-.258-.609-.394l-.119-.076a12.307 12.307 0 0 1-1.241-.334.5.5 0 0 1-.285-.707l-.23-.18C2.117 4.01 1.463 3.32 1.125 2.45zm1.973 1.051c.113.104.233.207.358.308.472.381.99.722 1.515 1.06 1.54.317 3.632.5 5.43.14a.5.5 0 0 1 .197.981c-1.216.244-2.537.26-3.759.157.399.326.744.682.963 1.081.203.373.302.79.233 1.247-.05.33-.182.657-.39.985.075.017.148.035.22.053l.006.002c.481.12.863.213 1.47.01a.5.5 0 1 1 .317.95c-.888.295-1.505.141-2.023.012l-.006-.002a3.894 3.894 0 0 0-.644-.123c-.37.55-.598 1.05-.726 1.497.142.045.296.11.465.194a.5.5 0 1 1-.448.894 3.11 3.11 0 0 0-.148-.07c.012.345.084.643.18.895.14.369.342.666.528.886.992-1.903 2.583-2.814 3.885-3.56.203-.116.399-.228.584-.34.775-.464 1.34-.89 1.653-1.472.212-.393.33-.9.26-1.617A6.74 6.74 0 0 1 10 8.5a.5.5 0 0 1 0-1 5.76 5.76 0 0 0 3.017-.872.515.515 0 0 1-.007-.03c-.135-.673-.14-1.207-.056-1.665.084-.46.253-.81.421-1.113l.131-.23c.065-.112.126-.22.182-.327-.29.107-.62.202-.98.285C11.487 3.83 9.822 4 8 4c-1.821 0-3.486-.17-4.709-.452-.065-.015-.13-.03-.193-.047zM13.964 2a1.12 1.12 0 0 0-.214-.145c-.272-.148-.697-.297-1.266-.428C11.354 1.166 9.769 1 8 1c-1.769 0-3.354.166-4.484.427-.569.13-.994.28-1.266.428A1.12 1.12 0 0 0 2.036 2c.04.038.109.087.214.145.272.148.697.297 1.266.428C4.646 2.834 6.231 3 8 3c1.769 0 3.354-.166 4.484-.427.569-.13.994-.28 1.266-.428A1.12 1.12 0 0 0 13.964 2z"/>
        </svg>`,
		{
			removeClass: true,
		},
	);
	expect(actual).toMatchSnapshot();
});

it("16 - Change color from 'black' to 'currentColor'.", function () {
	const actual = runPlugin(
		'16',
		`
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg" version="1.1" color="black" fill="black" stroke="black">
            <line x1="40" x2="120" y1="20" y2="20" stroke="black" stroke-width="20" stroke-linecap="butt" fill="black"/>
            <line x1="40" x2="120" y1="60" y2="60" stroke="black" stroke-width="20" stroke-linecap="square" />
            <line x1="40" x2="120" y1="100" y2="100" stroke="black" stroke-width="20" stroke-linecap="round" stop-color="black" flood-color="black" lighting-color="black" />
        </svg>`,
		{
			setColor: 'currentColor',
			setColorIssue: 'fail',
		},
	);
	expect(actual).toMatchSnapshot();
});

it("17 - Change all colors to 'currentColor'.", function () {
	const actual = runPlugin(
		'17',
		`
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg" version="1.1" color="red" fill="black" stroke="green">
            <line x1="40" x2="120" y1="20" y2="20" stroke="pink" stroke-width="20" stroke-linecap="butt" fill="blue"/>
            <line x1="40" x2="120" y1="60" y2="60" stroke="yellow" stroke-width="20" stroke-linecap="square" />
            <line x1="40" x2="120" y1="100" y2="100" stroke="aqua" stroke-width="20" stroke-linecap="square" stop-color="blue" flood-color="orange" lighting-color="purple" />
        </svg>`,
		{
			removeDeprecated: true,
			setColor: 'currentColor',
			setColorIssue: 'ignore',
		},
	);
	expect(actual).toMatchSnapshot();
});

it("18 - Change all colors to 'currentColor' - also disable autocrop.", function () {
	const actual = runPlugin(
		'18',
		`
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg" class="removeme1" version="1.1" color="red" fill="black" stroke="green">
            <line x1="40" x2="120" y1="20" y2="20" stroke="pink" stroke-width="20" stroke-linecap="butt" fill="blue" class="removeme2"/>
            <line x1="40" x2="120" y1="60" y2="60" stroke="yellow" stroke-width="20" stroke-linecap="square" class="removeme3"/>
            <line x1="40" x2="120" y1="100" y2="100" stroke="aqua" stroke-width="20" stroke-linecap="square" stop-color="blue" flood-color="orange" lighting-color="purple" class="removeme4"/>
        </svg>`,
		{
			autocrop: false,
			removeClass: true,
			removeDeprecated: true,
			setColor: 'currentColor',
			setColorIssue: 'ignore',
		},
	);
	expect(actual).toMatchSnapshot();
});

it("19 - Fix color on 'icon-43-note-remove.svg'", function () {
	const actual = runPlugin(
		'19',
		`
        <?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns">
            <!-- Generator: Sketch 3.0.3 (7891) - http://www.bohemiancoding.com/sketch -->
            <title>icon 43 note remove</title>
            <desc>Created with Sketch.</desc>
            <defs></defs>
            <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage">
                <g id="icon-43-note-remove" sketch:type="MSArtboardGroup" fill="#157EFB">
                    <path d="M18.0218178,27 L5.00086422,27 C3.89581743,27 3,26.0983727 3,24.9991358 L3,10 L26,10 L26,17.4981633 C25.2304079,17.1772281 24.3859009,17 23.5,17 C19.9101489,17 17,19.9101489 17,23.5 C17,24.7886423 17.3749964,25.9896995 18.0218178,27 L18.0218178,27 L18.0218178,27 Z M3,9 L3,6.00086422 C3,4.89581743 3.90162726,4 5.00086422,4 L23.9991358,4 C25.1041826,4 26,4.90162726 26,6.00086422 L26,9 L3,9 L3,9 Z M23.5,29 C26.5375663,29 29,26.5375663 29,23.5 C29,20.4624337 26.5375663,18 23.5,18 C20.4624337,18 18,20.4624337 18,23.5 C18,26.5375663 20.4624337,29 23.5,29 L23.5,29 Z M20,23 L20,24 L27,24 L27,23 L20,23 L20,23 Z" id="note-remove" sketch:type="MSShapeGroup"></path>
                </g>
            </g>
        </svg>`,
		{
			removeClass: true,
			removeStyle: true,
			removeDeprecated: true,
			setColor: 'blue',
			setColorIssue: 'fail',
		},
	);
	expect(actual).toMatchSnapshot();
});

it('20 - Set color should set fill.', function () {
	const actual = runPlugin(
		'20',
		`
        <svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 20 18">
            <path d="m19.799 4.165-2.375-1.83a1.997 1.997 0 0 0-.521-.237A2.035 2.035 0 0 0 16.336 2H9.5l.801 5h6.035c.164 0 .369-.037.566-.098s.387-.145.521-.236l2.375-1.832c.135-.091.202-.212.202-.334s-.067-.243-.201-.335zM8.5 0h-1a.5.5 0 0 0-.5.5V4H3.664c-.166 0-.37.037-.567.099-.198.06-.387.143-.521.236L.201 6.165C.066 6.256 0 6.378 0 6.5c0 .121.066.242.201.335l2.375 1.832c.134.091.323.175.521.235.197.061.401.098.567.098H7v8.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V.5a.5.5 0 0 0-.5-.5z"/>
        </svg>`,
		{
			removeClass: true,
			removeStyle: true,
			removeDeprecated: true,
			setColor: 'currentColor',
			setColorIssue: 'fail',
		},
	);
	expect(actual).toMatchSnapshot();
});

it('21 - Delete redundant: color="currentColor" overflow="visible". Also set fill="currentColor".', function () {
	const actual = runPlugin(
		'21',
		`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path color="currentColor" overflow="visible" d="M12 0c-1.775 0-3.454.404-4.969 1.094-.008.004-.022-.004-.031 0a1.006 1.006 0 0 0-.219 0c-1.78.203-3.29.467-4.437.812-.574.173-1.047.371-1.469.657C.453 2.848 0 3.33 0 4c0 .477.235.88.5 1.156.265.276.563.485.906.657.078.038.168.088.25.125A11.931 11.931 0 0 0 0 12c0 6.636 5.364 12 12 12s12-5.364 12-12c0-2.217-.611-4.282-1.656-6.063.082-.036.172-.086.25-.125.343-.17.641-.38.906-.656.265-.275.5-.68.5-1.156 0-.67-.453-1.152-.875-1.438-.422-.285-.895-.483-1.469-.656-1.147-.345-2.657-.609-4.437-.812a1.006 1.006 0 0 0-.188 0c-.008-.004-.022.004-.031 0A11.98 11.98 0 0 0 12 0zm0 2c2.71 0 5.145 1.06 6.938 2.781-1.839.325-4.258.532-6.938.532-2.68 0-5.1-.207-6.938-.532A9.964 9.964 0 0 1 12 2zM3.312 3.719c-.147.155-.266.337-.406.5-.162-.063-.343-.13-.469-.188.164-.071.253-.144.5-.218.112-.034.25-.062.376-.094zm17.375 0c.126.032.264.06.375.094.248.074.337.147.5.218-.125.059-.306.125-.468.188-.14-.163-.259-.345-.407-.5zM3.595 6.53c.14.032.259.063.406.094 2.088.433 4.895.688 8 .688 3.105 0 5.912-.255 8-.688.147-.03.266-.062.406-.094A10.034 10.034 0 0 1 22 12c0 5.564-4.436 10-10 10S2 17.564 2 12c0-2.022.581-3.904 1.594-5.469zM8 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8.188 6.844-1.625 1.125C7.466 17.829 9.584 19 12 19s4.534-1.172 5.813-3.031l-1.625-1.125C15.265 16.184 13.783 17 12 17s-3.266-.816-4.188-2.156z" />
        </svg>`,
		{
			removeClass: true,
			removeStyle: true,
			removeDeprecated: true,
			setColor: 'currentColor',
			setColorIssue: 'fail',
		},
	);
	expect(actual).toMatchSnapshot();
});

function runPlugin(caseId: string, input: string, params: AutocropParams = {}): string {
	const plugin: Plugin<AutocropParams> = {
		...autocrop,
		params: params,
	};
	const runPath = PATH.resolve(__dirname, `case-${caseId}.svg.run1`);
	const result = optimize(input, {
		path: runPath,
		plugins: [plugin],
		js2svg: { pretty: true },
	});
	const normalized = result.data.trim().replaceAll(EOL, '\n');
	if (params.debug) {
		console.debug(`[Run 1] ${runPath}\n[Input] ${input.trim()}\n[Output] ${normalized.trim()}`);
	}
	return normalized;
}
