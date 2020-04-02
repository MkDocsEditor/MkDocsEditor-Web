import axios, {AxiosInstance} from 'axios';
import SectionModel from '@/business/rest/model/SectionModel';
import DocumentModel from '@/business/rest/model/DocumentModel';
import ResourceModel from '@/business/rest/model/ResourceModel';
// import DocumentModel from "./model/DocumentModel.ts";
// import ResourceModel from "./model/ResourceModel.ts";

/**
 * Manager for server communication
 */
export default class RestClient {

    private axiosClient: AxiosInstance;

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

        this.axiosClient = axios.create(config);
    }

    private static toDocumentModel(data: any): DocumentModel {
        return new DocumentModel(
            data.id,
            data.name,
            data.mod_time,
            data.file_size,
        );
    }

    public getTree(): Promise<SectionModel> {
        return this.axiosClient.get('section')
            .then((result: any) => {
                if (result.status != 200) {
                    throw Error('Error loading section! :-(');
                }
                return result.data;
            }).then((data: any) => RestClient.toSectionModel(data));
    }

    /**
     * Get the description of a specific section
     *
     * @param id
     * @returns {promise}
     */
    public getSection(id: string): Promise<SectionModel> {
        return this.axiosClient.get(`section/${id}`)
            .then((result: any) => {
                if (result.status != 200) {
                    throw Error('Error loading section! :-(');
                }
                return result.data;
            }).then((data: any) => RestClient.toSectionModel(data));
    }

    /**
     * Update the name of a section
     *
     * @param id
     * @param newName the new name
     * @returns {promise}
     */
    public renameSection(id: string, newName: string) {
        return this.axiosClient.post('section', {id: id, data: {}});
    }

    /**
     * Creates a new section as a child section of the specified parent section
     *
     * @param parentId the id of the desired parent section
     * @param name the name of the section
     * @returns {promise}
     */
    public createSection(parentId: string, name: string) {
        return this.axiosClient.post('section', {
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
        return this.axiosClient.delete(`section/${id}`);
    }

    /**
     * Get the description of a specific document
     *
     * @param id
     * @returns {promise}
     */
    public getDocument(id: string): Promise<DocumentModel> {
        return this.axiosClient.get(`document/${id}`)
            .then((result: any) => {
                if (result.status != 200) {
                    throw Error('Error loading document! :-(');
                }
                return result.data;
            }).then((data: any) => RestClient.toDocumentModel(data));
    }

    /**
     * Creates a new document in the specified section
     *
     * @param sectionId the id of the desired parent section
     * @param name the name of the section
     * @returns {promise}
     */
    public createDocument(sectionId: string, name: string) {
        return this.axiosClient.post('document', {
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
        return this.axiosClient.delete(`document/${id}`);
    }

    /**
     * Get the description of a specific document
     *
     * @param id
     * @returns {promise}
     */
    public getResource(id: string): Promise<ResourceModel> {
        return this.axiosClient.get(`resource/${id}`)
            .then((result: any) => {
                if (result.status != 200) {
                    throw Error('Error loading resource');
                }
                return result.data;
            }).then((data: any) => RestClient.toResourceModel(data));
    }

    /**
     * Deletes a resource.
     *
     * @param id the id of the resource
     * @returns {promise}
     */
    public deleteResource(id: string) {
        return this.axiosClient.delete(`resource/${id}`);
    }

    /**
     * Get the file content of the specified document.
     * Note that this does NOT reflect any changes made while a user (or multiple) is editing the document.
     *
     * @param documentId
     * @returns {promise}
     */
    public getFileContent(documentId: string): Promise<string> {
        return this.axiosClient.get(`document/${documentId}/content/`)
            .then(result => {
                if (result.status != 200) {
                    throw Error('Error loading document content');
                }
                return result.data;
            });
    }
}
