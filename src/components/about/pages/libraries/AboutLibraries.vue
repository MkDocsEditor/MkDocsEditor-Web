<template>
    <md-list>
        <library-list-item v-for="library in libraries"
                           v-bind:key="library.name"
                           v-bind:library="library"></library-list-item>
    </md-list>
</template>

<script lang="ts">
    import Vue from "vue"
    import LibraryListItem from "./LibraryListItem.vue"

    export default Vue.extend({
        name: 'AboutLibraries',
        props: {
            libraries: Array
        },
        methods: {
            openLinkInNewTab(url) {
                window.open(url.toString(), '_blank');
            }
        },
        components: {
            LibraryListItem,
        }
    })
</script>

<style scoped>
    li {
        display: inline-block;
    }
</style>
