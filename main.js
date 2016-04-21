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

function registerFfmpegFrameReader(ipc, mainWindow) {
    var streams = {}

    ipc.on('read-ffmpeg-frames-next', (evt, token) => {
        streams[token].resume()
    })

    ipc.on('read-ffmpeg-frames-stop', (evt, token) => {
        if (streams[token]) {
            streams[token].kill()
        }
    })

    // todo: error handling
    ipc.on('read-ffmpeg-frames-request', (evt, token, filename, options) => {
        mainWindow.send('debug-log', 'filename: ' + filename)
        mainWindow.send('debug-log', options)
        var fstream = loader.getFrameStream(filename, options)
        streams[token] = fstream
        fstream.on('data', (data) => {
            mainWindow.send('read-ffmpeg-frames-data', token, data)
            fstream.pause()
        })
        fstream.on('error', (err) => {
            throw err // todo: propogate instead
        })
        function close() {
            mainWindow.send('read-ffmpeg-frames-end', token)
            streams[token] = undefined
        }
        fstream.on('end', close)
        fstream.on('close', close)
        fstream.on('disconnect', close)
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 1200, height: 900});

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + __dirname + '/client/index.html');

    // Open the DevTools.
    mainWindow.webContents.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });

    //var filename = null;

    // events
    ipc.on('open-video-request', () => {
        var files = dialog.showOpenDialog(mainWindow);
        if (!files) return;

        //filename = files[0];

        mainWindow.send('loading', files[0]);
        loader.loadMetadata(files[0], (err, metadata) => {
            if (err) return;
            mainWindow.send('loaded-metadata', metadata);
        });

    });


    registerFfmpegFrameReader(ipc, mainWindow);
});
