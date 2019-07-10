export default class PreferenceItem {

    key: string;
    defaultValue: any;

    constructor(key: string, defaultValue: any) {
        this.key = key;
        this.defaultValue = defaultValue;
    }

}