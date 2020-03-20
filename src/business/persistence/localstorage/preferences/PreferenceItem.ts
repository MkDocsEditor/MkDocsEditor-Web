export default class PreferenceItem {

    public key: string;
    public defaultValue: any;

    public constructor(key: string, defaultValue: any) {
        this.key = key;
        this.defaultValue = defaultValue;
    }

}
