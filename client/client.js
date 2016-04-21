const VideoPlayer = require('./player');
const Video = require('./video');
const ffmpeg = require('./ffmpeg-bridge')

var player = null;
var video = null;

const ipc = require('electron').ipcRenderer;

ipc.on('debug-log', (evt, data) => {
    console.log(data)
});
ipc.on('loading', (evt, filename) => {
    console.log("loading " + filename);
    console.log(new Date().toString() + ' started loading');
});

ipc.on('loaded-metadata', (evt, metadata) => {
    console.log(new Date().toString() + ' loaded metadata');
    video = new Video(metadata)
    player.setVideo(video);

    var reader = ffmpeg.getFrames(video.filename, { keyframes: true })
    reader.on('data', (data) => {
        if (data.keyframe) {
            video._keyframes.push(data.timestamp)
        }
    })
    reader.on('close', () => {
        console.log(new Date().toString() + ' finished loading');
    })
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
    player.videoPane.decrementFrame();
});

Mousetrap.bind('right', () => {
    player.videoPane.pause();
    player.videoPane.incrementFrame();
});

// todo: different key
Mousetrap.bind('a', () => {
    player.mode = VideoPlayer.Mode.NORMAL
})

Mousetrap.bind('c', () => {
    player.mode = VideoPlayer.Mode.CUT
})
