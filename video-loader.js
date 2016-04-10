const spawn = require('child_process').spawn;
const JSONStream = require('JSONStream');
const ffmpeg = require('fluent-ffmpeg');

module.exports = {}
module.exports.getVideoData = function(filename, onLoad) {
    result = {
        timestamps: [],
        keyframes: [],
        metadata: null
    };

    // first load basic metadata
    ffmpeg.ffprobe(filename, (err, metadata) => {
        if (err) {
            onLoad(err);
            return;
        }

        result.metadata = metadata;

        // create stream that will add to the result
        var frameStream = JSONStream.parse('frames.*');
        frameStream.on('data', function(frame) {
            // note: pts is presentation time stamp
            result.timestamps.push(parseFloat(frame['pkt_pts_time']));
            if (frame['key_frame'] == 1) {
                result.keyframes.push(parseInt(frame['coded_picture_number']));
            }
        });
        frameStream.on('close', () => {
            onLoad(null, result);
        });

        // read and probe ffmpeg
        probe = spawn('ffprobe', ['-show_frames', '-select_streams', 'v', '-of', 'json', filename]);

        probe.on('error', (err) => {
            onLoad(err);
        });

        probe.stdout.pipe(frameStream);
    });
}
