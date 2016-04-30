const EventEmitter = require('events');
const ffmpeg = require('./ffmpeg-bridge')

class VideoPlayer extends EventEmitter {
    constructor(previewPane) {
        super()

        this.previewPane = $(previewPane)
        this.videoPane = new VideoPane(this.previewPane.find('video')[0])
        this.slider = new PlayerSlider(this.previewPane.find('.scrub')[0], this)
        this.statusBar = new StatusBar(this.previewPane.find('.status-bar'), this.videoPane)

        this.mode = VideoPlayer.Mode.NORMAL

        this.videoPane.element.addEventListener('click', () => {
            this.togglePlaying();
        });

        this.emit('init')
    }

    setVideo(video) {
        this.videoPane.setVideo(video)

        // the javascript event will take care of the rest
        this.videoPane.once('loadedmetadata', () => {
            this.video = video
            this.slider.setVideo(video)
            this.statusBar.video = video
            this.previewPane.addClass('loaded')
        });
    }

    get currentTime() {
        return this.videoPane.currentTime
    }

    set currentTime(newTime) {
        this.videoPane.currentTime = newTime;
    }

    play() {
        this.videoPane.play()
    }

    pause() {
        this.videoPane.pause()
    }

    togglePlaying() {
        this.videoPane.togglePlaying()
    }

    get mode() {
        return this._mode
    }

    set mode(mode) {
        this._mode = mode
        this.emit('mode-changed', mode)
    }
}

VideoPlayer.Mode = {
    NORMAL: 1,
    CUT: 2
}

module.exports = VideoPlayer;

// used internally by VideoPane
class AudioElementController extends EventEmitter {
    constructor() {
        super()

        this.audioElement = document.createElement("audio")
        this._track = 0
        this._threshold = 40 // stop loading additional frames when we have this many left

        // todo: allow this to be deleted if we want to prevent leaks
        this._requestingFrame = false;
        this._interval = window.setInterval(() => {
            if (!this.video) return;
            if (!this.sourceBuffer) return;
            if (this.sourceBuffer.updating) return;
            if (this._requestingFrame) return;
            if (this.bufferedDataAvailable > this._threshold) return;

            var currentBuffer = this._getBufferedTimeRange(this.currentTime)
            if (currentBuffer && currentBuffer.end >= this.duration) return;

            var defaultStart = (this.currentTime - this.currentTime % 5) || 0;
            var startTime = (currentBuffer) ? currentBuffer.end : defaultStart

            this._requestFrame(startTime, 5)
        }, 10);

        this.mediaSource = new MediaSource()
        this.audioElement.src = URL.createObjectURL(this.mediaSource)

        this.mediaSource.addEventListener('sourceopen', (evt) => {
            if (evt.target != this.mediaSource) return; // this was a double restartBuffering()
            this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/aac')

            this.sourceBuffer.addEventListener('updateend', (evt) => {
                if (evt.target != this.sourceBuffer) return; // this was a double restartBuffering()
                //this.sourceBuffer.timestampOffset += 5
                this.emit('buffer-updated')
            })

            // start buffering
        });

        this.audioElement.addEventListener('seeked', (evt) => {
            this.emit('seeked', this.currentTime)
        })
    }

    _requestFrame(startAt, duration) {
        if (this._requestingFrame) {
            console.log('double requesting - debug why this is happening')
            return
        }

        this._requestingFrame = true;

        var frame = {
            track: this._track,
            startAt: startAt,
            endAt: Math.min(startAt + duration, this.duration),
            data: null
        }

        var path = "audio-packet://" + this.video.filename +
            "?start=" + startAt + "&duration=" + this.frameDuration + "&track=" + this._track
        var xhr = new XMLHttpRequest
        xhr.open('get', path)
        xhr.responseType = 'arraybuffer'
        xhr.onload = () => {
            this._requestingFrame = false

            // if the audio track changed, its no longer valid
            if (frame.track != this.track) {
                return; // do nothing
            }

            var arr = new Uint8Array(xhr.response)
            frame.data = arr

            // start at?
            this.sourceBuffer.timestampOffset = frame.startAt
            this.sourceBuffer.appendWindowEnd = frame.endAt
            console.log('append start' + frame.startAt  + ' append end ' + frame.endAt)
            this.sourceBuffer.appendBuffer(frame.data)
        };
        xhr.send();
    }

