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
     * Get the file content of the specified document
     *
     * @param documentId
     * @returns {string}
     */
    getDocument(documentId) {
        return this.API.documents.find(documentId);
    }

    /**
     * Get the file content of the specified document
     *
     * @param documentId
     * @returns {string}
     */
    getFileContent(documentId) {
        return this.axiosAPI.get('/document/' + documentId + '/content/');
    }
}