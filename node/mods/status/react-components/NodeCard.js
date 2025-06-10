import { JsonViewer } from '@textea/json-viewer';
import React, { useState } from 'react';

const NodeCard = ({ onClose, title, peerStats, stats, loading, onOpenPeer }) => {
  const [view, setView] = useState('peerStats');
  const [rawStats, setRawStats] = useState(stats);
  const [rawPeerStats, setRawPeerStats] = useState(peerStats);

  const hasJson = peerStats || stats;

  // Helper to parse peers from peerStats JSON
  let peers = [];
  try {
    const peerStatsObj = peerStats ? JSON.parse(peerStats).index_to_peers : null;
    if (peerStatsObj) {
      peers = peerStatsObj;
    }
  } catch (e) {}

  // Helper to build peer URL
  const buildPeerUrl = (peer) => {
    if (
      !peer.static_peer_config ||
      !peer.static_peer_config.protocol ||
      !peer.static_peer_config.host
    )
      return 'Browser';
    let url = `${peer.static_peer_config.protocol}://${peer.static_peer_config.host}`;
    if (
      (peer.static_peer_config.protocol === 'https' && peer.static_peer_config.port !== 443) ||
      (peer.static_peer_config.protocol === 'http' && peer.static_peer_config.port !== 80)
    ) {
      url += `:${peer.static_peer_config.port}`;
    }
    return url;
  };

  return (
    <div className="node-card">
      <div className="node-card-title">
        <span>{title}</span>
        <div>
          <button
            className={`node-card-tab-btn${view === 'peerStats' ? ' active' : ''}`}
            onClick={() => setView('peerStats')}
          >
            Peers
          </button>
          <button
            className={`node-card-tab-btn${view === 'stats' ? ' active' : ''}`}
            onClick={() => setView('stats')}
          >
            Stats
          </button>
          <button
            className={`node-card-tab-btn${view === 'peers' ? ' active' : ''}`}
            onClick={() => setView('peers')}
          >
            Explore
          </button>
          <button className="node-card-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>
      <div className="node-card-content padded">
        {/* Hidden raw JSON for debugging or future use */}
        <div
          style={{ display: 'none' }}
          data-raw-stats={rawStats}
          data-raw-peer-stats={rawPeerStats}
        ></div>
        {loading ? (
          <div>Loading...</div>
        ) : hasJson ? (
          <>
            {view === 'peerStats' && peerStats && (
              <JsonViewer
                value={JSON.parse(peerStats).index_to_peers}
                displayDataTypes={false}
                displayObjectSize={false}
                rootName={false}
                defaultInspectDepth={1}
              />
            )}
            {view === 'stats' && stats && (
              <JsonViewer
                value={JSON.parse(stats)}
                displayDataTypes={false}
                displayObjectSize={false}
                rootName={false}
                defaultInspectDepth={1}
              />
            )}
            {view === 'peers' && peers && (
              <div>
                <ul className="peer-link-list">
                  {Object.values(peers).map((peer, idx) => {
                    const url = buildPeerUrl(peer);
                    return (
                      <li key={idx} className="peer-link-list-item">
                        <span
                          className="peer-link"
                          onClick={(e) => {
                            e.preventDefault();
                            if (onOpenPeer) onOpenPeer(peer, url);
                          }}
                        >
                          {url}
                        </span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="peer-link-external"
                          title="Open in new tab"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg
                            style={{ width: '0.9em', height: '0.9em', verticalAlign: 'middle' }}
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M7 13L17 3M17 3H10M17 3V10"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : (
          Array.from({ length: 200 }).map((_, i) => <div key={i}>Row {i + 1}</div>)
        )}
      </div>
    </div>
  );
};

export default NodeCard;