    _getBufferedTimeRange(position) {
        if (!this.sourceBuffer) return null
        var buffered = this.sourceBuffer.buffered
        for (let i = 0; i < buffered.length; i++) {
            let start = buffered.start(i)
            let end = buffered.end(i)
            if (start <= position && end >= position) {
                return { start: start, end: end }
            }
        }
        return null;
    }

    // returns if there is enough data to play
    get hasEnoughData() {
        // todo: handle end of stream
        return this.bufferedDataAvailable > 3
    }

    get bufferedDataAvailable() {
        var range = this._getBufferedTimeRange(this.currentTime)
        if (range == null) return 0;
        return range.end - this.currentTime
    }

    get track() {
        return this._track
    }

    set track(newTrack) {
        this._track = newTrack
        if (this.sourceBuffer.updating) {
            this.once('buffer-updated', () => { this.track = newTrack })
        } else {
            this.sourceBuffer.remove(0, this.video.duration)
        }
    }

    get currentTime() {
        return this.audioElement.currentTime
    }

    set currentTime(newTime) {
        this.audioElement.currentTime = newTime
    }

    get duration() {
        return this.video.duration
    }

    get durationRemaining() {
        var range = this._getBufferedTimeRange(this.currentTime)
        console.log(range)
        if (range) {
            return range.end - this.currentTime
        }
        return 0
    }

    startBuffering(onCanStart) {
        if (!this.hasEnoughData) {
            this.once('buffer-updated', () => this.startBuffering(onCanStart))
        } else if (this.audioElement.seeking) {
            this.once('seeked', () => this.startBuffering(onCanStart))
        } else {
            onCanStart()
        }
    }

    play() {
        this.audioElement.play()
    }

    pause() {
        this.audioElement.pause()
    }

    set video(video) {
        this._video = video
        this.mediaSource.duration = this._video.duration
    }

    get video() {
        return this._video;
    }
}

class VideoPane extends EventEmitter {
    constructor(element) {
        super();

        this.element = element
        this.element.muted = true
        this.audio = new AudioElementController(this)

        this.desyncCorrection = 0
        var desyncThreshold = 0.01

        this.element.addEventListener('loadedmetadata', () => {
            this.emit('loadedmetadata')
        })
        this.element.addEventListener('timeupdate', () => {
            this.emit('timeupdate', this.element.currentTime)

            if (Math.abs(this.audio.currentTime - this.currentTime) > desyncThreshold) {
                console.log('desync corrected' + this.element.currentTime + ' | ' + this.audio.currentTime)
                this.audio.currentTime = this.element.currentTime + 0.05
            }
        })

        this._nextTime = null;
        this.element.addEventListener('seeked', () => {
            if (this._nextTime) {
                this.element.currentTime = this._nextTime
                this._nextTime = null
            }
            this.emit('seeked', this.element.currentTime)
        })
    }

    setVideo(video) {
        this.video = video
        this.element.src = video.filename
        this.audio.video = video
    }

    togglePlaying() {
        if (this.element.paused) {
            this.play();
        } else {
            this.pause();
        }
    }

    play() {
        // todo: check for unplayable regions (maybe)?
        if (this.element.paused) {
            this.audio.currentTime = this.currentTime
            this.audio.startBuffering(() => {
                this.audio.play()
                this.element.play()
            })
        }
    }

    pause() {
        if (!this.element.paused) {
            this.element.pause();
            this.audio.pause();
        }
    }

    get ratio() {
        return this.currentTime / this.video.duration;
    }

    get currentTime() {
        return this._nextTime || this.element.currentTime;
    }

    set currentTime(newTime) {
        var accuracy = 1000 // only up to millisecond accuracy
        newTime = Math.ceil(newTime * accuracy) / accuracy
        if (this.element.seeking) {
            this._nextTime = newTime;
        } else {
            this.element.currentTime = newTime;
        }
        this.audio.currentTime = newTime;
    }

    incrementFrame() {
        this.currentTime = this.video.nextKeyframe(this.currentTime)
    }

