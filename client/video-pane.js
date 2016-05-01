const EventEmitter = require('events')

function roundAtMilliseconds(seconds) {
    var accuracy = 1000 // only up to millisecond accuracy
    return Math.ceil(seconds * accuracy) / accuracy
}

class VideoPane extends EventEmitter {
    constructor(element) {
        super();

        this.element = element
        this.element.muted = true
        this.audio = new AudioElementController(this)

        this.desyncCorrection = 0
        var desyncThreshold = 0.01
        var forceCorrectionThreshold = 1.0

        this.element.addEventListener('loadedmetadata', () => {
            this.emit('loadedmetadata')
        })
        this.element.addEventListener('timeupdate', () => {
            this.emit('timeupdate', this.element.currentTime)

            var videoAheadTime = this.currentTime - this.audio.currentTime
            if (Math.abs(videoAheadTime) > forceCorrectionThreshold) {
                console.log('massive desync corrected' + this.element.currentTime + ' | ' + this.audio.currentTime)
                this.audio.currentTime = this.element.currentTime + desyncThreshold
            } else if (Math.abs(videoAheadTime) > desyncThreshold) {
                if (videoAheadTime < 0) {
                    // audio is ahead, minor fix (todo: do something other than force correction)
                    console.log('correcting audio ahead')
                    this.audio.currentTime = this.element.currentTime + desyncThreshold
                } else {
                    // video is ahead, pause video using playback rate for almost the length of time
                    console.log('correcting audio behind, pause for a bit')
                    var originalPlaybackRate = this.element.playbackRate
                    this.element.playbackRate = 0
                    window.setTimeout(() => {
                        this.element.playbackRate = originalPlaybackRate
                    }, (videoAheadTime - (desyncThreshold / 3)) * 1000)
                }
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
        this.pause()
        this.video = video
        this.element.src = video.filename
        this.audio.video = video
        this.currentTime = 0
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

        // javascript video player gets glitchy at higher amounts of precision
        // this will allow it to *snap*
        this.currentTime = this.element.currentTime
    }

    get ratio() {
        return this.currentTime / this.video.duration;
    }

    get currentTime() {
        // round to milliseconds for appearance sake
        return roundAtMilliseconds(this._nextTime || this.element.currentTime);
    }

    set currentTime(newTime) {
        newTime = roundAtMilliseconds(newTime)
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

module.exports = VideoPane

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
