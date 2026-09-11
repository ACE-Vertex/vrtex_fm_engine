import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Quasar,
  ClosePopup,
  Dialog,
  Notify,
  QBadge,
  QBtn,
  QIcon,
  QItem,
  QItemLabel,
  QItemSection,
  QList,
  QMenu,
  QSeparator,
  QTooltip,
} from 'quasar'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import './styles/main.scss'
import App from './App.vue'

createApp(App)
  .use(createPinia())
  .use(Quasar, {
    components: { QBadge, QBtn, QIcon, QItem, QItemLabel, QItemSection, QList, QMenu, QSeparator, QTooltip },
    directives: { ClosePopup },
    plugins: { Dialog, Notify },
    config: {
      brand: {
        primary: '#168cff',
        secondary: '#3ab8ff',
        dark: '#080d14',
      },
      notify: {
        position: 'bottom-right',
        timeout: 2400,
      },
    },
  })
  .mount('#app')
