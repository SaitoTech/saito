module.exports = () => {
  return `
    <div class="combat-overlay">
      <div class="combat-attackers">
        <h3>Attacking Creatures</h3>
        <div class="attackers-row"></div>
      </div>

      <div class="combat-blockers">
        <h3>Assign Defenders</h3>
        <div class="blockers-row"></div>
      </div>

      <div class="combat-actions">
        <button id="submit-defense" class="combat-btn">Submit Defense</button>
      </div>
    </div>
  `;
};


