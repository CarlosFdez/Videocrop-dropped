const VideoPlayer = require('./player');

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
    player = new VideoPlayer($(".preview-pane"));
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
