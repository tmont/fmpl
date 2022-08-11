import * as fs from 'fs';
import * as path from 'path';

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

const shouldNeverHappen = (x: never): void => {};

export type TemplateResolver = (name: string, filename?: string) => string | null;
export type FmplFn<T extends Record<string, unknown> = Record<string, unknown>> = (values?: T) => string;

export class Fmpl {
    private readonly templateResolvers: TemplateResolver[];
    public defaultResolver: TemplateResolver | null;

    public constructor() {
        this.templateResolvers = [];
        this.defaultResolver = (name, filename) => {
            const files = [name];
            if (filename && !path.isAbsolute(name)) {
                files.unshift(path.resolve(path.join(path.dirname(filename), name)));
            }

            for (let i = 0; i < files.length; i++) {
                try {
                    return fs.readFileSync(files[i], { encoding: 'utf8' });
                } catch (e) {
                }
            }

            return null;
        };
    }

    public addIncludeResolver(resolver: TemplateResolver): void {
        this.templateResolvers.push(resolver);
    }

    public resolveTemplate(name: string, filename?: string): string | null {
        const resolvers = this.templateResolvers.concat([]);
        if (!resolvers.length) {
            if (this.defaultResolver) {
                resolvers.push(this.defaultResolver);
            }
        }

        for (let i = 0; i < resolvers.length; i++) {
            const resolver = resolvers[i];
            const result = resolver(name, filename);
            if (result) {
                return result;
            }
        }

        return null;
    }

    public static compile<T extends Record<string, unknown> = Record<string, unknown>>(
        string: string,
        filename?: string,
    ): FmplFn<T> {
        return new Fmpl().compile(string, filename);
    }

    public static render<T extends Record<string, unknown> = Record<string, unknown>>(
        str: string,
        values?: T,
        filename?: string,
    ) {
        return Fmpl.compile<T>(str, filename)(values);
    };

