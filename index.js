'use strict';

const fs = require('fs');
const path = require('path');

const varPrefix = '____';
const varLocals = `${varPrefix}locals`;
const varOptions = `${varPrefix}options`;
const varTree = `${varPrefix}tree`;
const varCurrentBlock = `${varPrefix}currentBlock`;
const fnAppend = `${varPrefix}append`;
const fnOpenBlock = `${varPrefix}openBlock`;
const fnCloseBlock = `${varPrefix}closeBlock`;
const fnRender = `${varPrefix}render`;
const fnTrim = `${varPrefix}trim`;

class Fmpl {
	constructor() {
		this.templateResolvers = [];
		this.defaultResolver = (name, filename) => {
			const files = [ name ];
			if (filename && !path.isAbsolute(name)) {
				files.unshift(path.resolve(path.join(path.dirname(filename), name)));
			}

			for (let i = 0; i < files.length; i++) {
				try {
					return fs.readFileSync(files[i], { encoding: 'utf8' });
				} catch (e) {}
			}

			return null;
		};
	}

	addIncludeResolver(handler) {
		this.templateResolvers.push(handler);
	}

	resolveTemplate(name, filename) {
		const resolvers = this.templateResolvers.concat([]);
		if (!resolvers.length) {
			if (this.defaultResolver) {
				resolvers.push(this.defaultResolver);
			}
		}

		for (let i = 0; i < resolvers.length; i++) {
			const handler = resolvers[i];
			const result = handler(name, filename);
			if (result) {
				return result;
			}
		}

		return null;
	}

