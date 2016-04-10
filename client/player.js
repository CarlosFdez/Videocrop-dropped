class VideoPlayer {
    constructor(previewPane) {
        this.previewPane = $(previewPane);
        this.videoPane = new VideoPane(this.previewPane.find('video')[0]);
        this.slider = new PlayerSlider(this.previewPane.find('.scrub')[0], this.videoPane)
        this.statusBar = new StatusBar(this.previewPane.find('.status-bar'));

        this.videoPane.element.addEventListener('loadedmetadata', () => {
            this.slider.setVideo(this.video);
            this.statusBar.video = this.video;
            this.previewPane.addClass('loaded');
        });
        this.videoPane.element.addEventListener('click', () => {
            this.togglePlaying();
        });
        this.videoPane.element.addEventListener('timeupdate', () => {
            this.statusBar.currentTime = this.videoPane.currentTime;
        })

        $(previewPane).on('keydown')
    }
    setVideo(video) {
        this.videoPane.setVideo(video);
        this.video = video;
        // the javascript event listener will take care of the rest
    }
    togglePlaying() {
        this.videoPane.togglePlaying();
    }
}

module.exports = VideoPlayer;

class VideoPane {
    constructor(element) {
        this.element = element;

        this._seeking = false;
        this._nextTime = null;
        this.element.addEventListener('seeking', () => {
            this._seeking = true;
        });
        this.element.addEventListener('seeked', () => {
            this._seeking = false;
            if (this._nextTime) {
                this.element.currentTime = this._nextTime;
                this._nextTime = null;
            }
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

    get ratio() {
        return this.element.currentTime / this.video.duration;
    }

    get currentTime() {
        return this.element.currentTime;
    }

    set currentTime(newTime) {
        // todo: snap to position
        this.currentFrame = this.video.frameOfTimestamp(newTime); // snap to frame
    }

    get currentFrame() {
        if (!this.video) return 0;
        return this.video.frameOfTimestamp(this.element.currentTime);
    }

    set currentFrame(newFrame) {
        if (!this.video) return;

        var newTime = this.video.timeOfFrame(newFrame);
        if (this._seeking) {
            this._nextTime = newTime;
        } else {
            this.element.currentTime = newTime;
        }
    }
}

class PlayerSlider {
    constructor(element, player) {
        this.canvas = element;
        this.player = player;
        this.context = this.canvas.getContext('2d');
        this.startRenderLoop();

        // todo: events probably should be moved
        $(this.canvas).on('mousedown mousemove', (evt) => {
            if (evt.which != 1) return;

            var ratio = evt.clientX / this.canvas.clientWidth;
            player.currentTime = this.video.duration * ratio;
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
        var linePosition = Math.floor(this.player.ratio * canvas.width);
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
