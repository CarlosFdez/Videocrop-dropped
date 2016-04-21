// represents a range [start, end)
class Region {
    constructor(collection, start, end) {
        this.collection = collection
        this.start = start
        this.end = end
    }

    intersects(position) {
        return (
            position >= this.start
            &&
            position < this.end) // note: not-inclusive send?
    }

    /**
     * Checks if the this region is contained inside the given start or end
     * As the ending is exclusive, if the given start lines up with our end, it shouldn't interesect
     */
    intersectsRange(start, end) {
        // is the test range start inside?
        if (start >= this.start && start < this.end) {
            return true;
        }
        // is the test range end inside?
        if (end > start && end <= this.end) {
            return true;
        }
        return false;
    }
}

class RegionCollection {
    constructor(duration) {
        this.duration = duration
        this.regions = []
    }

    addRegion(start, end) {
        var region = new Region(this, start, end);
        this.regions.push(region);
    }

    getRegionAt(position) {
        return this.regions.find((region) => region.intersects(position))
    }

    getRegionsIntersecting(start, end) {
        return this.regions.filter((region) => region.intersectsRange(start, end))
    }

    splitAt(position) {
        let region = this.getRegionAt(position)
        if (!region)
            return
        if (position == region.start || position == region.end)
            return
        this.addRegion(position, region.end)
        region.end = position
    }

    closestRegionBorder(position) {
    }
}

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

        this._keyframes = [];

        this.regions = new RegionCollection()
        this.regions.addRegion(0, this.duration / 2)
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

    // implement...
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
}

module.exports = Video;
