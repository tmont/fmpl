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

Brief syntax overview:

{{ expression }}                     echo the result of a JavaScript expression
{{- expression }}                    same as above, trim previous whitespace
{$ expression $}                     execute a JavaScript expression
{$- expression $}                    same as above, trim previous whitespace
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
		const start = Date.now();
		verbose && console.error(`compiling template (len=${text.length})...`);
		tmpl = fmpl.compile(text);
		verbose && console.error(`finished compiling in ${Date.now() - start}ms`);
	} catch (e) {
		callback(e);
		return;
	}

	console.log(tmpl.toString());
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
