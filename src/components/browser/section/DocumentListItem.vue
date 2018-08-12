<template>
    <div>
        <md-list-item>
            <md-icon>description</md-icon>
            <span class="md-list-item-text">{{ document.name }}</span>
        </md-list-item>
    </div>
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

</style>