# fmpl

This is a template engine. 

[![Build Status](https://travis-ci.org/tmont/fmpl.svg?branch=master)](https://travis-ci.org/tmont/fmpl)
[![NPM version](https://img.shields.io/npm/v/fmpl.svg)](https://www.npmjs.com/package/fmpl)

## Naming
It's like "tmpl", only with an "F" instead of a "T". Use your
funning imagination to figure out what the "F" stands for.

## Installation
```
npm install fmpl
```

## Reasons
This solves a singular goal. That goal is to precompile templates
into an independent callable function. Only pug/ejs seem to do that
but pug is for HTML and ejs doesn't support template inheritance.

## Usage
```javascript
const Fmpl = require('fmpl');

//fancy usage
const fmpl = new Fmpl();
const fn = fmpl.compile(someTemplateString);
console.log(fn({ dem: 'vars' }));

//less fancy usage
console.log(Fmpl.render(someTemplateString, { dem: 'vars' }));
```

### From the command line
`fmpl` comes with a cli utility called `fmpl`. Run it from `node_modules/.bin/fmpl`.

```
fmpl [--verbose|-v] [--help|-h] [file] [file...]

fmpl is a fucking template engine that accepts a file and spits out a 
stringified JavaScript function to stdout. If no file is specified
then it reads from stdin. If "-" is given for the filename it will read
from stdin.

Options

--verbose|-v                         show debugging messages
--help|-g                            show this message

Brief syntax overview:

{{ expression }}                     echo the result of a JavaScript expression
{{- expression }}                    execute a JavaScript expression
{% if expression %}{% endif %}       basic if statement
{% for expression %}{% endfor %}     basic for loop
{% while expression %}{% endwhile %} basic while loop
{% block name %}{% endblock %}       create a block
{% include name %}                   include another template

Returns 0 if it worked, 1 if it didn't.
```

## Template Syntax
Quick and dirty: variables are in `{{ }}`, everything else is in
`{% %}`. Parentheses around if/else/for/while expressions are optional and discouraged.

### Variables/expressions
Any JavaScript expression can can be interpolated

Interpolate a variable:
```javascript
const tmpl = 'Hello {{ name }}';
Fmpl.render(tmpl, { name: 'yarp' }); //Hello yarp
```

Interpolate an expression:
```javascript
const tmpl = 'Hello {{ (() => { return \'yarp\'; }()) }}';
Fmpl.render(tmpl); //Hello yarp
```

### Arbitrary code
Sometimes you just want to set a variable or something.

`{{-` is the same as `{{` except that it won't echo the result.
```javascript
const tmpl = '{{- var name = \'yarp\'; }}Hello {{ name }}';
Fmpl.render(tmpl); //Hello yarp
```

### Control Flow
#### `if`/`else`
Parentheses are optional. `else` is optional.

```javascript
const tmpl = 'Hello {% if foo %}{{ foo }}{% else %}world{% endif %}';
Fmpl.render(tmpl, { foo: 'bar' }); //Hello bar
Fmpl.render(tmpl, { foo: '' });    //Hello world
```

#### `for`
Parentheses are optional.

Regular for loop:
```javascript
const tmpl = '{% for var i = 0; i < 3; i++ %}{{ String.fromCharCode(i + 65) }} {% endfor %}';
Fmpl.render(tmpl); //A B C
```

`for..in` loop:
```javascript
const tmpl = 'Hello {% for var fruit in fruits %}{{ fruit }} are {{ fruits[fruit] }} {% endfor %}';
Fmpl.render(tmpl, { fruits: { apples: 'red', bananas: 'yellow' }}); //apples are red bananas are yellow
```

#### `while`
Parentheses are optional

```javascript
const tmpl = '{{- var i = 0; }}{% while i < 3 %}{{ String.fromCharCode(i + 65) }}{{- i++ }} {% endwhile %}';
Fmpl.render(tmpl); //A B C
```

### Blocks
Blocks are blocks of content that you can declare and then override or append to.
Useful for template inheritance.

They are declared with `{% block <name of block> %}`, and referenced later the same way.

They can optionally have content. If they have a content, the default is to replace the content
if a block is referenced later. If you want to append content, add a "+" in front of the name, 
like so `{% block +<name of block> %}`.

Blocks are inserted into the content where they are initially declared.

```javascript
const tmpl = '{% block yarp %}{% endblock %} Hello {% block yarp %}block content{% endblock %}world';
Fmpl.render(tmpl); //block content Hello world
```

Appending content:
```javascript
const tmpl = '{% block yarp %}original content{% endblock %} Hello {% block +yarp %} new content{% endblock %}world';
Fmpl.render(tmpl); //original content new content Hello world
```

Blocks can be nested, and names from a parent block can be reused:
```javascript
const tmpl = `
{% block content %}{% endblock %}
This should be last in the rendered result.

{% block content %}
blox!
{% block content %}{% endblock %}
more blox!
{% block content %}i like blox{% endblock %}
{% endblock %}
`;

Fmpl.render(tmpl);
/*
blox!
i like blox
more blox!
This should be last in the rendered result.
 */
```

### Includes and template inheritance
Template inheritance can be accomplished by combining an `include` and a `block`.

Includes simply insert another template into the current template. You can use them
as many times as you want wherever you want. Try not to create a circular template or
else I'll kill your family. Not really though.

By default, included templates are resolved assuming they are file names. If this isn't ideal,
you can create your own resolver and load it into the `Fmpl` instance.

If an included template cannot be resolved, an error will be thrown.

```javascript
const parent = `
Some stuff at the top.

{% block content %}{% endblock %}

Some stuff at the bottom.`;

const child = `
{% include myParentTemplate %}

{% block content %}
This is in the middle!
{% endblock %}
`;

const fmpl = new Fmpl();
fmpl.addIncludeResolver((name) => {
  if (name === 'myParentTemplate') {
  	return parent;
  }
  
  return null;
});

fmpl.compile(child)();
/*
Some stuff at the top.

This is in the middle!

Some stuff at the bottom.
 */
```

## Internals
Internally it appends a bunch of stuff to a string and then dynamically
creates a callable function using the `Function` constructor. Code you write
in your template (e.g. in an `if` statement) is inserted verbatim and will
throw syntax errors if it sucks.

Variables for internal use are prefixed with `____` (four underscores) so if you
do something like `{{- ____render = null; }}` nothing will work. Try not do that.
