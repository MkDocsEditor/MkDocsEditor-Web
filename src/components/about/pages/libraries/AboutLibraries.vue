<template>
    <md-list>
        <library-list-item v-bind:key="library.name"
                           v-bind:library="library"
                           v-for="library in libraries"></library-list-item>
    </md-list>
</template>

<script lang="ts">
    import {Component, Prop, Vue} from 'vue-property-decorator';
    import LibraryListItem from '@/components/about/pages/libraries/LibraryListItem.vue';
    import Library from '@/components/about/pages/libraries/Library';

    @Component({
        components: {
            LibraryListItem,
        },
    })

    export default class AboutLibraries extends Vue {

        @Prop({type: Array, default: []}) protected readonly libraries!: Library[];

        public openLinkInNewTab(url: string): void {
            window.open(url.toString(), '_blank');
        }

    }
</script>

<style lang="scss" scoped>
</style>
