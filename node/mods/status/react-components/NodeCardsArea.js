import React, { useState } from "react";
import NodeCard from "./NodeCard";

const fetchStats = async (url) => {
  try {
    const stats = await fetch(url + "/stats").then(r => r.text());
    const peerStats = await fetch(url + "/stats/peers").then(r => r.text());
    return { stats, peerStats };
  } catch (e) {
    return { stats: null, peerStats: null, error: e.toString() };
  }
};

const NodeCardsArea = () => {
  const [cards, setCards] = useState([
    {
      key: 0,
      title: "Browser",
      peerStats: window.peerStats,
      stats: window.stats,
      loading: window.loading,
      url: null,
    },
  ]);

  const openPeerCard = async (peer, url) => {
    const title = peer.static_peer_config?.host || peer.host;
    setCards(cards => cards.filter(card => card.url !== url));
    const key = Date.now() + Math.random();
    setCards(cards => [
      ...cards,
      { key, title, peerStats: null, stats: null, loading: true, url }
    ]);
    const { stats, peerStats } = await fetchStats(url);
    setCards(cards =>
      cards.map(card =>
        card.key === key
          ? { ...card, stats, peerStats, loading: false }
          : card
      )
    );
  };

  const closeCard = (key) => {
    setCards(cards => cards.filter(card => card.key !== key));
  };

  return (
    <div className="node-cards-area">
      {cards.map(card => (
        <NodeCard
          key={card.key}
          onClose={() => closeCard(card.key)}
          title={card.title}
          peerStats={card.peerStats}
          stats={card.stats}
          loading={card.loading}
          onOpenPeer={openPeerCard}
        />
      ))}
    </div>
  );
};

export default NodeCardsArea; 