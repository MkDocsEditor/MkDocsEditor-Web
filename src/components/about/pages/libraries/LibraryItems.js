import Library from "./Library";
import "../../../../libraries/PowerArray.js"

export default {
    MavonEditor: new Library(
        1,
        "mavonEditor",
        "A markdown editor based on Vue that supports a variety of personalized features",
        "MIT",
        "https://md.zhystar.com/",
        null,
        "HinesZhu"
    ),
    VueToasted: new Library(
        2,
        "vue-toasted",
        "Responsive Touch Compatible Toast plugin for VueJS 2+",
        "MIT",
        "https://github.com/shakee93/vue-toasted",
        "https://camo.githubusercontent.com/ad2f797f88f98ee4988dc82a4d70e72936170871/68747470733a2f2f66726573687069786c2e636f6d2f7675652d746f61737465642e706e673f6e6577",
        "Shakeeb Sadikeen"
    ),
    PowerArray: new Library(
        3,
        "PowerArray",
        "Power Array allows you to operate with javascript arrays in a comfortable and much easier way",
        "MIT",
        "https://github.com/detky/PowerArray",
        null,
        "Sebastian Menendez"
    ),
    diffMatchPatch: new Library(
        4,
        "diff-match-patch",
        "Diff Match Patch is a high-performance library in multiple languages that manipulates plain text.",
        "Apache 2.0",
        "https://github.com/google/diff-match-patch",
        null,
        "Neil Fraser"
    ),

    getAllLibraries: function () {
        let libraries = [];

        for (let key in this) {
            if (this.hasOwnProperty.call(this, key)) {
                let val = this[key];
                if (val instanceof Library) {
                    libraries.push(val)
                }
            }
        }

        let sortedLibraries = libraries.Sort({name: Sort.AscendingIgnoringCase});

        return sortedLibraries;
    }
}