	compile(stringToParse, filename) {
		// {% if $expression %} {% else %} {% endif %}
		// {% for $expression %} {% endfor %}
		// {% while $expression %} {% endwhile %}
		// {% block name %} {% endblock %}
		// {% include '/path/to/file.txt' %}
		// {{- $expression }}
		// {{ $expression }}

		const scopes = {
			tagBlockName: 'tagBlockName',
			blockExpression: 'blockExpression',
			echoedExpression: 'echoedExpression',
			nonEchoedExpression: 'nonEchoedExpression',
			verbatim: 'verbatim',
			includePath: 'includePath',
			endBlock: 'endBlock',
			blockName: 'blockName'
		};

		const stateStack = [];

		let code = '';
		let c;
		let index = 0;
		let state = null;
		let depth = 0;

		const pushState = (newScope) => {
			if (state && state.scope === scopes.verbatim) {
				popState();
			}

			// console.log(' '.repeat(depth) + newScope);
			depth++;

			const newState = { scope: newScope, value: '' };
			stateStack.push(newState);
			state = newState;

			switch (state.scope) {
				case scopes.echoedExpression:
					break;
			}
		};

		const popState = () => {
			depth--;
			// console.log(' '.repeat(depth) + ':' + state.scope, state.value);

			switch (state.scope) {
				case scopes.verbatim:
					if (state.value) {
						code += `${fnAppend}(${JSON.stringify(state.value)});\n`;
					}
					break;
				case scopes.echoedExpression:
					code += `${fnAppend}(${state.value.trim()});\n`;
					break;
				case scopes.nonEchoedExpression:
					code += state.value.trim() + '\n';
					break;
				case scopes.blockExpression:
					code += '(' + state.value.trim() + ') {\n';
					break;
				case scopes.includePath:
					const includePath = state.value.trim();
					const includedResult = this.resolveTemplate(includePath, filename);
					if (!includedResult) {
						throw new Error(`Unable to resolve template for include path "${includePath}"`);
					}

					//index + 1 to account for the closing "}"
					//probably not the greatest, but it's okay to write garbage code if it's tested!
					stringToParse = stringToParse.substring(0, index + 1) +
						includedResult +
						stringToParse.substring(index + 1);
					break;
				case scopes.blockName:
					code += `${fnOpenBlock}(${JSON.stringify(state.value.trim())});\n`;
					break;
				case scopes.tagBlockName:
					switch (state.value) {
						case 'if':
							code += 'if ';
							break;
						case 'else':
							code += '} else {\n';
							break;
						case 'while':
							code += 'while ';
							break;
						case 'for':
							code += 'for ';
							break;
						case 'endif':
						case 'endfor':
						case 'endwhile':
							code += '}\n';
							break;
						case 'endblock':
							code += `${fnCloseBlock}();\n`;
							break;
					}
			}

			stateStack.pop();
			if (!stateStack.length) {
				stateStack.push({ scope: scopes.verbatim, value: '' });
				depth = 1;
			}

			state = stateStack[stateStack.length - 1];
		};

		pushState(scopes.verbatim);

		while (c = stringToParse.charAt(index)) {
			const next = stringToParse.charAt(index + 1);

			switch (c) {
				case '{':
					if (state.scope === scopes.endBlock) {
						throw new Error('expected %} but got {');
					}

					switch (next) {
						case '%':
						case '$':
						case '{':
							index++;

							switch (next) {
								case '%':
									pushState(scopes.tagBlockName);
									break;
								case '$':
									pushState(scopes.nonEchoedExpression);
									break;
								case '{':
									pushState(scopes.echoedExpression);
									break;
							}

							if (stringToParse.charAt(index + 1) === '-') {
								index++;
								code += `${fnTrim}();\n`;
							}
							break;
						default:
							state.value += c;
							break;
					}
					break;
				case '$':
					if (state.scope === scopes.endBlock) {
						throw new Error('expected %} but got $');
					}

					if (state.scope === scopes.nonEchoedExpression && next === '}') {
						index++;
						popState();
					} else {
						state.value += c;
					}
					break;
				case '}':
					if (state.scope === scopes.endBlock) {
						throw new Error('expected %} but got }');
					}

					if (state.scope === scopes.echoedExpression && next === '}') {
						index++;
						popState();
					} else {
						state.value += c;
					}
					break;
				case '%':
					if (next === '}') {
						index++;
						if (state.scope === scopes.verbatim) {
							state.value += '%}';
							break;
						}

						if (state.scope === scopes.endBlock) {
							popState();
							pushState(scopes.verbatim);
						}

						if (state.scope === scopes.blockExpression ||
							state.scope === scopes.blockName ||
							state.scope === scopes.includePath ||
							state.scope === scopes.endBlock) {
							popState();
							pushState(scopes.verbatim);
						}
					} else if (state.scope === scopes.endBlock) {
						throw new Error('expected %} but got %' + next);
					} else {
						state.value += '%';
					}
					break;
				default:
					if (state.scope === scopes.tagBlockName && /\s/.test(c)) {
						state.value = state.value.trim();
						if (state.value) {
							const stateValue = state.value;
							popState();
							switch (stateValue) {
								case 'if':
								case 'for':
								case 'while':
									pushState(scopes.blockExpression);
									break;
								case 'include':
									pushState(scopes.includePath);
									break;
								case 'block':
									pushState(scopes.blockName);
									break;
								case 'endif':
								case 'endfor':
								case 'endwhile':
								case 'endblock':
								case 'else':
									pushState(scopes.endBlock);
									break;
								default:
									throw new Error('Unknown tag: "' + stateValue + '"');
							}
						}
					} else if (state.scope === scopes.endBlock) {
						if (!/\s/.test(c)) {
							throw new Error('expected %} but got "' + c + '"');
						}
					} else {
						state.value += c;
					}
					break;
			}

			index++;
		}

		if (state.value) {
			popState();
		}

		const funcDefinition = `
var ${varTree} = {};
var ${varCurrentBlock} = null;
function ${fnAppend}(val) { 
  ${varCurrentBlock}.data.push(String(val));
}

function ${fnOpenBlock}(name) {
  var current = ${varCurrentBlock} || ${varTree};
  var append = name.charAt(0) === '+';
  name = append ? name.substring(1) : name;
  var block = current[name];
  if (!block) {
    block = current[name] = {
      parent: ${varCurrentBlock} || null,
      data: [], //contains either Strings or references to blocks
      children: {}
    };
  }
  
  if (!append) {
    //replace everything
    block.data = [];
  }
  
  if (${varCurrentBlock}) {
    if (${varCurrentBlock}.data.indexOf(block) === -1) {
      ${varCurrentBlock}.data.push(block);
    }
  }
  ${varCurrentBlock} = block;
}

function ${fnCloseBlock}() {
  ${varCurrentBlock} = ${varCurrentBlock}.parent;
}

function ${fnRender}(item) {
  if (typeof(item) === 'string') {
    return item;
  }
  
  if (item.data) {
    //block
    return ${fnRender}(item.data);
  }
  
  //array
  return item.map(${fnRender}).join('');
}

function ${fnTrim}() {
  var data = ${varCurrentBlock}.data;
  for (var i = data.length - 1; i >= 0; i--) {
    var value = data[i];
    if (typeof(value) !== 'string') {
      break;
    }
    
    value = value.replace(/\\s+$/, '');
    data[i] = value;
    if (value) {
      break;
    }
  }
}

${fnOpenBlock}('root');
with (${varLocals} || {}) {
${code}
}

return ${fnRender}(${varTree}.root);`;

		return new Function(varLocals, varOptions, funcDefinition);
	}

	compileFile(file, callback) {
		fs.readFile(file, { encoding: 'utf8' }, (err, contents) => {
			if (err) {
				callback(err);
				return;
			}

			let result, error = null;
			try {
				result = this.compile(contents, file);
			} catch (e) {
				error = e;
			}

			callback(error, error ? null : result);
		});
	}
}

Fmpl.compile = (str) => {
	return new Fmpl().compile(str);
};

Fmpl.render = (str, values, options) => {
	options = Object.assign({}, options);
	return new Fmpl().compile(str)(values || {}, options);
};

module.exports = Fmpl;
