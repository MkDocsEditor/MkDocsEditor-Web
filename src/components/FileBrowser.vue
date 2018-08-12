<template>
    <div>
        <h1>File Browser</h1>
        <section-view :section="currentSection"></section-view>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"
    import SectionModel from "../business/rest/model/SectionModel.js"
    import DocumentModel from "../business/rest/model/DocumentModel.js"
    import ResourceModel from "../business/rest/model/ResourceModel.js"
    import SectionView from "./SectionView.vue"

    export default Vue.extend({
        name: "FileBrowser",
        components: {
            SectionView
        },
        data: () => ({
            currentSection: new SectionModel(0, "root",
                [
                    new SectionModel(1, "Some subsection", [], [], [])],
                [
                    new DocumentModel(0, "Main.md", 100, 0)],
                [
                    new ResourceModel(0, "text.txt", 10, 0)]
            )
        }),
        methods: {}
    })
</script>

<style scoped>

</style>