import axios from 'axios';

export default class RestClient {

    HTTP = axios.create({
        baseURL: `http://jsonplaceholder.typicode.com/`,
        headers: {
            Authorization: 'Bearer {token}'
        }
    })

    constructor () {
    }

    getTree () {

        return SectionModel
    }
}