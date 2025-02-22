import './App.css';
import Canvas from './components/Canvas';
import Skeleton from './components/Render';

function App() {
  return (
    <div className="App">
      <div className="main-container">
        <Skeleton />
        <Canvas />
      </div>
    </div>
  );
}

export default App;
