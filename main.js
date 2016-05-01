'use strict';

const electron = require('electron');
const ipc = electron.ipcMain
const app = electron.app;
const dialog = electron.dialog;
const BrowserWindow = electron.BrowserWindow
const VideoServer = require('./video-server')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow = null;
var videoServer = new VideoServer()

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
    mainWindow = new BrowserWindow({width: 1200, height: 900})
    mainWindow.setMenu(null)

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + __dirname + '/client/index.html')

    // Open the DevTools.
    mainWindow.webContents.openDevTools()

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });

    // events
    ipc.on('open-video-request', (evt, filename) => {
        if (filename == null) {
            var files = dialog.showOpenDialog(mainWindow);
            if (!files) return;
            filename = files[0]
        }

        mainWindow.send('loading', filename);
        videoServer.openVideo(filename, (result) => {
            mainWindow.send('loaded-metadata', result)
        })
    });

    ipc.on('export-video', (evt, exportSettings) => {
        mainWindow.send('debug-log', 'do export later')
    })

    videoServer.bindToElectron(ipc, mainWindow)
});
