'use strict';

const expect = require('expect.js');
const path = require('path');
const Fmpl = require('../');

describe('fmpl', () => {
	let fmpl;

	function renderToString(tmpl, values) {
		return Fmpl.render(tmpl, values);
	}

	function compile(tmpl) {
		return Fmpl.compile(tmpl);
	}

	beforeEach(() => {
		fmpl = new Fmpl();
	});

	it('should allow "%} in verbatom', () => {
		expect(renderToString('hello %}')).to.equal('hello %}');
	});

	it('should render variable value', () => {
		expect(renderToString('{{ foo }}', { foo: 'bar' })).to.equal('bar');
	});

	it('should render js expression', () => {
		expect(renderToString('{{ foo || (function() { return \'baz\'; })() }}', { foo: null })).to.equal('baz');
	});

	it('should allow code in expression', () => {
		expect(renderToString('{$ var foo = \'bar\'; $}{{ foo }}')).to.equal('bar');
	});

	it('should render if statement', () => {
		const tmpl = compile('{% if foo %}hello {% endif %}world');
		expect(tmpl({ foo: true })).to.equal('hello world');
		expect(tmpl({ foo: false })).to.equal('world');
	});

	it('should render else statement', () => {
		const tmpl = compile('{% if foo %}hello{% else %}goodbye{% endif %} world');
		expect(tmpl({foo: true})).to.equal('hello world');
		expect(tmpl({foo: false})).to.equal('goodbye world');
	});

	it('should render for loop', () => {
		expect(renderToString('{% for var i = 0; i < 3; i++ %}{{ i }} yarp {% endfor %}'))
			.to.equal('0 yarp 1 yarp 2 yarp ');
	});

	it('should render for..in loop', () => {
		const tmpl = '{% for var fruit in fruits %}{{ fruit }} are {{ fruits[fruit] }} {% endfor %}';
		expect(renderToString(tmpl, {fruits: {apples: 'red', bananas: 'yellow'}}))
			.to.equal('apples are red bananas are yellow ');
	});

	it('should render while loop', () => {
		expect(renderToString('{% while i-- %}{{ i }} yarp {% endwhile %}', { i: 3 }))
			.to.equal('2 yarp 1 yarp 0 yarp ');
	});

	it('should render single block with content', () => {
		const tmpl = 'foo {% block yarp %}bar{% endblock %}';
		expect(renderToString(tmpl)).to.equal('foo bar');
	});

	it('should render block with appended content', () => {
		const tmpl = 'foo {% block yarp %}bar{% endblock %} qux{% block +yarp %}baz{% endblock %}';
		expect(renderToString(tmpl)).to.equal('foo barbaz qux');
	});

	it('should render block with replaced content', () => {
		const tmpl = 'foo {% block yarp %}bar{% endblock %}{% block yarp %}baz{% endblock %}';
		expect(renderToString(tmpl)).to.equal('foo baz');
	});

	it('should render nested blocks', () => {
		const tmpl = 'foo {% block yarp %}1 {% block narp %}2 {% block parp %}3 {% endblock %}4 {% endblock %}5{% endblock %}';
		expect(renderToString(tmpl)).to.equal('foo 1 2 3 4 5');
	});

	it('should render nested blocks with same name', () => {
		const tmpl = 'foo {% block yarp %}1 {% block yarp %}2 {% endblock %}3{% endblock %}';
		expect(renderToString(tmpl)).to.equal('foo 1 2 3');
	});

	it('should render nested blocks with appended content', () => {
		const tmpl = 'foo {% block yarp %}1 {% block yarp %}2 {% endblock %}4 {% block +yarp %}3 {% endblock %}5{% endblock %}';
		expect(renderToString(tmpl)).to.equal('foo 1 2 3 4 5');
	});

	it('should render included template with blocks', () => {
		fmpl.addIncludeResolver((name) => {
			switch (name) {
				case 'lol':
					return 'yarp {% block datblock %}{% endblock %}';
				default:
					throw new Error('wtf');
			}
		});

		const text = 'foo {% include lol %} bar {% block datblock %}hello world{% endblock %}';
		const tmpl = fmpl.compile(text);

		expect(tmpl()).to.equal('foo yarp hello world bar ');
	});

	it('should render included template from file by default', () => {
		const file = path.join(__dirname, 'includes', 'yarp.txt');
		const text = `foo {% include ${file} %} bar`;
		const tmpl = fmpl.compile(text);
		expect(tmpl()).to.equal('foo yarp\n bar');
	});

	it('should blow up if included template cannot be found', () => {
		const text = 'foo {% include lol %} bar {% block datblock %}hello world{% endblock %}';
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', 'Unable to resolve template for include path "lol"');
		});
	});

	it('should allow disabling the default resolver', () => {
		const file = path.join(__dirname, 'includes', 'yarp.txt');
		const text = `{% include ${file} %}`;
		fmpl.defaultResolver = null;
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', `Unable to resolve template for include path "${file}"`);
		});
	});

	it('should blow up if "{" occurs at the end of a tag block', () => {
		const text = '{% endif { %}';
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', 'expected %} but got {');
		});
	});

	it('should blow up if "}" occurs at the end of a tag block', () => {
		const text = '{% endif } %}';
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', 'expected %} but got }');
		});
	});

	it('should blow up if "$" occurs at the end of a tag block', () => {
		const text = '{% endif $ %}';
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', 'expected %} but got $');
		});
	});

	it('should blow up if "%" occurs at the end of a tag block without a following "}"', () => {
		const text = '{% endif % %}';
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', 'expected %} but got % ');
		});
	});

	it('should blow up if an unknown tag is used', () => {
		const text = '{% lol %}';
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', 'Unknown tag: "lol"');
		});
	});

	it('should blow up if random character occurs before tag end', () => {
		const text = '{% endfor a %}';
		expect(() => fmpl.compile(text)).to.throwError((err) => {
			expect(err).to.have.property('message', 'expected %} but got "a"');
		});
	});

	it('should allow % in verbatim', () => {
		const text = '100%';
		expect(renderToString(text)).to.equal('100%');
	});

	it('should allow $ in verbatim', () => {
		const text = '$100';
		expect(renderToString(text)).to.equal('$100');
	});

	it('should allow whitespace before tag end', () => {
		const text = '{% if true %}{% endif \n\t  %}';
		expect(renderToString(text)).to.equal('');
	});

	it('should compile from file', (done) => {
		const file = path.join(__dirname, 'includes', 'tmpl.txt');
		fmpl.compileFile(file, (err, tmpl) => {
			expect(err).to.be(null);
			expect(tmpl()).to.equal('hello world\n');
			done();
		});
	});

	it('should compile from file and use filename for includes', (done) => {
		const file = path.join(__dirname, 'includes', 'includes-yarp.txt');
		fmpl.compileFile(file, (err, tmpl) => {
			expect(err).to.be(null);
			expect(tmpl()).to.equal('yarp\n\n');
			done();
		});
	});

	it('should compile from file and handle compilation error', (done) => {
		const file = path.join(__dirname, 'includes', 'bad.txt');
		fmpl.compileFile(file, (err, tmpl) => {
			expect(err).to.not.be(null);
			expect(tmpl).to.be(null);
			done();
		});
	});

	it('should compile from file and handle fs error', (done) => {
		const file = path.join(__dirname, 'includes', 'narp.txt');
		fmpl.compileFile(file, (err, tmpl) => {
			expect(err).to.not.be(null);
			expect(tmpl).to.not.be.ok();
			done();
		});
	});

	describe('whitespace trimming', () => {
		it('should trim whitespace for non-echoed expression', () => {
			expect(renderToString('   {$- var foo = \'bar\'; $}{{ foo }}')).to.equal('bar');
		});

		it('should trim whitespace for echoed expression', () => {
			expect(renderToString('   {{- "bar" }}')).to.equal('bar');
		});

		it('should trim whitespace for if statement', () => {
			expect(renderToString('   {%- if true %}bar{% endif %}')).to.equal('bar');
		});

		it('should trim whitespace for for loop', () => {
			expect(renderToString('   {%- for var i = 0; i < 1; i++ %}bar{% endfor %}')).to.equal('bar');
		});

		it('should trim whitespace for while loop', () => {
			expect(renderToString('   {%- while true %}bar{$ break; $}{% endwhile %}')).to.equal('bar');
		});

		it('should trim whitespace for block', () => {
			expect(renderToString('   {%- block content %}bar{% endblock %}')).to.equal('bar');
		});

		it('should not trim whitespace if previous thing was a block', () => {
			expect(renderToString('{% block content %}bar {% endblock %}{$- $}')).to.equal('bar ');
		});

		it('should trim whitespace for closing block tag', () => {
			expect(renderToString('{% block content %}bar {%- endblock %}')).to.equal('bar');
		});

		it('should trim whitespace for include', () => {
			const file = path.join(__dirname, 'includes', 'yarp.txt');
			expect(renderToString(`   {%- include ${file} %}`)).to.equal('yarp\n');
		});
	});
});
