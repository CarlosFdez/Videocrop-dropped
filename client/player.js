const EventEmitter = require('events');

class VideoPlayer {
    constructor(previewPane) {
        this.previewPane = $(previewPane);
        this.videoPane = new VideoPane(this.previewPane.find('video')[0]);
        this.slider = new PlayerSlider(this.previewPane.find('.scrub')[0], this.videoPane)
        this.statusBar = new StatusBar(this.previewPane.find('.status-bar'));

        this.videoPane.on('timeupdate', () => {
            this.statusBar.currentTime = this.videoPane.currentTime;
        });
        this.videoPane.element.addEventListener('click', () => {
            this.togglePlaying();
        });
    }
    setVideo(video) {
        this.videoPane.setVideo(video);

        this.videoPane.once('loadedmetadata', () => {
            this.video = video;
            this.slider.setVideo(video);
            this.statusBar.video = video;
            this.previewPane.addClass('loaded');
        });
        // the javascript event listener will take care of the rest
    }
    togglePlaying() {
        this.videoPane.togglePlaying();
    }
}

module.exports = VideoPlayer;

class VideoPane extends EventEmitter {
    constructor(element) {
        super();

        this.element = element;

        this._nextTime = null;
        this.element.addEventListener('loadedmetadata', () => {
            this.emit('loadedmetadata');
        })

        this.element.addEventListener('seeked', () => {
            if (this._nextTime) {
                this.element.currentTime = this._nextTime;
                this._nextTime = null;
            }
        });
        this.element.addEventListener('timeupdate', () => {
            this.emit('timeupdate', this.element.currentTime);
        });
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

    // todo: move this function to some throttler
    _setCurrentTimeThrottled(newTime) {
        if (this.element.seeking) {
            this._nextTime = newTime;
        } else {
            this.element.currentTime = newTime;
        }
    }

    get ratio() {
        return this.element.currentTime / this.video.duration;
    }

    get currentTime() {
        return this.element.currentTime;
    }

    set currentTime(newTime) {
        var newTime = this.video.currentFrame(newTime); // snap to frame
        this._setCurrentTimeThrottled(newTime);
    }

    incrementFrame() {
        var nextTime = this.video.nextFrame(this.currentTime);
        this._setCurrentTimeThrottled(nextTime);
    }

    decrementFrame() {
        var nextTime = this.video.previousFrame(this.currentTime);
        this._setCurrentTimeThrottled(nextTime);
    }
}

class PlayerSlider {
    constructor(element, videoPane) {
        this.canvas = element;
        this.videoPane = videoPane;
        this.context = this.canvas.getContext('2d');
        this.startRenderLoop();

        // todo: events probably should be moved
        $(this.canvas).on('mousedown mousemove', (evt) => {
            if (evt.which != 1) return;

            var ratio = evt.clientX / this.canvas.clientWidth;
            videoPane.currentTime = this.video.duration * ratio;
        });
    }

    setVideo(video) {
        this.video = video;
    }

    startRenderLoop() {
        this.render();
        requestAnimationFrame(() => this.startRenderLoop());
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

        var mainHeight = Math.floor(canvas.height * 0.8)
        var gutterHeight = canvas.height - mainHeight;

        // draw seek marker line
        var thickness = 2; // todo: make configurable
        var linePosition = Math.floor(this.videoPane.ratio * canvas.width);
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
    constructor(element) {
        this._element = $(element);
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
