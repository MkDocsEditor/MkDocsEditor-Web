<template>
    <div style="text-align: center;">
        <h1>
            <md-avatar>
                <img alt="App Logo" src="../../../assets/logo.png">
            </md-avatar>
            {{ $appName }}
        </h1>

        <p>
            MkDocsEditor is a Markdown editor for MkDocs projects.
        </p>
        <p>
            It communicates with the <a href="https://github.com/MkDocsEditor/MkDocsEditor-Backend">mkdocsrest</a>
            backend and allows easy
            editing of Markdown files.
        </p>

        <h3>More Info</h3>

        <div>
            <md-avatar>
                <img alt="Markus Ressel" src="https://avatars1.githubusercontent.com/u/14024504">
            </md-avatar>

            <span>Markus Ressel</span>

            <md-button class="md-icon-button md-list-action"
                       v-on:click="openLinkInNewTab('https://github.com/markusressel')">
                <md-icon class="md-primary">link</md-icon>
            </md-button>
        </div>

    </div>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';

    @Component({})

    export default class AboutApp extends Vue {

        public openLinkInNewTab(url: string): void {
            window.open(url.toString(), '_blank');
        }

    }
</script>

<style lang="scss" scoped>
    /*#avatarMarkus {*/
    /*    display: flex;*/
    /*    align-items: center;*/
    /*    justify-content: space-between;*/
    /*}*/
</style>
