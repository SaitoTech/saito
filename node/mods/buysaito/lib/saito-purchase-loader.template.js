module.exports = (app, mod, self, msg) => {
  return `
    <style>

    #purchase-container {
      background: var(--saito-background-color);
      display: flex;
      height: fit-content;
      width: 75rem;
      justify-content: space-between;
      padding: 5rem;
      font-size: 2rem;
      display: flex;
      flex-direction: column;
      text-align: center;
      font-size: 2.5rem;
      gap: 3rem;
    }

    #purchase-container img {
      height: 15rem;
    }

    </style>

    <div class="" id="purchase-container">
      <div>${msg}</div> 
      <img class="spinner" src="/saito/img/spinner.svg">
    </div>
  `;
};
