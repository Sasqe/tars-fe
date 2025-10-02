import './App.css';
import Canvas from './components/Canvas';
import Skeleton from './components/Render';
import {useState} from "react";

function App() {
  const [prediction, setPrediction] = useState(null);
  return (
    <div className="App">
      <div className="main-container">
        <Skeleton prediction={prediction} />
        <Canvas onResult={setPrediction}/>
      </div>
    </div>
  );
}

export default App;
