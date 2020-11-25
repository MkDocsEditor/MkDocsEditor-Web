<template>
    <div class="full-control">
        <md-list>
            <md-subheader>Server</md-subheader>

            <md-list-item>
                <md-field>
                    <label>URL</label>
                    <md-input placeholder="http://localhost:7413" v-model="settings.server.url"></md-input>
                </md-field>
            </md-list-item>
        </md-list>

        <md-list>
            <md-subheader>Authentication</md-subheader>

            <md-list-item>
                <md-checkbox v-model="settings.server.auth.enabled">
                    <label>Enabled</label>
                </md-checkbox>
            </md-list-item>

            <md-list-item>
                <md-field>
                    <label>Username</label>
                    <md-input v-model="settings.server.auth.username"></md-input>
                </md-field>
            </md-list-item>

            <md-list-item>
                <md-field>
                    <label>Password</label>
                    <md-input type="password" v-model="settings.server.auth.password"></md-input>
                </md-field>
            </md-list-item>
        </md-list>

        <md-list>
            <md-subheader>Editor</md-subheader>

            <md-list-item>
                <md-field>
                    <label>Default view</label>
                    <md-select id="editorOpenDefault" name="opendefault" v-model="settings.editor.openDefault">
                        <md-option value="both">Editor & Preview</md-option>
                        <md-option value="preview">Only Preview</md-option>
                        <md-option value="editor">Only Editor</md-option>
                    </md-select>
                </md-field>
            </md-list-item>
        </md-list>
    </div>
</template>

<script lang="ts">
    import {Component, Vue, Watch} from 'vue-property-decorator';
    import PreferenceItems from '@/business/persistence/preferences/PreferenceItems';
    import PreferenceItem from '@/business/persistence/preferences/PreferenceItem';

    @Component({})

    export default class Settings extends Vue {
        private settings = {
            server: {
                url: 'http://localhost:7413',
                auth: {
                    enabled: false,
                    username: '',
                    password: '',
                },
            },
            editor: {
                openDefault: '',
            },
        };

        @Watch('settings', {immediate: false, deep: true})
        public onSettingsChanged() {
            this.savePreferenceValue(PreferenceItems.Server.URL, this.settings.server.url);

            this.savePreferenceValue(PreferenceItems.Server.Auth.Enabled, this.settings.server.auth.enabled);
            this.savePreferenceValue(PreferenceItems.Server.Auth.Username, this.settings.server.auth.username);

            // TODO: encrypt saved credentials somehow
            this.savePreferenceValue(PreferenceItems.Server.Auth.Password, this.settings.server.auth.password);

            this.savePreferenceValue(PreferenceItems.Editor.openDefault, this.settings.editor.openDefault);
        }

        public mounted(): void {
            this.settings.server.url = this.loadPreferenceValue(PreferenceItems.Server.URL);

            this.settings.server.auth.enabled = (this.loadPreferenceValue(PreferenceItems.Server.Auth.Enabled) === 'true');
          this.settings.server.auth.username = this.loadPreferenceValue(PreferenceItems.Server.Auth.Username);
            this.settings.server.auth.password = this.loadPreferenceValue(PreferenceItems.Server.Auth.Password);

            this.settings.editor.openDefault = this.loadPreferenceValue(PreferenceItems.Editor.openDefault);
        }

        /**
         * Load a preference from local storage into data section of this component
         *
         * @param preferenceItem the preference item
         */
        public loadPreferenceValue(preferenceItem: PreferenceItem): any {
            return this.$preferenceManager.loadPreferenceValue(preferenceItem);
        }

        /**
         * Save a preference in local storage
         *
         * @param storeKey the key to use in local storage
         * @param newValue the new value to assign to it
         */
        public savePreferenceValue(storeKey: PreferenceItem, newValue: any): any {
            this.$preferenceManager.savePreferenceValue(storeKey, newValue);
        }
    }
</script>

<style lang="scss" scoped>
    .full-control > .md-list {
        width: 320px;
        /*max-width: 100%;*/
        display: inline-block;
        overflow: auto;
        border: 1px solid rgba(#000, .12);
        vertical-align: top;
        margin: 4px;
    }
</style>
