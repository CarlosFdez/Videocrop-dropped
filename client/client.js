const VideoPlayer = require('./player');
const Video = require('./video');
const ffmpeg = require('./ffmpeg-bridge')
const commands = require('./commands')

var player = null;
var video = null;

const ipc = require('electron').ipcRenderer;

$(document).ready(() => {
    player = new VideoPlayer($(".main-container"))
});

$(document).on('dragenter', (evt) => {
    evt.preventDefault()
    console.log('file dragged over, do something later')
})

$(document).on('dragover', (evt) => {
    evt.preventDefault()
})

$(document).on('dragleave', (evt) => {
    evt.preventDefault()
    console.log('file no longer dragged over, do something later')
})

document.addEventListener('drop', (evt) => {
    // for now, assume that its always a file. Once we have exceptions we can adjust
    evt.preventDefault()
    console.log('file dropped')
    var filename = evt.dataTransfer.files[0].path
    ipc.send('open-video-request', filename)

    return false
})

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

Mousetrap.bind(['`', '~'], () => {
    player.toggleFullscreen()
})

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

Mousetrap.bind("ctrl+z", () => {
    player.undo()
})

Mousetrap.bind(["ctrl+shift+z", "ctrl+y"], () => {
    player.redo()
})

// todo: different key
Mousetrap.bind('a', () => {
    player.mode = VideoPlayer.Mode.NORMAL
})

Mousetrap.bind('c', () => {
    player.applyCommand(new commands.CutRegion(this.player.currentTime))
})

Mousetrap.bind('[', () => {
    player.applyCommand(new commands.SnapRegionStart(this.player.currentTime))
})

Mousetrap.bind(']', () => {
    player.applyCommand(new commands.SnapRegionEnd(this.player.currentTime))
})
