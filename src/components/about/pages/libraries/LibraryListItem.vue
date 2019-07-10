<template>
    <md-card md-with-hover>
        <md-card-header>
            <md-card-header-text>
                <div class="md-title">{{ library.name }}</div>
                <div class="md-subhead">{{ library.license}}</div>
            </md-card-header-text>

            <md-card-media v-if="library.imageUrl">
                <img :src="library.imageUrl" alt="Library Image">
            </md-card-media>
        </md-card-header>

        <md-card-content>
            <div v-if="library.author">
                <b>Author:</b>
                {{ library.author}}

            </div>
            <div v-if="library.description">
                <b>Description:</b>
                {{ library.description}}
            </div>
        </md-card-content>
        <md-card-actions v-if="library.url">
            <md-button v-if="library.url" v-on:click="openLinkInNewTab">Link</md-button>
        </md-card-actions>
    </md-card>
</template>

<script lang="ts">
    import {Component, Prop, Vue} from "vue-property-decorator";
    import Library from "@/components/about/pages/libraries/Library";

    @Component({})
    export default class LibraryListItem extends Vue {

        @Prop(Library) readonly library!: Library;

        openLinkInNewTab() {
            window.open(this.library.url.toString(), "_blank");
        }

    }
</script>

<style lang="scss" scoped>
    .md-card {
        margin: 4px;
    }

    .md-card .md-card-content {
        white-space: pre-line;
    }

    .md-card .md-card-content div {
        white-space: pre-line;
    }
</style>
