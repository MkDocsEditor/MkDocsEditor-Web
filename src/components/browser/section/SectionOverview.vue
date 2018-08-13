<template>
    <div v-if="section"
         v-on:delete-section="deleteSection($event)"
         v-on:delete-document="deleteDocument($event)"
         v-on:delete-resource="deleteResource($event)"
    >
        <h2>Section: <b>{{ section.name }}</b></h2>
        <md-list>
            <section-list-item v-for="subsection in section.subsections"
                               v-bind:section="subsection" v-bind:key="subsection.id"></section-list-item>
        </md-list>
        <md-list>
            <document-list-item v-for="document in section.documents"
                                v-bind:document="document" v-bind:key="document.id"></document-list-item>
        </md-list>
        <md-list>
            <resource-list-item v-for="resource in section.resources"
                                v-bind:resource="resource" v-bind:key="resource.id"></resource-list-item>
        </md-list>

    </div>
</template>

<script lang="ts">
    import Vue from "vue"

    import SectionModel from "../../../business/rest/model/SectionModel.js"

    import SectionListItem from "./SectionListItem.vue"
    import DocumentListItem from "./DocumentListItem.vue"
    import ResourceListItem from "./ResourceListItem.vue"

    import InputDialog from "../../dialog/InputDialog.vue"

    export default Vue.extend({
        name: "SectionOverview",
        props: {
            section: {
                type: SectionModel,
                required: true
            }
        },
        methods: {
            editSection(id) {

            },
            deleteSection(id) {

            },
            editDocument(id) {

            },
            deleteDocument(id) {

            },
            deleteResource(id) {

            }
        },
        components: {
            InputDialog,
            SectionListItem,
            DocumentListItem,
            ResourceListItem
        }
    })
</script>

<style scoped>

</style>