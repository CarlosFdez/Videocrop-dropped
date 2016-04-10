const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const JSONStream = require('JSONStream');
const ffmpeg = require('fluent-ffmpeg');

class FrameReader extends EventEmitter {
    constructor(filename) {
        super();
        this.filename = filename;
    }

    start() {
        var result = {
            timestamps: [],
            keyframes: [],
        };

        var frameStream = JSONStream.parse('frames.*');
        frameStream.on('data', function(frame) {
            // note: pts is presentation time stamp
            result.timestamps.push(parseFloat(frame['pkt_pts_time']));
            if (frame['key_frame'] == 1) {
                result.keyframes.push(parseInt(frame['coded_picture_number']));
            }
        });

        frameStream.on('close', () => {
            this.emit('complete', result);
        });

        // read and probe ffmpeg
        var probe = spawn('ffprobe', [
            '-show_frames',
            '-select_streams', 'v',
            //'-read_intervals', '01:42%+#50',
            '-of', 'json', this.filename]);

        probe.on('error', (err) => {
            this.emit('error', err);
        });

        probe.stdout.pipe(frameStream);
    }
}

module.exports = {}
module.exports.loadMetadata = function(filename, onLoad) {
    ffmpeg.ffprobe(filename, (err, metadata) => {
        onLoad(err, metadata);
    });
};
module.exports.getVideoData = function(filename, onLoad) {
    var reader = new FrameReader(filename);
    reader.on('complete', (data) => {
        onLoad(null, data);
    });
    reader.on('error', (err) => {
        onLoad(err);
    });
    reader.start();
};
