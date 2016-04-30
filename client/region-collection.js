// represents a range [start, end)
class Region {
    constructor(collection, start, end) {
        this.collection = collection
        this.start = start
        this.end = end
    }

    intersects(position) {
        return (
            position >= this.start
            &&
            position < this.end) // note: not-inclusive send?
    }

    /**
     * Checks if the this region is contained inside the given start or end
     * As the ending is exclusive, if the given start lines up with our end, it shouldn't interesect
     */
    intersectsRange(start, end) {
        // is the test range start inside?
        if (start >= this.start && start < this.end) {
            return true;
        }
        // is the test range end inside?
        if (end > start && end <= this.end) {
            return true;
        }
        return false;
    }
}

class RegionCollection {
    constructor(duration) {
        this.duration = duration
        this.regions = []
    }

    _orderRegions() {
        this.regions.sort((left, right) => left.start - right.start)
    }

    /**
     * Adds a range as a region.
     * TODO: HANDLE INTERSECTIONS
     */
    addRange(start, end) {
        var region = new Region(this, start, end);
        this.regions.push(region);
        this._orderRegions()
    }

    getRegionAt(position) {
        return this.regions.find((region) => region.intersects(position))
    }

    getRegionsIntersecting(start, end) {
        return this.regions.filter((region) => region.intersectsRange(start, end))
    }

    _regionAfterIdx(position) {
        return this.regions.findIndex((region) => region.start >= position)
    }

    _regionBeforeIdx(position) {
        var idxTooLate  = this._regionAfterIdx(position)
        if (this.regions[idxTooLate].end == position) {
            return idxTooLate; // this happens when the two regions are touching
        }

        // return the region before
        return Math.max(-1, idxTooLate - 1)
    }

    // Gets the first region at or after the given position
    regionAfter(position) {
        var idx = this._regionAfterIdx(position)
        if (idx >= 0) {
            return this.regions[idx]
        }
    }

    // Gets the first region at or before the current position
    regionBefore(position) {
        var idx = this._regionBeforeIdx(position)
        if (idx >= 0) {
            return this.regions[idx]
        }
    }

    splitAt(position) {
        let region = this.getRegionAt(position)
        if (!region)
            return
        if (position == region.start || position == region.end)
            return
        var greaterEnd = region.end
        region.end = position
        this.addRange(position, greaterEnd)
        // note: addRange performs a sort, so the list should be back in order
    }

    joinAt(position) {
        var beforeIdx = this._regionBeforeIdx(position)
        var afterIdx = this._regionAfterIdx(position)
        this.regions[beforeIdx].end = this.regions[afterIdx].end
        this.regions.splice(afterIdx, 1)
    }
}

module.exports = RegionCollection
