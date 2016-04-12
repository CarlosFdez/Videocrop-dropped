const VideoPlayer = require('./player');
const Video = require('./video');

var player = null;
var video = null;

const ipc = require('electron').ipcRenderer;

ipc.on('loading', (evt, filename) => {
    console.log("loading " + filename);
    console.log(new Date().toString() + ' started loading');
});

ipc.on('loaded-metadata', (evt, metadata) => {
    console.log(new Date().toString() + ' loaded metadata');
    video = new Video(metadata)
    player.setVideo(video);
});
ipc.on('open-video', (evt, videoData) => {
    console.log(new Date().toString() + ' finished loading');
    video.addFramedata(videoData);
    console.log(videoData);
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
