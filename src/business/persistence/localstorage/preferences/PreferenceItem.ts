export default class PreferenceItem {

    public key: string;
    public defaultValue: any;

    constructor(key: string, defaultValue: any) {
        this.key = key;
        this.defaultValue = defaultValue;
    }

}
