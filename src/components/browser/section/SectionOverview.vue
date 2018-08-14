<template>
    <div id="section-overview" v-if="section">

        <h2>Section: <b>{{ section.name }}</b></h2>
        <md-list>
            <section-list-item v-for="subsection in section.subsections"
                               v-bind:section="subsection"
                               v-bind:key="subsection.id"
                               v-on:delete-section="deleteSection"
                               v-on:edit-section="editSection"></section-list-item>
        </md-list>
        <md-list>
            <document-list-item v-for="document in section.documents"
                                v-bind:document="document"
                                v-bind:key="document.id"
                                v-on:delete-document="deleteDocument"
                                v-on:edit-document="editDocument"></document-list-item>
        </md-list>
        <md-list>
            <resource-list-item v-for="resource in section.resources"
                                v-bind:resource="resource"
                                v-bind:key="resource.id"
                                v-on:delete-resource="deleteResource"
                                v-on:edit-resource="editResource"></resource-list-item>
        </md-list>

    </div>
</template>

<script lang="ts">
    import Vue from "vue"

    import SectionModel from "../../../business/rest/model/SectionModel.js"

    import SectionListItem from "./SectionListItem.vue"
    import DocumentListItem from "./DocumentListItem.vue"
    import ResourceListItem from "./ResourceListItem.vue"

    export default Vue.extend({
        name: "SectionOverview",
        props: {
            section: {
                type: SectionModel,
                required: true
            }
        },
        methods: {
            editSection: function (id) {
                // this.$toasted.show('edit ' + id);
            },
            deleteSection: function (id) {
                // this.$toasted.show('delete ' + id)
            },
            editDocument: function (id) {
                // this.$toasted.show('edit ' + id)
            },
            deleteDocument: function (id) {
                // this.$toasted.show('delete ' + id)
            },
            editResource: function (id) {
                // this.$toasted.show('edit ' + id)
            },
            deleteResource: function (id) {
                // this.$toasted.show('delete ' + id)
            }
        },
        components: {
            SectionListItem,
            DocumentListItem,
            ResourceListItem
        }
    })
</script>

<style scoped>

    #section-overview {
        max-width: 600px;
    }

</style>