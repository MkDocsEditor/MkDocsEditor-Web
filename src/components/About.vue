<template>
    <div>

        <md-list-item>
            <md-avatar>
                <img src="../assets/logo.png" alt="App Logo">
            </md-avatar>
            <h1>{{ $appName }}</h1>
        </md-list-item>

        <p>
            MkDocs Editor is a Markdown editor for MkDocs projects.
        </p>
        <p>
            It communicates with the <a href="">mkdocsrest</a> backend and allows easy
            editing of Markdown files.
        </p>

        <h3>More Info</h3>

        <md-list-item>
            <md-avatar>
                <img src="https://avatars1.githubusercontent.com/u/14024504" alt="Markus Ressel">
            </md-avatar>

            <span class="md-list-item-text">Markus Ressel</span>

            <md-button v-on:click="openLinkInNewTab('https://github.com/markusressel')" class="md-icon-button md-list-action">
                <md-icon class="md-primary">link</md-icon>
            </md-button>
        </md-list-item>

    </div>
</template>

<script>
    export default {
        name: 'About',
        props: {
            msg: String
        },
        methods: {
            openLinkInNewTab(url) {
                window.open(url.toString(), '_blank');
            }
        }
    }
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
    h3 {
        margin: 40px 0 0;
    }

    ul {
        list-style-type: none;
        padding: 0;
    }

    li {
        display: inline-block;
        margin: 0 10px;
    }

    a {
        color: #42b983;
    }
</style>
