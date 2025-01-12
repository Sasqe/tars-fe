import './App.css';
import Canvas from './components/Canvas';
import Render from './components/Render';

function App() {
  return (
    <div className="App">
      <div className="main-container">
        <Render />
        <Canvas />
      </div>
    </div>
  );
}

export default App;
