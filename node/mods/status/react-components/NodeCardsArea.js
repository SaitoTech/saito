import React, { useEffect, useState } from "react";
import NodeCard from "./NodeCard";

const NodeCardsArea = () => {

  return (
    <div className="node-cards-area">
      {window.peerStats && window.stats && (
        <NodeCard
          key={0}
          onClose={() => {}}
          peerStats={window.peerStats}
          stats={window.stats}
          loading={window.loading}
        />
      )}
    </div>
  );
};

export default NodeCardsArea; 