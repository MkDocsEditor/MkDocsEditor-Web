import axios from 'axios';
import SectionModel from "./model/SectionModel";
// import DocumentModel from "./model/DocumentModel.js";
// import ResourceModel from "./model/ResourceModel.js";

export default class RestClient {

    HTTP = axios.create({
        baseURL: `http://jsonplaceholder.typicode.com/`,
        headers: {
            Authorization: 'Bearer {token}'
        }
    });

    constructor() {
    }

    getTree() {
        return new SectionModel(0, "Hallo", [], [], [])
    }
}