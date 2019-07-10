export default class Library {
    id: number;
    name: string;
    description: string;
    license: string;
    url: string;
    imageUrl: string | null;
    author: string;

    constructor(id: number, name: string, description: string, license: string, url: string, imageUrl: string | null, author: string) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.license = license;
        this.url = url;
        this.imageUrl = imageUrl;
        this.author = author;
    }
}