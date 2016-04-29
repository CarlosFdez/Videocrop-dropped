const electron = require('electron')
const loader = require('./video-loader')
const crypto = require('crypto')

class VideoServer {
    constructor() {
    }

    bindToElectron(ipcMain, mainWindow) {
        this.ipc = ipcMain
        this.mainWindow = mainWindow

        // set ipc bindings
        registerFfmpegFrameReader(this, this.ipc, this.mainWindow)
        registerTrackReading(this, this.mainWindow)
    }
    openVideo(filename, onLoad) {
        loader.loadMetadata(filename, (err, metadata) => {
            if (err) return;
            onLoad(metadata);
        });
    }
}

function registerFfmpegFrameReader(server, ipc, mainWindow) {
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
        mainWindow.send('debug-log', 'read: ' + filename)
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

function registerTrackReading(server, mainWindow) {
    function parseQueryStringParams(queryString) {
        var results = {}
        if (!queryString) {
            return results;
        }

        var fragments = queryString.split('&')
        for (let fragment of fragments) {
            if (fragment.indexOf('=') == -1) {
                results[fragment.trim()] = true;
            } else {
                var args = fragment.split('=');
                results[args[0].trim()] = args[1].trim()
            }
        }

        return results
    }


    var protocolName = 'audio-packet'
    electron.protocol.registerBufferProtocol(protocolName, (request, callback) => {
        var params = {}
        var filename = request.url.substr(protocolName.length + 3); // removes protocol name

        let queryStringStart = filename.indexOf('?')
        if (queryStringStart != -1) {
            params = parseQueryStringParams(filename.substring(queryStringStart + 1))
            filename = filename.substring(0, queryStringStart)
        }

        var track = parseInt(params['track'] || '0') || 0
        var start = parseFloat(params['start'] || '0') || 0
        var duration = parseFloat(params['duration'] || '5') || 5

        mainWindow.send('debug-log', "filename: " + filename + " start: " + start + " duration: " + duration)
        var stream = loader.getAudioStream(filename, track, { seekTo: start, duration: duration })

        var chunks = []
        stream.on('data', (chunk) => {
            chunks.push(new Buffer(chunk))
        })
        stream.on('error', (err) => {
            mainWindow.send('debug-log', 'error')
            mainWindow.send('debug-log', err)
        })
        stream.on('end', () => {
            mainWindow.send('debug-log', 'hello')
            callback(Buffer.concat(chunks))
        })
    })
}


module.exports = VideoServer
