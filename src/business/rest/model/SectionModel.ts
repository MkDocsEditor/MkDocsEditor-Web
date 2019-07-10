import DocumentModel from "@/business/rest/model/DocumentModel";
import ResourceModel from "@/business/rest/model/ResourceModel";

export default class SectionModel {

    private id: string;
    private name: string;
    private subsections: SectionModel[];
    private documents: DocumentModel[];
    private resources: ResourceModel[];

    constructor(id: string, name: string, subsections: SectionModel[], documents: DocumentModel[], resources: ResourceModel[]) {
        this.id = id;
        this.name = name;
        this.subsections = subsections;
        this.documents = documents;
        this.resources = resources;
    }
}