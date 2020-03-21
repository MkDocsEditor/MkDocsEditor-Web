import axios from 'axios';
import SectionModel from '@/business/rest/model/SectionModel';
import DocumentModel from '@/business/rest/model/DocumentModel';
import ResourceModel from '@/business/rest/model/ResourceModel';
// import DocumentModel from "./model/DocumentModel.ts";
// import ResourceModel from "./model/ResourceModel.ts";

/**
 * Manager for server communication
 */
export default class RestClient {

    public constructor(host: string, authEnabled: boolean, user: string, password: string) {
        if (!host) {
            host = 'localhost';
        }

        const config = {
            baseUrl: host,
            timeout: 1000,
            baseURL: host,
            auth: {
                username: user,
                password,
            },
        };

        if (!authEnabled || !user || !password) {
            delete config.auth;
        }

        this.fallbackAPI = axios.create(config);

        // eslint-disable-next-line
        const axiosRestClient = require('axios-rest-client');
        this.API = axiosRestClient.default(config);

        this.API.endpoints({
            tree: 'tree',
            sections: 'section',
            documents: 'document',
            resources: 'resource',
        });
    }

    private static toSectionModel(data: any): SectionModel {
        return new SectionModel(
            data.id,
            data.name,
            data.subsections.map(RestClient.toSectionModel),
            data.documents.map(RestClient.toDocumentModel),
            data.resources.map(RestClient.toResourceModel),
        );
    }

    private static toResourceModel(data: any): ResourceModel {
        return new ResourceModel(
            data.id,
            data.name,
            data.mod_time,
            data.file_size,
        );
    }

    private API: any;
    private fallbackAPI: any;

    private static toDocumentModel(data: any): DocumentModel {
        return new DocumentModel(
            data.id,
            data.name,
            data.mod_time,
            data.file_size,
        );
    }

    public getTree(): Promise<SectionModel> {
        return this.API.tree.all().then((result: any) => {
            if (result.isOk) {
                return RestClient.toSectionModel(result.data);
            } else {
                throw Error('Error loading section! :-(');
            }
        });
    }

    /**
     * Get the description of a specific section
     *
     * @param id
     * @returns {promise}
     */
    public getSection(id: string): Promise<SectionModel> {
        return this.API.sections.find(id).then((result: any) => {
            if (result.isOk) {
                return RestClient.toSectionModel(result.data);
            } else {
                throw Error('Error loading section! :-(');
            }
        });
    }

    /**
     * Update the name of a section
     *
     * @param id
     * @param newName the new name
     * @returns {promise}
     */
    public renameSection(id: string, newName: string) {
        return this.API.sections.update(id, {});
    }

    /**
     * Creates a new section as a child section of the specified parent section
     *
     * @param parentId the id of the desired parent section
     * @param name the name of the section
     * @returns {promise}
     */
    public createSection(parentId: string, name: string) {
        return this.API.sections.create({
            Parent: parentId,
            Name: name,
        });
    }

    /**
     * Deletes a section and all of it's child sections, documents and resources.
     * Note that this will fail if a user is currently editing any of the sections documents.
     *
     * @param id the id of the section
     * @returns {promise}
     */
    public deleteSection(id: string) {
        return this.API.sections.delete(id);
    }

    /**
     * Get the description of a specific document
     *
     * @param id
     * @returns {promise}
     */
    public getDocument(id: string): Promise<DocumentModel> {
        return this.API.documents.find(id).then((result: any) => {
            if (result.isOk) {
                return RestClient.toDocumentModel(result.data);
            } else {
                throw Error('Error loading document! :-(');
            }
        });
    }

    /**
     * Creates a new document in the specified section
     *
     * @param sectionId the id of the desired parent section
     * @param name the name of the section
     * @returns {promise}
     */
    public createDocument(sectionId: string, name: string) {
        return this.API.documents.create({
            Parent: sectionId,
            Name: name,
        });
    }

    /**
     * Deletes a document entirely.
     * Note that this will fail if a user is still editing the file.
     *
     * @param id the id of the document
     * @returns {promise}
     */
    public deleteDocument(id: string) {
        return this.API.documents.delete(id);
    }

    /**
     * Get the description of a specific document
     *
     * @param id
     * @returns {promise}
     */
    public getResource(id: string): Promise<ResourceModel> {
        return this.API.resources.find(id);
    }

    /**
     * Deletes a resource.
     *
     * @param id the id of the resource
     * @returns {promise}
     */
    public deleteResource(id: string) {
        return this.API.resources.delete(id);
    }

    /**
     * Get the file content of the specified document.
     * Note that this does NOT reflect any changes made while a user (or multiple) is editing the document.
     *
     * @param documentId
     * @returns {promise}
     */
    public getFileContent(documentId: string): Promise<string> {
        return this.API.documents[documentId].content.all();
    }
}
