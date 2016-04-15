const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const JSONStream = require('JSONStream');
const ffmpeg = require('fluent-ffmpeg');
const Transform = require('stream').Transform;

class FrameReader {
    constructor(filename) {
        this.filename = filename;
    }

    createDataStream() {
        // read and probe ffmpeg
        var probe = spawn('ffprobe', [
            '-show_frames',
            '-select_streams', 'v',
            //'-read_intervals', '01:42%+#50',
            '-of', 'json', this.filename]);

        var frameStream = JSONStream.parse('frames.*');

        var transformStream = new Transform({
            transform: function(frame, encoding, callback) {
                callback(null, {
                    coded_picture_number: parseInt(frame['coded_picture_number']),
                    timestamp: parseFloat(frame['pkt_pts_time']),
                    keyframe: frame['key_frame'] == 1
                });
            },
            readableObjectMode : true,
            writableObjectMode: true
        })

        return probe.stdout
            .pipe(frameStream)
            .pipe(transformStream);
    }
}

module.exports = {}
module.exports.loadMetadata = function(filename, onLoad) {
    ffmpeg.ffprobe(filename, (err, metadata) => {
        onLoad(err, metadata);
    });
};
module.exports.getVideoData = function(filename, onLoad) {
    var results = {
        timestamps: [],
        keyframes: []
    }
    var reader = new FrameReader(filename);
    var stream = reader.createDataStream();
    stream.on('data', (frame) => {
        results.timestamps.push(frame.timestamp);
        if (frame.keyframe) {
            results.keyframes.push(frame.coded_picture_number);
        }
    });
    stream.on('error', (err) => {
        onLoad(err);
    });
    stream.on('end', () => {
        console.log('complate');
        onLoad(null, results);
    });
};
