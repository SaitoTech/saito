import React from "react";
import Header from "./Header";
import NodeCardsArea from "./NodeCardsArea";

const App = () => {
  return (
    <div className="app-container">
      <Header />
      <div className="app-main">
        <NodeCardsArea />
      </div>
    </div>
  );
};

export default App; 