class CutRegion {
    constructor(timestamp) {
        this.timestamp = timestamp
    }

    apply(player) {
        player.regions.splitAt(this.timestamp)
    }

    undo(player) {
        player.regions.joinAt(this.timestamp)
    }
}

module.exports.CutRegion = CutRegion
