export default class Library {
    public id: number;
    public name: string;
    public description: string;
    public license: string;
    public url: string;
    public imageUrl: string | null;
    public author: string;

    public constructor(id: number, name: string, description: string, license: string, url: string,
                       imageUrl: string | null, author: string) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.license = license;
        this.url = url;
        this.imageUrl = imageUrl;
        this.author = author;
    }
}
