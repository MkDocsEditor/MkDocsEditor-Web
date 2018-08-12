export default class DocumentModel {
    constructor(id, name, mod_time, file_size) {
        this.id = id;
        this.type = "Document";
        this.name = name;
        this.mod_time = mod_time;
        this.file_size = file_size;
    }
}