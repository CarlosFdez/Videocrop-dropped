class CutRegion {
    constructor(timestamp) {
        this.timestamp = timestamp
    }

    canApply(player) {
        return player.regions.canSplitAt(this.timestamp)
    }

    apply(player) {
        player.regions.splitAt(this.timestamp)
    }

    undo(player) {
        player.regions.joinAt(this.timestamp)
    }
}

module.exports.CutRegion = CutRegion

class SnapRegionStart {
    constructor(timestamp) {
        this.timestamp = timestamp
    }

    apply(player) {
        this._regionChanged = player.regions.getRegionAt(this.timestamp)
        if (!this._regionChanged) {
            this._regionChanged = player.regions.regionAfter(this.timestamp)
        }
        this._originalTimestamp = this._regionChanged.start
        this._regionChanged.start = this.timestamp
    }

    undo(player) {
        this._regionChanged.start = this._originalTimestamp
    }
}

module.exports.SnapRegionStart = SnapRegionStart

class SnapRegionEnd {
    constructor(timestamp) {
        this.timestamp = timestamp
    }

    apply(player) {
        this._regionChanged = player.regions.getRegionAt(this.timestamp)
        if (!this._regionChanged) {
            this._regionChanged = player.regions.regionBefore(this.timestamp)
        }
        this._originalTimestamp = this._regionChanged.end
        this._regionChanged.end = this.timestamp
    }

    undo(player) {
        this._regionChanged.end = this._originalTimestamp
    }
}

module.exports.SnapRegionEnd = SnapRegionEnd
