<template>
    <div class="page-container">
        <md-app>
            <md-app-toolbar class="md-primary" md-elevation="0">
                <md-button class="md-icon-button" @click="toggleMenu" v-if="!menuVisible">
                    <md-icon>menu</md-icon>
                </md-button>
                <span class="md-title">{{ $appName }}</span>
            </md-app-toolbar>

            <md-app-drawer :md-active.sync="menuVisible" md-persistent="mini">
                <md-toolbar class="md-transparent" md-elevation="0">
                    <span>Navigation</span>

                    <div class="md-toolbar-section-end">
                        <md-button class="md-icon-button md-dense" @click="toggleMenu">
                            <md-icon>keyboard_arrow_left</md-icon>
                        </md-button>
                    </div>
                </md-toolbar>

                <md-list>
                    <router-link to="/file_browser">
                        <md-list-item>
                            <md-icon>list</md-icon>
                            <span class="md-list-item-text">File Browser</span>
                        </md-list-item>
                    </router-link>

                    <router-link to="/settings">
                        <md-list-item>
                            <md-icon>settings</md-icon>
                            <span class="md-list-item-text">Settings</span>
                        </md-list-item>
                    </router-link>

                    <router-link to="/about">
                        <md-list-item>
                            <md-icon>info</md-icon>
                            <span class="md-list-item-text">About</span>
                        </md-list-item>
                    </router-link>
                </md-list>
            </md-app-drawer>

            <md-app-content>
                <router-view></router-view>
            </md-app-content>
        </md-app>
    </div>
</template>

<script>
    import FileBrowser from "./components/FileBrowser";

    export default {
        name: 'MainAppLayout',
        components: {FileBrowser},
        data: () => ({
            menuVisible: false
        }),
        methods: {
            toggleMenu() {
                this.menuVisible = !this.menuVisible
            }
        }
    }
</script>

<style lang="scss">
    * {
        font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    }
</style>

<style lang="scss" scoped>
    .md-app {
        min-height: 350px;
        border: 1px solid rgba(#000, .12);
    }

    // Demo purposes only
    .md-drawer {
        width: 230px;
        max-width: calc(100vw - 125px);
    }
</style>