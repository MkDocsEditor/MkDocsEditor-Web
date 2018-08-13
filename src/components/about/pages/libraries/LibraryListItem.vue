<template>
    <md-card md-with-hover>
        <md-card-header>{{ library.name }}</md-card-header>
        <md-card-content>
            {{ library.description}}
        </md-card-content>
        <md-card-actions v-if="library.url">
            <md-button v-if="library.url" v-on:click="openLinkInNewTab">Link</md-button>
        </md-card-actions>
    </md-card>
</template>

<script lang="ts">
    import Vue from "vue"

    export default Vue.extend({
        name: 'LibraryListItem',
        props: {
            library: {}
        },
        methods: {
            openLinkInNewTab() {
                window.open(this.library.url.toString(), '_blank');
            },
        }
    })
</script>

<style scoped>
    .md-card {
        margin: 4px;
    }
</style>