    public compile<T extends Record<string, unknown> = Record<string, unknown>>(
        stringToParse: string,
        filename?: string,
    ): FmplFn<T> {
        // {% if $expression %} {% else %} {% endif %}
        // {% for $expression %} {% endfor %}
        // {% while $expression %} {% endwhile %}
        // {% block name %} {% endblock %}
        // {% include '/path/to/file.txt' %}
        // {{- $expression }}
        // {{ $expression }}

        type Scope =
            'tagBlockName' |
            'blockExpression' |
            'echoedExpression' |
            'nonEchoedExpression' |
            'verbatim' |
            'includePath' |
            'endBlock' |
            'blockName';

        const stateStack: ParseState[] = [];

        interface ParseState {
            scope: Scope;
            value: string;
        }

        let code = '';

        let index = 0;
        let state: ParseState = {
            scope: 'verbatim',
            value: '',
        };
        stateStack.push(state);

        const pushState = (newScope: Scope): void => {
            if (state && state.scope === 'verbatim') {
                popState();
            }

            const newState: ParseState = {
                scope: newScope,
                value: '',
            };
            stateStack.push(newState);
            state = newState;
        };

        const popState = (): void => {
            const scope = state.scope;
            switch (scope) {
                case 'verbatim':
                    if (state.value) {
                        code += `${fnAppend}(${JSON.stringify(state.value)});\n`;
                    }
                    break;
                case 'echoedExpression':
                    code += `${fnAppend}(${state.value.trim()});\n`;
                    break;
                case 'nonEchoedExpression':
                    code += state.value.trim() + '\n';
                    break;
                case 'blockExpression':
                    code += '(' + state.value.trim() + ') {\n';
                    break;
                case 'includePath':
                    const includePath = state.value.trim();
                    const includedResult = this.resolveTemplate(includePath, filename);
                    if (!includedResult) {
                        throw new Error(`Unable to resolve template for include path "${includePath}"`);
                    }

                    // index + 1 to account for the closing "}"
                    // probably not the greatest, but it's okay to write garbage code if it's tested!
                    stringToParse = stringToParse.substring(0, index + 1) +
                        includedResult +
                        stringToParse.substring(index + 1);
                    break;
                case 'blockName':
                    code += `${fnOpenBlock}(${JSON.stringify(state.value.trim())});\n`;
                    break;
                case 'tagBlockName':
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
                    break;
                case 'endBlock':
                    break;
                default:
                    shouldNeverHappen(scope);
                    break;
            }

            stateStack.pop();
            if (!stateStack.length) {
                stateStack.push({
                    scope: 'verbatim',
                    value: '',
                });
            }

            state = stateStack[stateStack.length - 1];
        };

        let c: string;
        while (c = stringToParse.charAt(index)) {
            const next = stringToParse.charAt(index + 1);

            switch (c) {
                case '{':
                    if (state.scope === 'endBlock') {
                        throw new Error('expected %} but got {');
                    }

                    switch (next) {
                        case '%':
                        case '$':
                        case '{':
                            index++;

                            switch (next) {
                                case '%':
                                    pushState('tagBlockName');
                                    break;
                                case '$':
                                    pushState('nonEchoedExpression');
                                    break;
                                case '{':
                                    pushState('echoedExpression');
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
                    if (state.scope === 'endBlock') {
                        throw new Error('expected %} but got $');
                    }

                    if (state.scope === 'nonEchoedExpression' && next === '}') {
                        index++;
                        popState();
                    } else {
                        state.value += c;
                    }
                    break;
                case '}':
                    if (state.scope === 'endBlock') {
                        throw new Error('expected %} but got }');
                    }

                    if (state.scope === 'echoedExpression' && next === '}') {
                        index++;
                        popState();
                    } else {
                        state.value += c;
                    }
                    break;
                case '%':
                    if (next === '}') {
                        index++;
                        if (state.scope === 'verbatim') {
                            state.value += '%}';
                            break;
                        }

                        if (state.scope === 'endBlock') {
                            popState();
                            pushState('verbatim');
                        }

                        if (state.scope === 'blockExpression' ||
                            state.scope === 'blockName' ||
                            state.scope === 'includePath' ||
                            state.scope === 'endBlock') {
                            popState();
                            pushState('verbatim');
                        }
                    } else if (state.scope === 'endBlock') {
                        throw new Error('expected %} but got %' + next);
                    } else {
                        state.value += '%';
                    }
                    break;
                default:
                    if (state.scope === 'tagBlockName' && /\s/.test(c)) {
                        state.value = state.value.trim();
                        if (state.value) {
                            const stateValue = state.value;
                            popState();
                            switch (stateValue) {
                                case 'if':
                                case 'for':
                                case 'while':
                                    pushState('blockExpression');
                                    break;
                                case 'include':
                                    pushState('includePath');
                                    break;
                                case 'block':
                                    pushState('blockName');
                                    break;
                                case 'endif':
                                case 'endfor':
                                case 'endwhile':
                                case 'endblock':
                                case 'else':
                                    pushState('endBlock');
                                    break;
                                default:
                                    throw new Error('Unknown tag: "' + stateValue + '"');
                            }
                        }
                    } else if (state.scope === 'endBlock') {
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

        return new Function(varLocals, varOptions, funcDefinition) as FmplFn<T>;
    }

    public compileFile<T extends Record<string, unknown> = Record<string, unknown>>(
        filename: string,
        callback: (err: Error | null, result?: FmplFn<T> | null) => void,
    ): void {
        fs.readFile(filename, {encoding: 'utf8'}, (err: Error | null, contents: string) => {
            if (err) {
                callback(err);
                return;
            }

            let result: FmplFn<T>;
            try {
                result = this.compile(contents, filename);
            } catch (e) {
                callback(e);
                return;
            }

            callback(null, result);
        });
    }
}
