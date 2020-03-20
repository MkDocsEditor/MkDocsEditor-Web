import Library from './Library';
import '@/libraries/PowerArray.js';

export default class LibraryItems {
    private MavonEditor: Library = new Library(
        1,
        'mavonEditor',
        'A markdown editor based on Vue that supports a variety of personalized features',
        'MIT',
        'https://md.zhystar.com/',
        null,
        'HinesZhu',
    );
    private VueToasted = new Library(
        2,
        'vue-toasted',
        'Responsive Touch Compatible Toast plugin for VueJS 2+',
        'MIT',
        'https://github.com/shakee93/vue-toasted',
        'https://camo.githubusercontent.com/ad2f797f88f98ee4988dc82a4d70e72936170871/6874' +
        '7470733a2f2f66726573687069786c2e636f6d2f7675652d746f61737465642e706e673f6e6577',
        'Shakeeb Sadikeen',
    );
    private PowerArray = new Library(
        3,
        'PowerArray',
        'Power Array allows you to operate with javascript arrays in a comfortable and much easier way',
        'MIT',
        'https://github.com/detky/PowerArray',
        null,
        'Sebastian Menendez',
    );
    private diffMatchPatch = new Library(
        4,
        'diff-match-patch',
        'Diff Match Patch is a high-performance library in multiple languages that manipulates plain text.',
        'Apache 2.0',
        'https://github.com/google/diff-match-patch',
        null,
        'Neil Fraser',
    );
    private axiosRest = new Library(
        5,
        'axios-rest',
        'A simple axios wrapper to make rest api call delightful',
        'MIT',
        'https://github.com/eldomagan/axios-rest',
        'https://avatars1.githubusercontent.com/u/8585729?s=400&v=4',
        'Eldo Magan',
    );

    public getAllLibraries(): Library[] {
        const libraries: Library[] = [];

        for (const key in this) {
            if (this.hasOwnProperty.call(this, key)) {
                const val = this[key];
                if (val instanceof Library) {
                    libraries.push(val);
                }
            }
        }

        // TODO: fix PowerArray imports
        // @ts-ignore
        const sortedLibraries = libraries.Sort({name: Sort.AscendingIgnoringCase});
        return sortedLibraries;
    }
}
