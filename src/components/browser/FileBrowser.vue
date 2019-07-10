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
    import {Component, Vue, Watch} from "vue-property-decorator";
    import SectionOverview from "@/components/browser/section/SectionOverview.vue";
    import SectionModel from "@/business/rest/model/SectionModel";

    @Component({
        name: "FileBrowser",
        components: {
            SectionOverview
        },
    })

    export default class FileBrowser extends Vue {
        currentSection: SectionModel | null = null;

        mounted() {
            this.loadSectionData();
        }

        @Watch("$route", {immediate: true, deep: true})

        /**
         * Loads the currently specified section (per url param) from the server
         */
        loadSectionData() {
            let sectionId = this.getSectionId();

            let restCall;
            if (sectionId) {
                restCall = this.$restClient.getSection(sectionId);
            } else {
                restCall = this.$restClient.getTree();
            }

            let that = this;
            restCall.then(function(result: any) {
                if (result.isOk) {
                    let data = result.data;
                    that.currentSection = new SectionModel(data.id, data.name, data.subsections, data.documents, data.resources);
                } else {
                    that.$toasted.show("Error loading section! :-(");
                }
            });
        }

        /**
         * @return the section id to show, or null if the root section should be shown
         */
        getSectionId(): string {
            return this.$route.params.id;
        }

    }
</script>

<style lang="scss" scoped>

</style>
