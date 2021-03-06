/**
 * Model of a document
 */
export default class DocumentModel {

    public id: string;
    public type: string;
    public name: string;
    // tslint:disable variable-name
    public mod_time: number;
    // tslint:disable variable-name
    public file_size: number;

    // tslint:disable variable-name
    public constructor(id: string, name: string, mod_time: number, file_size: number) {
        this.id = id;
        this.type = 'Document';
        this.name = name;
        this.mod_time = mod_time;
        this.file_size = file_size;
    }
}
