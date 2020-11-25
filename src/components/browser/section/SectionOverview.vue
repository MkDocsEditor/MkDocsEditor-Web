<template>
    <div id="section-overview" v-if="section">

        <h2>Section: <b>{{ section.name }}</b></h2>
        <md-list>
            <section-list-item v-bind:key="subsection.id"
                               v-bind:section="subsection"
                               v-for="subsection in section.subsections"
                               v-on:delete-section="deleteSection"
                               v-on:edit-section="editSection"></section-list-item>
        </md-list>
        <md-list>
            <document-list-item v-bind:document="document"
                                v-bind:key="document.id"
                                v-for="document in section.documents"
                                v-on:delete-document="deleteDocument"
                                v-on:edit-document="editDocument"></document-list-item>
        </md-list>
        <md-list>
            <resource-list-item v-bind:key="resource.id"
                                v-bind:resource="resource"
                                v-for="resource in section.resources"
                                v-on:delete-resource="deleteResource"
                                v-on:edit-resource="editResource"></resource-list-item>
        </md-list>

    </div>
</template>

<script lang="ts">
    import {Component, Prop, Vue} from 'vue-property-decorator';

    import SectionModel from '@/business/rest/model/SectionModel';
    import SectionListItem from '@/components/browser/section/SectionListItem.vue';
    import DocumentListItem from '@/components/browser/section/DocumentListItem.vue';
    import ResourceListItem from '@/components/browser/section/ResourceListItem.vue';

    @Component({
        components: {
            SectionListItem,
            DocumentListItem,
            ResourceListItem,
        },
    })

    export default class SectionOverview extends Vue {

        @Prop({type: SectionModel, required: true}) private readonly section!: SectionModel;

        public editSection(id: string): void {
            // this.$toasted.show("edit " + id);
        }

        public deleteSection(id: string): void {
            this.section.subsections = this.section.subsections.filter((section) => section.id !== id);
            // this.$toasted.show("delete " + id)
        }

        public editDocument(id: string): void {
            // this.$toasted.show("edit " + id)
        }

        public deleteDocument(id: string): void {
          this.section.documents = this.section.documents.filter((document) => document.id !== id);
          // this.section.documents = this.section.documents.filter((document) => document.id !== id)
          // this.$toasted.show("delete " + id)
        }

        public editResource(id: string): void {
            // this.$toasted.show("edit " + id)
        }

        public deleteResource(id: string): void {
          this.section.resources = this.section.resources.filter((resource) => resource.id !== id);
            // this.$toasted.show("delete " + id)
        }
    }
</script>

<style lang="scss" scoped>

    #section-overview {
        max-width: 600px;
    }

</style>
