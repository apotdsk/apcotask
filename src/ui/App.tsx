import './App.css'
import { MainWindow } from './main/MainWindow'
import { WidgetWindow } from './widget/WidgetWindow'

function App() {
  const isWidget = new URLSearchParams(window.location.search).get('window') === 'widget'

  return isWidget ? <WidgetWindow /> : <MainWindow />
}

export default App
