/**
 * Represents a video model object that contains
 * both information about the video and any defined export regions.
 */
class Video {
    constructor(videoMetadata) {
        this.filename = videoMetadata['format']['filename'];
        this.duration = videoMetadata['format']['duration'];

        var [high, low] = videoMetadata['streams'][0]['avg_frame_rate'].split('/');
        this.framerate = parseFloat(high) / parseFloat(low);
        this._frameDuration = (1 / this.framerate);

        this._timestamps = [];
        this._keyframes = [];
    }

    addFramedata(videoData) {
        this._timestamps = videoData.timestamps;
        this._keyframes = videoData.keyframes;
    }

    get totalFrames() {
        return this._timestamps.length;
    }

    currentFrame(timestamp) {
        return this._timestamps[this._frameOfTimestamp(timestamp)];
    }

    previousFrame(timestamp) {
        var frame = this._frameOfTimestamp(timestamp) - 1;
        return this._timeOfFrame(frame);
    }

    nextFrame(timestamp) {
        var frame = this._frameOfTimestamp(timestamp) + 1;
        return this._timeOfFrame(frame);
    }

    _timeOfFrame(frame) {
        frame = Math.max(0, frame);
        frame = Math.min(this.totalFrames - 1, frame);
        return this._timestamps[frame];
    }

    _frameOfTimestamp(timestamp) {
        var predictedFrame = Math.floor(timestamp / this._frameDuration);

        if (this._timeOfFrame(predictedFrame) <= timestamp) {
            // the frame is valid,
            // so we need to increase it to be as close as possible without crossing
            while (predictedFrame < this.totalFrames) {
                var nextFrame = predictedFrame + 1;
                if (this._timeOfFrame(nextFrame) > timestamp) {
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
                if (this._timeOfFrame(predictedFrame) <= timestamp) {
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

module.exports = Video;
