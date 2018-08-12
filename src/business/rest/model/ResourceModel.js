export default class ResourceModel {
    constructor(id, name, mod_time, file_size) {
        this.id = id;
        this.type = "Resource";
        this.name = name;
        this.mod_time = mod_time;
        this.file_size = file_size;
    }
}