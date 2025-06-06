import { JsonViewer } from "@textea/json-viewer";
import React, { useState } from "react";

const NodeCard = ({ onClose, peerStats, stats, loading }) => {
  const [view, setView] = useState('peerStats');

  const hasJson = peerStats || stats;

  return (
    <div className="node-card">
      <div className="node-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>title</span>
        <button className="node-card-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="node-card-content padded">
        {loading ? (
          <div>Loading...</div>
        ) : hasJson ? (
          <>
            <div style={{ marginBottom: '1rem' }}>
              {peerStats && (
                <button
                  onClick={() => setView('peerStats')}
                  style={{ fontWeight: view === 'peerStats' ? 'bold' : 'normal', marginRight: '0.5rem' }}
                >
                  Peer Stats
                </button>
              )}
              {stats && (
                <button
                  onClick={() => setView('stats')}
                  style={{ fontWeight: view === 'stats' ? 'bold' : 'normal' }}
                >
                  Stats
                </button>
              )}
            </div>
            {view === 'peerStats' && peerStats && (
              <JsonViewer value={peerStats} displayDataTypes={false} displayObjectSize={false} />
            )}
            {view === 'stats' && stats && (
              <JsonViewer value={stats} displayDataTypes={false} displayObjectSize={false} />
            )}
          </>
        ) : (
          Array.from({ length: 200 }).map((_, i) => (
            <div key={i}>Row {i + 1}</div>
          ))
        )}
      </div>
    </div>
  );
};


export default NodeCard; 