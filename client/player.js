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

class VideoPane extends EventEmitter {
    constructor(element) {
        super();

        this.element = element;

        this.element.addEventListener('loadedmetadata', () => {
            this.emit('loadedmetadata');
        })
        this.element.addEventListener('timeupdate', () => {
            this.emit('timeupdate', this.element.currentTime);
        })

        this._nextTime = null;
        this.element.addEventListener('seeked', () => {
            if (this._nextTime) {
                this.element.currentTime = this._nextTime;
                this._nextTime = null;
            }
        })
    }

    setVideo(video) {
        this.video = video;
        this.element.src = video.filename;
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
        this.element.play();
    }

    pause() {
        if (!this.element.paused)
            this.element.pause();
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
