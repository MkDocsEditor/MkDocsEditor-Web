export default class SectionModel {
    constructor () {
        this._businessProperty = 'Example'
    }

    getTree () {
        return SectionModel
    }

    get businessProperty () {
        return this._businessProperty
    }
}