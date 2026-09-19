module.exports = () => {
  return `<div class="rules-overlay saito-overlay-size">
    <h1>TriPeaks Solitaire</h1>
    <ul>
      <li>The tableau is three overlapping peaks: 28 cards in four rows.</li>
      <li>A face-up, uncovered card can be played when its rank is one higher or one lower than the waste card. Suits do not matter. Ace is low; Ace and King are not adjacent.</li>
      <li>Covered cards stay face down until both overlapping cards below them are gone.</li>
      <li>Click the stock to turn a new waste card. That breaks your combo.</li>
      <li>Clear every tableau card to win. If the stock is empty and no play remains, the deal is lost.</li>
      <li>Score: 10 per card, a rising combo bonus for consecutive tableau plays, 50 for each peak, and a clear bonus.</li>
    </ul>
  </div>`;
};
