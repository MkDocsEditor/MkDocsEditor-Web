<template>
    <div id="editor">
        <h1>{{ fileName }}</h1>

        <mavon-editor
                :defaultOpen="defaultOpen"
                :editable="editable"
                :imageFilter="acceptImageFile"
                :subfield="subfield"
                :toolbars="toolbarOptions"
                language="en"
                placeholder="Empty document ¯\_(ツ)_/¯"
                v-model="input"/>
    </div>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';
    import PreferenceItems from '@/business/persistence/preferences/PreferenceItems';

    @Component({
        props: {
            initiallyShow: {
                type: String,
                required: false,
                validator(value) {
                    // The value must match one of these strings
                    return ['editor', 'preview', 'both'].indexOf(value) !== -1;
                },
            },
        },
    })

    export default class CodeEditor extends Vue {

        public fileName = '';
        public input = '';
        public editable = true;
        public defaultOpen = 'edit';
        public subfield = false;
        public toolbarOptions = {
            bold: true,
            italic: true,
            header: true,
            underline: true,
            strikethrough: true,
            mark: true,
            superscript: true,
            subscript: true,
            quote: true,
            ol: true,
            ul: true,
            link: true,
            imagelink: true,
            code: true,
            table: true,
            fullscreen: false,
            readmodel: false,
            /* 1.3.5 */
            undo: true,
            redo: true,
            trash: false,
            save: false,
            /* 1.4.2 */
            navigation: true,
            /* 2.1.8 */
            alignleft: true,
            aligncenter: true,
            alignright: true,
            /* 2.2.1 */
            subfield: true,
            preview: true,

            htmlcode: true,
            help: true,
        };

        public mounted(): void {
            // get preference value
            const initiallyShow = this.$preferenceManager.loadPreferenceValue(PreferenceItems.Editor.openDefault);

            // and map it to the (slightly weird) properties of the component
            this.$data.defaultOpen = (initiallyShow === 'preview' || initiallyShow === 'both') ? 'preview' : 'edit';
            this.$data.subfield = initiallyShow === 'both';

            this.retrieveFileContent().then((content: any) => {
              this.$data.input = content;
            }).catch((reason) => {
              this.$toasted.show('Error loading file :-(');
            });
        }

        private getDocumentId(): string {
            return this.$route.params.id;
        }

        private acceptImageFile(): boolean {
            // don't allow uploading files (yet)
            return false;
        }

        private retrieveFileContent(): Promise<string> {
            const documentId = this.getDocumentId();
            return this.$restClient.getFileContent(documentId);
        }

    }
</script>

<style lang="scss" scoped>

    #editor {
        height: calc(100vh - 80px);
    }

    #editor-container {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;
    }

    /* TODO */

</style>
