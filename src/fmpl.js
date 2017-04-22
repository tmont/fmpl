'use strict';

const fs = require('fs');
const path = require('path');

class Fmpl {
	constructor() {
		this.templateResolvers = [];
		this.defaultResolver = (name) => {
			try {
				return fs.readFileSync(name, { encoding: 'utf8' });
			} catch (e) {
				return null;
			}
		};
	}

	addIncludeResolver(handler) {
		this.templateResolvers.push(handler);
	}

	resolveTemplate(name) {
		const resolvers = this.templateResolvers.concat([]);
		if (!resolvers.length) {
			if (this.defaultResolver) {
				resolvers.push(this.defaultResolver);
			}
		}

		for (let i = 0; i < resolvers.length; i++) {
			const handler = resolvers[i];
			const result = handler(name);
			if (result) {
				return result;
			}
		}

		return null;
	}

	compile(str) {
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

		const varLocals = '$$locals';
		const varOptions = '$$options';
		let code = '';

		const parse = (stringToParse) => {
			let c;
			let index = 0;

			const stateStack = [];
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
							code += `__append(${JSON.stringify(state.value)});\n`;
						}
						break;
					case scopes.echoedExpression:
						code += `__append(${state.value.trim()});\n`;
						break;
					case scopes.nonEchoedExpression:
						code += state.value.trim() + '\n';
						break;
					case scopes.blockExpression:
						code += '(' + state.value.trim() + ') {\n';
						break;
					case scopes.includePath:
						const includePath = state.value.trim();
						const includedResult = this.resolveTemplate(includePath);
						if (!includedResult) {
							throw new Error(`Unable to resolve template for include path "${includePath}"`);
						}

						//index + 1 to account for the closing "}"
						//probably not the greatest, but it's okay to write garbage code if it's tested!
						stringToParse = stringToParse.substring(0, index + 1) + includedResult + stringToParse.substring(index + 1);
						break;
					case scopes.blockName:
						code += `__openBlock(${JSON.stringify(state.value.trim())});\n`;
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
								code += '__closeBlock();\n';
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
				// console.log('char: "' + c + '"');

				switch (c) {
					case '{':
						if (state.scope === scopes.endBlock) {
							throw new Error('expected %} but got {');
						}

						switch (next) {
							case '%':
								index++;
								pushState(scopes.tagBlockName);
								break;
							case '{':
								index++;
								if (stringToParse.charAt(index + 1) === '-') {
									index++;
									pushState(scopes.nonEchoedExpression);
								} else {
									pushState(scopes.echoedExpression);
								}
								break;
							default:
								state.value += c;
								break;
						}
						break;
					case '}':
						if (state.scope === scopes.endBlock) {
							throw new Error('expected %} but got }');
						}

						if ((state.scope === scopes.echoedExpression || state.scope === scopes.nonEchoedExpression) &&
							next === '}') {
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
		};

		parse(str);

		console.log('\n--------------------');
		console.log(code.trim());
		console.log('--------------------');
		const funcDefinition = `
var __tree = {};
var __currentBlock = null;
function __append(val) { 
  __currentBlock.data.push(String(val));
}

function __openBlock(name) {
  var current = __currentBlock || __tree;
  var append = name.charAt(0) === '+';
  name = append ? name.substring(1) : name;
  var block = current[name];
  if (!block) {
    block = current[name] = {
      parent: __currentBlock || null,
      data: [], //contains either Strings or references to blocks
      children: {}
    };
  }
  
  if (!append) {
    //replace everything
    block.data = [];
  }
  
  if (__currentBlock) {
    if (__currentBlock.data.indexOf(block) === -1) {
      __currentBlock.data.push(block);
    }
  }
  __currentBlock = block;
}

function __closeBlock() {
  __currentBlock = __currentBlock.parent;
}

function __render(item) {
  if (typeof(item) === 'string') {
    return item;
  }
  
  if (item.data) {
    //block
    return __render(item.data);
  }
  
  //array
  return item.map(__render).join('');
}

__openBlock('root');
with (${varLocals} || {}) {
${code};
}

return __render(__tree.root)`;

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
				result = this.compile(contents);
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
