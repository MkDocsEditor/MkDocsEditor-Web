export default class DocumentModel {

    private id: string;
    private type: string;
    private name: string;
    private mod_time: number;
    private file_size: number;

    constructor(id: string, name: string, mod_time: number, file_size: number) {
        this.id = id;
        this.type = "Document";
        this.name = name;
        this.mod_time = mod_time;
        this.file_size = file_size;
    }
}