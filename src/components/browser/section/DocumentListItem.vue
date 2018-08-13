<template>
    <md-card md-with-hover>
        <md-list-item>
            <md-icon>description</md-icon>
            <span class="md-list-item-text">{{ document.name }}</span>
            <md-button class="md-icon-button md-list-action">
                <md-icon>edit</md-icon>
            </md-button>
            <md-button class="md-icon-button md-list-action">
                <md-icon>delete</md-icon>
            </md-button>
        </md-list-item>
    </md-card>
</template>

<script lang="ts">
    import Vue from "vue"

    import DocumentModel from "../../../business/rest/model/DocumentModel.js"

    export default Vue.extend({
        name: "DocumentListItem",
        props: {
            document: {
                type: DocumentModel,
                required: true
            },
        },
    })
</script>

<style scoped>

    .md-card {
        margin: 2px 16px
    }

</style>