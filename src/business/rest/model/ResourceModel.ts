export default class ResourceModel {

    private id: string;
    private type: string;
    private name: string;
    private mod_time: number;
    private file_size: number;

    constructor(id: string, name: string, mod_time: number, file_size: number) {
        this.id = id;
        this.type = 'Resource';
        this.name = name;
        this.mod_time = mod_time;
        this.file_size = file_size;
    }
}