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

	it('should render variable value', () => {
		expect(renderToString('{{ foo }}', { foo: 'bar' })).to.equal('bar');
	});

	it('should render js expression', () => {
		expect(renderToString('{{ foo || (function() { return \'baz\'; })() }}', { foo: null })).to.equal('baz');
	});

	it('should render if statement', () => {
		const tmpl = compile('{% if foo %}hello {% endif %}world');
		expect(tmpl({ foo: true })).to.equal('hello world');
		expect(tmpl({ foo: false })).to.equal('world');
	});

	it('should render for loop', () => {
		expect(renderToString('{% for var i = 0; i < 3; i++ %}{{ i }} yarp {% endfor %}'))
			.to.equal('0 yarp 1 yarp 2 yarp ');
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
});
