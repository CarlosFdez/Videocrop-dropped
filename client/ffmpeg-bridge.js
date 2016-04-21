const ipc = require('electron').ipcRenderer
const crypto = require('crypto')
const stream = require('stream')
const EventEmitter = require('events')

registeredStreams = {}

class FrameReader {
    constructor(token, filename, options) {
        this.token = token
        this.filename = filename
        this.options = options
        this._started = false;
        this._closed = false;
        this._handlers = []
        this._waiting = false;

        this._consuming = false; // todo: better naming
        this.emitter = new EventEmitter()
    }

    _handleNext(data) {
        this._waiting = false;
        if (this._handlers.length == 0) return;

        var firstHandler = this._handlers[0];
        if (firstHandler.skipUntil && !firstHandler.skipUntil(data)) {
            this._requestNextIfNeeded()
            return
        }

        try {
            var handler = this._handlers.shift()
            handler.handler(data);
        } finally {
            this._requestNextIfNeeded()
        }

    }

    _requestNextIfNeeded() {
        if (!this._closed && this._handlers.length > 0 && !this._waiting) {
            ipc.send('read-ffmpeg-frames-next', this.token)
            this._waiting = true;
        }
    }

    _performClose() {
        this._closed = true
        this.emitter.emit('close')
    }

    next(onData, skipUntil) {
        if (this._closed) {
            onData(null)
            return
        }

        this._handlers.push({
            handler: onData,
            skipUntil: skipUntil
        })

        if (!this._started) {
            ipc.send('read-ffmpeg-frames-request', this.token, this.filename, this.options || {})
            this._started = true;
            this._waiting = true;
        } else {
            this._requestNextIfNeeded()
        }


        return this
    }

    //
    _startAllConsume() {
        if (this._consuming) {
            return;
        }

        var consume = (data) => {
            this.emitter.emit('data', data)

            if (data && !this._closed) {
                this.next(consume)
            }
        }

        this._consuming = true;
        this.next(consume)
    }

    on(eventName, fn) {
        this.emitter.on(eventName, fn)
        if (eventName == 'data') {
            this._startAllConsume()
        }
    }

    close() {
        if (!this._closed) {
            ipc.send('read-ffmpeg-frames-stop', this.token)
            this._performClose() // assume it closed...
        }
    }
}

ipc.on('read-ffmpeg-frames-data', (evt, token, data) => {
    registeredStreams[token]._handleNext(data)
})

ipc.on('read-ffmpeg-frames-end', (evt, token) => {
    registeredStreams[token]._performClose()
})

module.exports.getFrames = function(filename, options) {
    if (filename == null) {
        throw "can't call getFrames with null filename"
    }

    var token = crypto.randomBytes(8).toString('hex')
    var fstream = new FrameReader(token, filename, options)
    registeredStreams[token] = fstream
    return fstream;
}
