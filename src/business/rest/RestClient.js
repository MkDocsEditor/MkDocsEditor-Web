import axios from "axios";
// import DocumentModel from "./model/DocumentModel.js";
// import ResourceModel from "./model/ResourceModel.js";

/**
 * Manager for server communication
 */
export default class RestClient {

    API;
    axiosAPI;

    constructor(host, user, password) {
        if (!host) {
            host = "localhost"
        }

        let config = {
            baseUrl: host,
            baseURL: host,
            auth: {
                username: user,
                password: password
            }
        };

        this.axiosAPI = axios.create(config);

        const axiosRestClient = require('axios-rest-client');
        this.API = axiosRestClient.default(config);

        this.API.endpoints({
            tree: 'tree',
            sections: 'section',
            documents: 'document',
            resources: 'resource',
        })
    }

    getTree() {
        return this.API.tree.all();
        // return new SectionModel(0, "Hallo", [], [], [])
    }

    /**
     * Get the description of a specific section
     *
     * @param id
     * @returns {promise}
     */
    getSection(id) {
        return this.API.sections.find(id);
    }

    /**
     * Get the description of a specific section
     *
     * @param id
     * @returns {promise}
     */
    renameSection(id, newName) {
        return this.API.sections.update(id, {});
    }

    /**
     * Creates a new section as a child section of the specified parent section
     *
     * @param parentId the id of the desired parent section
     * @param name the name of the section
     * @returns {promise}
     */
    createSection(parentId, name) {
        return this.API.sections.create({
            Parent: parentId,
            Name: name
        });
    }

    /**
     * Deletes a section and all of it's child sections, documents and resources.
     * Note that this will fail if a user is currently editing any of the sections documents.
     *
     * @param id the id of the section
     * @returns {promise}
     */
    deleteSection(id) {
        return this.API.sections.delete(id);
    }

    /**
     * Get the description of a specific document
     *
     * @param id
     * @returns {promise}
     */
    getDocument(id) {
        return this.API.documents.find(id);
    }

    /**
     * Creates a new document in the specified section
     *
     * @param sectionId the id of the desired parent section
     * @param name the name of the section
     * @returns {promise}
     */
    createDocument(sectionId, name) {
        return this.API.documents.create({
            Parent: sectionId,
            Name: name
        });
    }

    /**
     * Deletes a document entirely.
     * Note that this will fail if a user is still editing the file.
     *
     * @param id the id of the document
     * @returns {promise}
     */
    deleteDocument(id) {
        return this.API.documents.delete(id);
    }

    /**
     * Get the description of a specific document
     *
     * @param id
     * @returns {promise}
     */
    getResource(id) {
        return this.API.resources.find(id);
    }

    /**
     * Deletes a resource.
     *
     * @param id the id of the resource
     * @returns {promise}
     */
    deleteResource(id) {
        return this.API.resources.delete(id);
    }

    /**
     * Get the file content of the specified document.
     * Note that this does NOT reflect any changes made while a user (or multiple) is editing the document.
     *
     * @param documentId
     * @returns {promise}
     */
    getFileContent(documentId) {
        return this.axiosAPI.get('/document/' + documentId + '/content/');
    }
}