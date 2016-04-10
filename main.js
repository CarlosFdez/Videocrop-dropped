'use strict';

const electron = require('electron');
const ipc = electron.ipcMain
const app = electron.app;
const dialog = electron.dialog;
const BrowserWindow = electron.BrowserWindow;

const loader = require('./video-loader');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow = null;

app.on('window-all-closed', () => {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform != 'darwin') {
		app.quit();
	}
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
	// Create the browser window.
	mainWindow = new BrowserWindow({width: 1200, height: 900});

	// and load the index.html of the app.
	mainWindow.loadURL('file://' + __dirname + '/client/index.html');

	// Open the DevTools.
	//mainWindow.webContents.openDevTools();

	// Emitted when the window is closed.
	mainWindow.on('closed', () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null;
	});

	// events
	ipc.on('open-video-request', () => {
		var files = dialog.showOpenDialog(mainWindow);
		if (!files) return;

		mainWindow.send('loading', files[0]);
		loader.loadMetadata(files[0], (err, metadata) => {
			if (err) return;
			mainWindow.send('loaded-metadata', metadata);
			loader.getVideoData(files[0], (err, videoData) => {
				videoData.metadata = metadata;
				mainWindow.send('open-video', videoData, err);
			});
		});

	});
});
