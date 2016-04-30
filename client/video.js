/**
 * Represents a video model object
 */
class Video {
    constructor(videoMetadata) {
        this.filename = videoMetadata['format']['filename'];
        this.duration = videoMetadata['format']['duration'];

        var [high, low] = videoMetadata['streams'][0]['avg_frame_rate'].split('/');
        this.framerate = parseFloat(high) / parseFloat(low);
        this._frameDuration = (1 / this.framerate);

        this._keyframes = [];

        this._metadata = videoMetadata // store if I want to debug
    }

    get totalFrames() {
        return this._timestamps.length;
    }

    // todo: alter for keyframe use (_timeOfFrame needs to be replaced for keyframe itself)
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

    _indexOfCurrentKeyframe(timestamp) {
        var idx = this._keyframes.findIndex((item) => item > timestamp)
        if (idx == -1) {
            idx = this._keyframes.length
        }
        return Math.max(idx - 1, 0)
    }

    currentKeyFrame(timestamp) {
        var idx = this._indexOfCurrentKeyframe(timestamp);
        return this._keyframes[idx];
    }

    previousKeyframe(timestamp) {
        var idx = this._indexOfCurrentKeyframe(timestamp);
        return this._keyframes[Math.max(0, idx - 1)]
    }

    nextKeyframe(timestamp) {
        var idx = this._indexOfCurrentKeyframe(timestamp);
        return this._keyframes[Math.min(this._keyframes.length - 1, idx + 1)];
    }

    /**
     * Retrieves the current keyframe such that if the video where to end there,
     * it would include the given timestamp.
     */
    nextOrCurrentKeyframe(timestamp) {
        var currentKeyFrame = this.currentKeyFrame(timestamp)
        if (currentKeyFrame == timestamp) {
            return currentKeyFrame
        } else {
            return this.nextKeyframe(timestamp)
        }
    }
}

module.exports = Video;
