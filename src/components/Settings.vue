<template>
    <div class="full-control">
        <md-list>
            <md-subheader>Notifications</md-subheader>

            <md-list-item>
                <md-checkbox v-model="notification" value="light"/>
                <span class="md-list-item-text">Notification light</span>
            </md-list-item>
        </md-list>

        <md-list>
            <md-subheader>Server</md-subheader>

            <md-list-item>
                <md-field>
                    <label>URL</label>
                    <md-input v-model="settings.server.url"></md-input>
                </md-field>
            </md-list-item>

            <md-list-item>
                <md-field>
                    <label>Username</label>
                    <md-input v-model="settings.server.username"></md-input>
                </md-field>
            </md-list-item>

            <md-list-item>
                <md-field>
                    <label>Password</label>
                    <md-input v-model="settings.server.password" type="password"></md-input>
                </md-field>
            </md-list-item>

        </md-list>

        <md-list>
            <md-subheader>MkDocs Editor</md-subheader>

            <md-list-item>
                <md-icon>network_wifi</md-icon>
                <span class="md-list-item-text">WiFi</span>
                <md-switch v-model="settings.wifi"/>
            </md-list-item>

            <md-list-item>
                <md-icon>bluetooth</md-icon>
                <span class="md-list-item-text">Bluetooth</span>
                <md-switch v-model="settings.bluetooth"/>
            </md-list-item>

            <md-list-item>
                <md-icon>data_usage</md-icon>
                <span class="md-list-item-text">Data Usage</span>
            </md-list-item>
        </md-list>
    </div>
</template>

<script>
    export default {
        name: 'Settings',
        data: () => ({
            ringtone: 'peace',
            settings: {
                server: {
                    url: "",
                    username: "",
                    password: ""
                },
                wifi: true,
                bluetooth: false
            },
            notification: ['sound', 'vibrate']
        })
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
    }
</style>