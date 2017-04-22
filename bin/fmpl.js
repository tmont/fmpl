#!/usr/bin/env node

const start = Date.now();
const fs = require('fs');
const Fmpl = require('../');

const usage = `fmpl [--verbose|-v] [--help|-h] [file] [file...]

fmpl is a fucking template engine that accepts a file and spits out a 
stringified JavaScript function to stdout. If no file is specified
then it reads from stdin. If "-" is given for the filename it will read
from stdin.

Options

--verbose|-v                         show debugging messages
--help|-g                            show this message
--render json                        compile and render the template

Brief syntax overview:

{{ expression }}                     echo the result of a JavaScript expression
{$ expression $}                     execute a JavaScript expression
{% if expression %}{% endif %}       basic if statement
{% for expression %}{% endfor %}     basic for loop
{% while expression %}{% endwhile %} basic while loop
{% block name %}{% endblock %}       create a block
{% include name %}                   include another template

Append "-" to any of the above opening tags will trim previous whitespace.

Returns 0 if it worked, 1 if it didn't.
`;

function showUsage() {
	console.log(usage);
	process.exit(0);
}

const args = process.argv.slice(2);
let files = [];
let verbose = false;
let render = false;
let renderData = {};

for (let i = 0; i < args.length; i++) {
	switch (args[i]) {
		case '--help':
		case '-h':
			showUsage();
			break;
		case '--verbose':
		case '-v':
			verbose = true;
			break;
		case '--render':
			render = true;
			try {
				renderData = JSON.parse(args[i + 1]);
				i++;
			} catch (e) {
				exit(e);
			}
			break;
		default:
			files.push(args[i]);
			break;
	}
}

function exit(err) {
	if (err) {
		console.error(err.message);
		if (err.stack && verbose) {
			console.error(err.stack);
		}
	}

	verbose && console.error(`finished in ${Date.now() - start}ms`);
	process.exit(err ? 1 : 0);
}

const fmpl = new Fmpl();

function compileAndEmit(text, callback) {
	let tmpl;
	try {
		verbose && console.error(`compiling template (len=${text.length})...`);
		const start = Date.now();
		tmpl = fmpl.compile(text);
		verbose && console.error(`finished compiling in ${Date.now() - start}ms`);
	} catch (e) {
		callback(e);
		return;
	}

	if (render) {
		verbose && console.error(`rendering template with data`, renderData);
		try {
			const start = Date.now();
			const rendered = tmpl(renderData);
			verbose && console.error(`rendered template in ${Date.now() - start}ms`);
			console.log(rendered);
		} catch (e) {
			console.error('failed to render template');
			exit(e);
		}

	} else {
		console.log(tmpl.toString());
	}

	callback();
}

if (!files.length) {
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	let templateText = '';
	process.stdin.on('data', (chunk) => {
		templateText += chunk;
	});
	process.stdin.on('end', () => {
		compileAndEmit(templateText, exit);
	});
	return;
}

function compile(index) {
	const file = files[index];
	if (!file) {
		exit();
		return;
	}

	verbose && console.error(`processing ${file}...`);
	fs.readFile(file, { encoding: 'utf8' }, (err, text) => {
		if (err) {
			exit(err);
			return;
		}

		compileAndEmit(text, (err) => {
			if (err) {
				exit(err);
				return;
			}

			compile(index + 1);
		});
	});
}

compile(0);
