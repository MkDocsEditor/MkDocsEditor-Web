<template>
    <div>
        <h1>File Browser</h1>
        <section-overview v-if="currentSection" :section="currentSection"></section-overview>
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
            let that = this;
            this.$restClient.getTree().then(function (result) {
                let data = result.data;

                that.currentSection = new SectionModel(data.id, data.name, data.subsections, data.documents, data.resources);
            });
        },
        methods: {}
    })
</script>

<style scoped>

</style>