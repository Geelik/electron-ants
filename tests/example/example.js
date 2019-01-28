const { app, BrowserWindow } = require('electron');
const path = require('path');
const Ant = require('../../src/index');
let win;

function createWindow () {

	win = new BrowserWindow({
		width: 800,
		height: 600
	});
	win.loadFile(`${path.resolve(__dirname, 'index.html')}`);
	
	//Init the main process for workers
	Ant.Worker.init(path.resolve(__dirname, 'worker/worker.html'), win);
	
	if ((!process.env.NODE_ENV || process.env.NODE_ENV !== 'test'))
		win.webContents.openDevTools();
	
	win.on('close', () => {
		win = null;
	})
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
});

app.on('activate', () => {
	if (win === null) {
		createWindow()
	}
});