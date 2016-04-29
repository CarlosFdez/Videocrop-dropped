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
module.exports.getVideoStream = function(filename) {
    // var child = spawn('ffmpeg', [
    //     '-i', filename,
    //     '-map', 'v', '-map', 'a:0',
    //     '-t', '5',
    //     '-codec', 'copy', '-f', 'matroska', '-'])
    var child = spawn('ffmpeg', [
        '-i', filename,
        '-map', 'v', '-map', 'a:0',
        '-t', '1',
        '-vcodec', 'vp8',
        '-f', 'webm',
        //'-g', '1',
        '-'])
    //child.stderr.on('data', (err) => { throw err; })
    return child.stdout
}
module.exports.getAudioStream = function(filename, trackNumber, options={}) {
    var seekTime = options.seekTo || 0
    var duration = options.duration || 5

    var child = spawn('ffmpeg', [
        '-ss', seekTime,
        '-i', filename,
        '-ss', 0,
        '-map', 'a:' + trackNumber,
        '-t', duration + 0.10,
        '-force_key_frames', seekTime + ',' + (seekTime + duration),
        '-f', 'adts',
        '-codec', 'aac',
        '-'])

    // -f s16le -acodec pcm_s16le todo) take and pip
    return child.stdout
}
