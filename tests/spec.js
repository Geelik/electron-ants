const Application = require('spectron').Application;
const test = require('ava');
const electronPath = require('electron') ;// Require Electron from the binaries included in node_modules.
const path = require('path');

test.beforeEach(t => {
	t.context.app = new Application({
		path: electronPath,
		args: [path.join(__dirname, 'example/example.js')],
		env: {
			NODE_ENV: 'test'
		}
	});
	
	return t.context.app.start();
});

test.afterEach(t => {
	return t.context.app.stop();
});

test('Init app', t => {
	return t.context.app.client.getWindowCount().then(count => {
		t.is(count, 1);
	});
});