<template>
    <div>
        <h1>File Browser</h1>
        <section-overview v-if="currentSection" :section="currentSection"></section-overview>
        <md-button class="md-fab md-fab-bottom-right">
            <md-icon>add</md-icon>
            <md-icon>edit</md-icon>
        </md-button>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"
    import SectionModel from "../../business/rest/model/SectionModel.js"
    import SectionOverview from "./section/SectionOverview.vue"

    export default Vue.extend({
        name: "FileBrowser",
        components: {
            SectionOverview
        },
        data: () => ({
            currentSection: null
            // new SectionModel(0, "root",
            //     [
            //         new SectionModel(1, "Some subsection", [], [], [])
            //     ],
            //     [
            //         new DocumentModel(0, "Main.md", 100, 0),
            //         new DocumentModel(1, "Second.md", 200, 0),
            //         new DocumentModel(2, "Third.md", 300, 0)
            //     ],
            //     [
            //         new ResourceModel(0, "text.txt", 10, 0)
            //     ])
        }),
        mounted: function () {
            this.loadSectionData();
        },
        methods: {
            /**
             * Loads the currently specified section (per url param) from the server
             */
            loadSectionData: function () {
                let sectionId = this.getSectionId();

                let restCall;
                if (sectionId) {
                    restCall = this.$restClient.getSection(sectionId);
                } else {
                    restCall = this.$restClient.getTree();
                }

                let that = this;
                restCall.then(function (result) {
                    if (result.isOk) {
                        let data = result.data;
                        that.currentSection = new SectionModel(data.id, data.name, data.subsections, data.documents, data.resources);
                    } else {
                        this.$toasted.show("Error loading section! :-(");
                    }
                });
            },

            /**
             * @return the section id to show, or null if the root section should be shown
             */
            getSectionId: function () {
                return this.$route.params.id
            },

        },
        watch: {
            '$route'(to, from) {
                this.loadSectionData();
            }
        }
    })
</script>

<style scoped>

</style>