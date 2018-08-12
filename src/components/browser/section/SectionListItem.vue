<template>
    <div>
        <md-list-item>
            <md-icon>folder</md-icon>
            <span class="md-list-item-text">{{ section.name }}</span>
        </md-list-item>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"

    import SectionModel from "../../../business/rest/model/SectionModel.js"

    export default Vue.extend({
        name: "SectionListItem",
        props: {
            section: {
                type: SectionModel,
                required: true
            },
        },
    })
</script>

<style scoped>

</style>