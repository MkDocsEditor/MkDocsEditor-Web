export default class ResourceModel {

    public id: string;
    public type: string;
    public name: string;
    public mod_time: number;
    public file_size: number;

    constructor(id: string, name: string, mod_time: number, file_size: number) {
        this.id = id;
        this.type = 'Resource';
        this.name = name;
        this.mod_time = mod_time;
        this.file_size = file_size;
    }
}
