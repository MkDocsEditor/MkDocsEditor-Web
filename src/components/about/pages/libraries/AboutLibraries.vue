<template>
    <md-list>
        <library-list-item v-for="library in libraries"
                           v-bind:key="library.name"
                           v-bind:library="library"></library-list-item>
    </md-list>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';
    import LibraryListItem from '@/components/about/pages/libraries/LibraryListItem.vue';

    @Component({
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
    export default class AboutLibraries extends Vue {
    }
</script>

<style lang="scss" scoped>
</style>
