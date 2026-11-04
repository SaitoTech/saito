
    //
    // final sanity check for NFT-provided cards
    //
    const nft = (this.game.options?.nfts || []).find((n) => String(n.id) === String(card));
    const raw_code = nft?.data?.code || this.game.deck[0]?.cards?.[card]?.code;
    const code = resolveExecutableCode(raw_code);
    if (typeof code === 'string' && code.trim()) {
      if (!i_played_the_card) {
        return 0;
      }
      const api = this.returnApi();
      const context = this.returnContext(card);
      // No EXEC wall-clock timeout: NFT scripts may await player HUD input.
      // Script return 0 → pause queue (interactive / endTurn path).
      // Any other return → continue queue (playEvent returns 1).
      try {
        const result = await this.app.browser.executeJS(
          code,
          { api, context },
          { maxExecutionTime: 0 }
        );
        return result === 0 ? 0 : 1;
      } catch (err) {
        console.error('NFT event failed', card, err);
        return 0;
      }
    }

    //
    // return 0 so other cards do not trigger infinite loop
    //
    return 0;
  }






  //
  // arcade uses
  //
  returnShortGameOptionsArray(options) {

    let sgo = super.returnShortGameOptionsArray(options);
    let nsgo = [];

    for (let i in sgo) {
      let output_me = 1;
      if (output_me == 1) {
        nsgo[i] = sgo[i];
      }
    }

    return nsgo;
  }




  preloadImages() {

    let allImages = [
        "img/backgrounds/europe-scoring-bg.png",
        "img/backgrounds/asia-scoring-bg.png",
        "img/backgrounds/mideast-scoring-bg.png",
        "img/backgrounds/africa-scoring-bg.png",
        "img/backgrounds/southamerica-scoring-bg.png",
        "img/backgrounds/centralamerica-scoring-bg.png",
        "img/backgrounds/seasia-scoring-bg.png",
        "img/backgrounds/indopaki-bg.jpg",
        "img/backgrounds/arabisraeli-bg.jpg",
        "img/backgrounds/iraniraq-bg.jpg",
        "img/backgrounds/koreanwar-bg.jpg",
        "img/backgrounds/brushwar-bg.jpg"
    ];
    
    this.preloadImageArray(allImages, 0);

  }
  preloadImageArray(imageArray=[], idx=0) {

    let pre_images = [imageArray.length];

    if (imageArray && imageArray.length > idx) {
      pre_images[idx] = new Image();
      pre_images[idx].onload = () => {
        this.preloadImageArray(imageArray, idx+1);
      }
      pre_images[idx].src = "/twilight/" + imageArray[idx];
    }

  }





} // end Twilight class

module.exports = Twilight;



