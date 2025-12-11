const ManaTemplate = require('./mana.template');

class Mana {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.player = 0;
		this.tapped = 0;
		this.untapped = 0;
		this.tapped_add_pop = 0;
		this.untapped_add_pop = 0;
	}

	render() {

		//
		//
		//
                if (document.querySelector(`${this.container} #mana-wheel`)) {
                        this.app.browser.replaceElementBySelector(ManaTemplate(), `${this.container} #mana-wheel`);
                } else {
                        this.app.browser.addElementToSelector(
                                ManaTemplate(),
                                this.container
                        );
                }

		let mana = this.mod.returnAvailableMana(this.player);

		//
		// swap in total mana
		//
		let swap_in_tapped = 1;
		for (let key in mana) { if (mana[key] > 0 && swap_in_tapped == 1) { swap_in_tapped = 0; } }
		if (swap_in_tapped) { mana = this.mod.returnAvailableMana(this.player, true); } // true = include tapped

		let slot = document.querySelector(this.container);
  		const svg = slot.querySelector(`.mana-pie`);
  		const total = Math.max(mana.total, 1);
  		const colors = ["red", "green", "blue", "white", "black"];
  		let startAngle = 0;

  		colors.forEach(color => {

  		  let value = mana[color] || 0;
  		  let percent = value / total;
  		  let endAngle = startAngle + percent * 2 * Math.PI;
  		  let largeArc = percent > 0.5 ? 1 : 0;

		  if (percent >= 1) {
		    let path = svg.querySelector(`.mana.${color}`);
		    path.setAttribute("d","M 50 50 m -50, 0 a 50,50 0 1,0 100,0 a 50,50 0 1,0 -100,0");
		    path.style.display = "";
		    startAngle = endAngle;
		    return;
		  }

  		  const x1 = 50 + 50 * Math.cos(startAngle);
  		  const y1 = 50 + 50 * Math.sin(startAngle);
  		  const x2 = 50 + 50 * Math.cos(endAngle);
  		  const y2 = 50 + 50 * Math.sin(endAngle);

  		  const path = svg.querySelector(`.mana.${color}`);
    		  if (value > 0) {
  		    const d = [
  		      `M 50 50`,
  		      `L ${x1} ${y1}`,
  		      `A 50 50 0 ${largeArc} 1 ${x2} ${y2}`,
  		      `Z`
  		    ].join(" ");
  		    path.setAttribute("d", d);
  		    path.style.display = "";
  		  } else {
  		    path.style.display = "none";
  		  }

  		  startAngle = endAngle;
  		});

  		let total_untapped = slot.querySelector('.mana-total .untapped');
  		let total_tapped = slot.querySelector('.mana-total .tapped');
  		total_untapped.textContent = this.untapped;
  		total_tapped.textContent = this.tapped + this.untapped;

		if (this.tapped_add_pop) {
		  total_tapped.classList.remove('pop');
		  void total_tapped.offsetWidth;
		  total_tapped.classList.add('pop');
		}

		if (this.untapped_add_pop) {
		  total_untapped.classList.remove('pop');
		  void total_untapped.offsetWidth;
		  total_untapped.classList.add('pop');
		}


	}

	attachEvents() {

	}

}

module.exports = Mana;
