<template>
    <div>
        <h1>File Browser</h1>
        <section-overview v-if="currentSection" :section="currentSection"></section-overview>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"
    import SectionModel from "../../business/rest/model/SectionModel.js"
    import DocumentModel from "../../business/rest/model/DocumentModel.js"
    import ResourceModel from "../../business/rest/model/ResourceModel.js"
    import SectionOverview from "./section/SectionOverview.vue"

    export default Vue.extend({
        name: "FileBrowser",
        components: {
            SectionOverview
        },
        data: () => ({
            currentSection: new SectionModel(0, "root",
                [
                    new SectionModel(1, "Some subsection", [], [], [])
                ],
                [
                    new DocumentModel(0, "Main.md", 100, 0),
                    new DocumentModel(1, "Second.md", 200, 0),
                    new DocumentModel(2, "Third.md", 300, 0)
                ],
                [
                    new ResourceModel(0, "text.txt", 10, 0)
                ])
        }),
        mounted: function () {
        },
        methods: {}
    })
</script>

<style scoped>

</style>