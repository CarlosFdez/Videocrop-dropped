const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const JSONStream = require('JSONStream');
const ffmpeg = require('fluent-ffmpeg');
const Transform = require('stream').Transform;

class FrameReader {
    constructor(filename, options) {
        this.filename = filename;
        this.options = options || {};
    }

    createDataStream() {
        var interval_options = [];
        var skip_frames = []
        if (this.options.interval) {
            // '01:42%+#50'
            interval_options = ['-read_intervals', this.options.interval];
        }
        if (this.options.keyframes) {
            skip_frames = ['-skip_frame', 'nokey']
        }

        // read and probe ffmpeg
        var probe = spawn('ffprobe', [
            '-show_frames',
            '-select_streams', 'v'
        ].concat(interval_options).concat(skip_frames).concat([
            '-of', 'json', this.filename
        ]));

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

        var outputStream = probe.stdout
            .pipe(frameStream)
            .pipe(transformStream);
        outputStream.kill = () => {
            probe.kill('SIGINT')

            // this is windows only, check if windows and then perform it
            spawn('taskkill', ['/pid', probe.pid, '/f', '/t'])
        }

        return outputStream
    }
}

module.exports = {};
module.exports.getFrameStream = function(filename, options={}) {
    var reader = new FrameReader(filename, options);
    var stream = reader.createDataStream();
    return stream;
}
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
        onLoad(null, results);
    });
};
