const EventEmitter = require('events')
const ffmpeg = require('./ffmpeg-bridge')
const commands = require('./commands')
const RegionCollection = require('./region-collection')
const ipc = require('electron').ipcRenderer
const VideoPane = require('./video-pane')

// todo: rename, this is no longer just a player
// VideoPane is the true player class
class VideoPlayer extends EventEmitter {
    constructor(previewPane) {
        super()

        this._undoStack = []
        this._redoStack = []

        this.previewPane = $(previewPane)
        this.videoPane = new VideoPane(this.previewPane.find('video')[0])
        this.slider = new PlayerSlider(this.previewPane.find('.scrub')[0], this)
        this.statusBar = new StatusBar(this.previewPane.find('.status-bar'), this.videoPane)

        this.fullscreenSlider = new PlayerSlider(this.previewPane.find('.fullscreen-scrub')[0], this)

        this.mode = VideoPlayer.Mode.NORMAL

        this.videoPane.element.addEventListener('click', () => {
            this.togglePlaying();
        });

        $('input[name=export-audio]').change((evt) => {
            var checked = $(evt.target).prop('checked')
            $('input[name=audio-option]').prop('disabled', !checked)
        }).change();

        $('.open-button').click(() => {
            ipc.send('open-video-request')
        })

        $('.export-button').click(() => {
            if (!this.video) return

            // todo: regions
            var exportSettings = {
                filename: this.video.filename,
                container: $('select[name=container-select]').val(),
                exportAudioFiles: $('input[name=export-audio]').prop('checked'),
                separateVideos: $('input[name=video-splitting]:checked').val() == 'split',
            }

            var audioOption = $('input[name=audio-option]:checked').val()
            if (exportSettings.exportAudioFiles && audioOption != -1) {
                exportSettings.audioTracks = parseInt(audioOption)
            }

            // send to backend to handle it
            ipc.send('export-video', exportSettings)
        })

        this.emit('init')
    }

    setVideo(video) {
        this.videoPane.setVideo(video)

        // the javascript event will take care of the rest
        this.videoPane.once('loadedmetadata', () => {
            this.video = video
            this.slider.setVideo(video)
            this.fullscreenSlider.setVideo(video)
            this.statusBar.video = video
            this.previewPane.addClass('loaded')

            this.regions = new RegionCollection()
            this.regions.addRange(0, this.video.duration)
        });
    }

    toggleFullscreen() {
        if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen()
        } else {
            $('.video-wrap')[0].webkitRequestFullscreen()
        }
    }

    get currentTime() {
        return this.videoPane.currentTime
    }

    set currentTime(newTime) {
        this.videoPane.currentTime = newTime;
    }

    play() {
        this.videoPane.play()
    }

    pause() {
        this.videoPane.pause()
    }

    togglePlaying() {
        this.videoPane.togglePlaying()
    }

    get mode() {
        return this._mode
    }

    set mode(mode) {
        this._mode = mode
        this.emit('mode-changed', mode)
    }

    /**
     * Applies a command that can be later undone.
     */
    applyCommand(command) {
        if (command.canApply && !command.canApply(this))
            return

        this._redoStack = [] // clear redos
        command.apply(this)
        this._undoStack.push(command)
    }

    undo() {
        if (this._undoStack.length == 0) return;
        var lastCommand = this._undoStack.pop()
        lastCommand.undo(this)
        this._redoStack.push(lastCommand)
    }

    redo() {
        if (this._redoStack.length == 0) return;
        var lastCommand = this._redoStack.pop()
        lastCommand.apply(this)
        this._undoStack.push(lastCommand)
    }
}

VideoPlayer.Mode = {
    NORMAL: 1
}

module.exports = VideoPlayer;

class PlayerSlider {
    constructor(element, player) {
        this.canvas = element
        this.player = player
        this.videoPane = player.videoPane
        this.context = this.canvas.getContext('2d')
        this.rendering = true
        this.startRenderLoop()

        this._addNormalModeEvents()
    }

    _addNormalModeEvents() {
        var player = this.player;
        $(this.canvas).on('mousedown', (evt) => {
            if (player.mode != VideoPlayer.Mode.NORMAL) return;
            if (evt.which != 1) return;

            var timestamp = this._timestampAt(evt.clientX)
            this.videoPane.currentTime = timestamp;
        });

        $(this.canvas).on('mousemove', (evt) => {
            if (player.mode != VideoPlayer.Mode.NORMAL) return;
            if (evt.which != 1) return;

            var timestamp = this._timestampAt(evt.clientX)
            this.videoPane.currentTime = timestamp;
        });

        $(this.canvas).on('mouseup', (evt) => {
            if (player.mode != VideoPlayer.Mode.NORMAL) return;
        });

        // todo: handle mode switch for mode switch while dragging
    }

    setVideo(video) {
        this.video = video;
    }

    startRenderLoop() {
        this.render();
        requestAnimationFrame(() => this.startRenderLoop());
    }

    _timestampAt(xCoordinate) {
        return (xCoordinate / this.canvas.width) * this.video.duration
    }

    _positionOf(timestamp) {
        return Math.floor((timestamp / this.video.duration) * this.canvas.width)
    }

    render() {
        if (!this.rendering) return;
        if (!this.video) return;

        var video = this.video;
        var canvas = this.canvas;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // update canvas size if necessary. updates refresh the canvas
        if (canvas.width != canvas.clientWidth || canvas.height != canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        // function shortcut cause its used very often here...
        var positionOf = this._positionOf.bind(this)

        // The height of the core section including range boxes
        var mainHeight = Math.floor(canvas.height * 0.8)
        // the height of the section above the mainHeight
        var gutterHeight = canvas.height - mainHeight;

        var thickness = 2; // todo: make configurable

        // draw range boxes
        if (this.video && this.player.regions) {
            ctx.fillStyle = "#4488FF"
            for (let region of this.player.regions.regions) {
                let start = positionOf(region.start)
                let end = positionOf(region.end)
                ctx.fillRect(start, gutterHeight, end-start, mainHeight)
            }

            ctx.fillStyle = "#002277"
            for (let region of this.player.regions.regions) {
                let start = positionOf(region.start)
                let end = positionOf(region.end)

                // left border
                ctx.fillRect(start, gutterHeight, thickness, canvas.height)

                // right border
                ctx.fillRect(end - thickness, gutterHeight, thickness, canvas.height)
            }
        }

        // draw seek marker line
        var linePosition = positionOf(this.videoPane.currentTime);
        var lineDrawStart = linePosition - Math.floor(thickness/2);
        ctx.fillStyle = "red";
        ctx.fillRect(lineDrawStart, 0, thickness, canvas.height);
        ctx.beginPath();
        ctx.moveTo(lineDrawStart, gutterHeight);
        ctx.lineTo(lineDrawStart - gutterHeight/2, 0);
        ctx.lineTo(lineDrawStart + thickness + gutterHeight/2, 0);
        ctx.lineTo(lineDrawStart + thickness, gutterHeight);
        ctx.fill();
    }
}

class StatusBar {
    constructor(element, videoPane) {
        this._element = $(element);

        videoPane.on('timeupdate', () => {
            this.currentTime = videoPane.currentTime
        })
    }

    get video() {
        return this._video;
    }

    set video(video) {
        this._video = video;
        this._element.find('.totalDuration').text(video.duration);
    }

    set currentTime(newTime) {
        this._element.find('.currentTime').text(newTime);
    }
}
