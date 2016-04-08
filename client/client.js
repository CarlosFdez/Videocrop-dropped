/**
 * Represents a video model object that contains
 * both information about the video and any defined export regions.
 */
class Video {
    constructor(videoData) {
        var videoMetadata = videoData.metadata;
        this.filename = videoMetadata['format']['filename'];
        this.duration = videoMetadata['format']['duration'];

        var [high, low] = videoMetadata['streams'][0]['avg_frame_rate'].split('/');
        this.framerate = parseFloat(high) / parseFloat(low);
        this._frameDuration = (1 / this.framerate);

        this._timestamps = videoData.timestamps;
        this._keyframes = videoData.keyframes;
    }

    get totalFrames() {
        return this._timestamps.length;
    }

    timeOfFrame(frame) {
        frame = Math.max(0, frame);
        frame = Math.min(this.totalFrames - 1, frame);
        return this._timestamps[frame];
    }

    frameOfTimestamp(timestamp) {
        var predictedFrame = Math.floor(timestamp / this._frameDuration);

        if (this.timeOfFrame(predictedFrame) <= timestamp) {
            // the frame is valid,
            // so we need to increase it to be as close as possible without crossing
            while (predictedFrame != this.totalFrames - 1) {
                var nextFrame = predictedFrame + 1;
                if (this.timeOfFrame(nextFrame) > timestamp) {
                    // nextFrame crossed over so we stop
                    break;
                }
                predictedFrame = nextFrame;
            }
        } else {
            // the predicted frame happens after the timestamp
            // push it backwards until its valid
            while (predictedFrame != 0) {
                predictedFrame -= 1;
                if (this.timeOfFrame(predictedFrame) <= timestamp) {
                    break; // this is good, we're done
                }
            }
        }

        return predictedFrame;
    }

    keyframeBefore(frame) {
        var idx = this._keyframes.findIndex((item) => item > frame);
        return this._keyframes[Math.max(0, idx - 1)];
    }

    keyframeAfter(frame) {
        var idx = this._keyframes.findIndex((item) => item >= frame);
        return this._keyframes[idx];
    }
}

class VideoPane {
    constructor(element) {
        this.element = element;
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
        this.element.currentTime = newTime;
        this.currentFrame = this.currentFrame; // snap to frame
    }

    get currentFrame() {
        if (!this.video) return 0;
        return this.video.frameOfTimestamp(this.element.currentTime);
    }

    set currentFrame(newFrame) {
        if (!this.video) return;
        this.element.currentTime = this.video.timeOfFrame(newFrame);
    }
}

class PlayerSlider {
    constructor(element, player) {
        this.canvas = element;
        this.player = player;
        this.context = this.canvas.getContext('2d');
        this.startRenderLoop();

        // todo: events probably should be moved
        $(this.canvas).on('mousedown', (evt) => {
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

class VideoPlayer {
    constructor(previewPane) {
        this.previewPane = previewPane;
        this.videoPane = new VideoPane($(previewPane).find('video')[0]);
        this.slider = new PlayerSlider($(previewPane).find('.scrub')[0], this.videoPane)

        this.videoPane.element.addEventListener('loadedmetadata', () => {
            this.slider.setVideo(this.video);
        });
        this.videoPane.element.addEventListener('click', () => {
            this.togglePlaying();
        });

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

var player = null;

const ipc = require('electron').ipcRenderer;

ipc.on('loading', (evt, filename) => {
    console.log("loading " + filename);
    console.log(new Date().toString() + ' started loading');
});
ipc.on('open-video', (evt, videoData, err) => {
    console.log(new Date().toString() + ' finished loading');
    console.log(err);
    console.log(videoData);
    player.setVideo(new Video(videoData));
});

$(document).ready(() => {
    player = new VideoPlayer($(".preview-pane")[0]);
    ipc.send('open-video-request');
});

Mousetrap.bind('space', () => {
    player.togglePlaying();
});

Mousetrap.bind('left', () => {
    player.videoPane.pause();
    player.videoPane.currentFrame--;
});

Mousetrap.bind('right', () => {
    player.videoPane.pause();
    player.videoPane.currentFrame++;
});
