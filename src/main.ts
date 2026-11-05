import '@fontsource-variable/roboto'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import vuetify from './plugins/vuetify'
import router from './router'
import { loadConfig } from './config'
import './styles/tokens.css'
import './styles/vuetify.css'

async function bootstrap(): Promise<void> {
  await loadConfig()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(vuetify)
  app.mount('#app')
}

void bootstrap()