    decrementFrame() {
        this.currentTime = this.video.previousKeyframe(this.currentTime)
    }
}

class PlayerSlider {
    constructor(element, player) {
        this.canvas = element
        this.player = player
        this.videoPane = player.videoPane
        this.context = this.canvas.getContext('2d')
        this.startRenderLoop()

        this._addNormalModeEvents()
        this._addCutModeEvents()
    }

    _addNormalModeEvents() {
        var player = this.player;
        $(this.canvas).on('mousedown', (evt) => {
            if (player.mode != VideoPlayer.Mode.NORMAL) return;
            if (evt.which != 1) return;

            var timestamp = this._timestampAt(evt.clientX)
            this.videoPane.currentTime = timestamp;
        });

        $(this.canvas).on('mousemove', (evt) => {
            if (player.mode != VideoPlayer.Mode.NORMAL) return;
            if (evt.which != 1) return;

            var timestamp = this._timestampAt(evt.clientX)
            this.videoPane.currentTime = timestamp;
        });

        $(this.canvas).on('mouseup', (evt) => {
            if (player.mode != VideoPlayer.Mode.NORMAL) return;
        });

        // todo: handle mode switch for mode switch while dragging
    }

    _addCutModeEvents() {
        var player = this.player;
        $(this.canvas).on('mousedown', (evt) => {
            if (player.mode != VideoPlayer.Mode.CUT) return;
            if (evt.which != 1) return;

            var timestamp = this._timestampAt(evt.clientX)
            this.video.regions.splitAt(timestamp)
        });
    }

    setVideo(video) {
        this.video = video;
    }

    startRenderLoop() {
        this.render();
        requestAnimationFrame(() => this.startRenderLoop());
    }

    _timestampAt(xCoordinate) {
        return (xCoordinate / this.canvas.width) * this.video.duration
    }

    _positionOf(timestamp) {
        return Math.floor((timestamp / this.video.duration) * this.canvas.width)
    }

    render() {
        if (!this.video) return;

        var video = this.video;
        var canvas = this.canvas;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // update canvas size if necessary. updates refresh the canvas
        if (canvas.width != canvas.clientWidth || canvas.height != canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        // function shortcut cause its used very often here...
        var positionOf = this._positionOf.bind(this)

        // The height of the core section including range boxes
        var mainHeight = Math.floor(canvas.height * 0.8)
        // the height of the section above the mainHeight
        var gutterHeight = canvas.height - mainHeight;

        var thickness = 2; // todo: make configurable

        // draw range boxes
        if (this.video && this.video.regions) {
            ctx.fillStyle = "#4488FF"
            for (let region of this.video.regions.regions) {
                let start = positionOf(region.start)
                let end = positionOf(region.end)
                ctx.fillRect(start, gutterHeight, end-start, mainHeight)
            }

            ctx.fillStyle = "#002277"
            for (let region of this.video.regions.regions) {
                let start = positionOf(region.start)
                let end = positionOf(region.end)

                // left border
                ctx.fillRect(start, gutterHeight, thickness, canvas.height)

                // right border
                ctx.fillRect(end - thickness, gutterHeight, thickness, canvas.height)
            }
        }

        // draw seek marker line
        var linePosition = positionOf(this.videoPane.currentTime);
        var lineDrawStart = linePosition - Math.floor(thickness/2);
        ctx.fillStyle = "red";
        ctx.fillRect(lineDrawStart, 0, thickness, canvas.height);
        ctx.beginPath();
        ctx.moveTo(lineDrawStart, gutterHeight);
        ctx.lineTo(lineDrawStart - gutterHeight/2, 0);
        ctx.lineTo(lineDrawStart + thickness + gutterHeight/2, 0);
        ctx.lineTo(lineDrawStart + thickness, gutterHeight);
        ctx.fill();
    }
}

class StatusBar {
    constructor(element, videoPane) {
        this._element = $(element);

        videoPane.on('timeupdate', () => {
            this.currentTime = videoPane.currentTime
        })
    }

    get video() {
        return this._video;
    }

    set video(video) {
        this._video = video;
        this._element.find('.totalDuration').text(video.duration);
    }

    set currentTime(newTime) {
        this._element.find('.currentTime').text(newTime);
    }
}
