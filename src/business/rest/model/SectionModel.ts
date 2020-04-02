import DocumentModel from '@/business/rest/model/DocumentModel';
import ResourceModel from '@/business/rest/model/ResourceModel';

/**
 * Model of a section
 */
export default class SectionModel {

    public id: string;
    public name: string;
    public subsections: SectionModel[];
    public documents: DocumentModel[];
    public resources: ResourceModel[];

    public constructor(id: string, name: string, subsections: SectionModel[], documents: DocumentModel[],
                       resources: ResourceModel[]) {
        this.id = id;
        this.name = name;
        this.subsections = subsections;
        this.documents = documents;
        this.resources = resources;
    }
}
