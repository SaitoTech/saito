  
  returnSecretObjectives() {
    return this.secret_objectives;
  }
  
  importSecretObjective(name, obj) {

    if (obj.name == null) 	{ obj.name = "Unknown Objective"; }
    if (obj.text == null)	{ obj.type = "Unclear Objective"; }
    if (obj.minPlayers == null) { obj.minPlayers = 2; }
    if (obj.type == null)	{ obj.type = "normal"; }
    if (obj.phase == null)	{ obj.type = "imperial"; } // "action" if can be scored at end of turn
    if (obj.img  == null) 	{ obj.img = "/imperium/img/cards/secret_objective_1.png"; }
    if (obj.vp == null)		{ obj.vp = 1; }

    if (obj.returnCardImage == null) {
      obj.returnCardImage = function() {
        return `
          <article class="objective-card is-secret">
            <div class="objective-card-art" style="background-image: url(${obj.img})">
              <div class="objective-card-vp">${obj.vp}</div>
            </div>
            <div class="objective-card-body">
              <div class="objective-card-kind">Secret</div>
              <div class="objective-card-name">${obj.name}</div>
              <div class="objective-card-text">${obj.text}</div>
            </div>
          </article>
        `;
      };
    }

    obj = this.addEvents(obj);
    this.secret_objectives[name] = obj;

  }  


  returnStageIPublicObjectives() {
    return this.stage_i_objectives;
  }
  
  importStageIPublicObjective(name, obj) {

    if (obj.name == null) 	{ obj.name = "Unknown Objective"; }
    if (obj.text == null)	{ obj.type = "Unclear Objective"; }
    if (obj.type == null)	{ obj.type = "normal"; }
    if (obj.img  == null) 	{ obj.img = "/imperium/img/cards/victory_point_1.png"; }
    if (obj.vp == null)		{ obj.vp = 1; }

    if (obj.returnCardImage == null) {
      obj.returnCardImage = function() {
        return `
          <article class="objective-card is-stage-i">
            <div class="objective-card-art" style="background-image: url(${obj.img})">
              <div class="objective-card-vp">${obj.vp}</div>
            </div>
            <div class="objective-card-body">
              <div class="objective-card-kind">Stage I</div>
              <div class="objective-card-name">${obj.name}</div>
              <div class="objective-card-text">${obj.text}</div>
            </div>
          </article>
        `;
      };
    }

    obj = this.addEvents(obj);
    this.stage_i_objectives[name] = obj;

  }  


  returnStageIIPublicObjectives() {
    return this.stage_ii_objectives;
  }
  
  importStageIIPublicObjective(name, obj) {

    if (obj.name == null) 	{ obj.name = "Unknown Objective"; }
    if (obj.text == null)	{ obj.type = "Unclear Objective"; }
    if (obj.type == null)	{ obj.type = "normal"; }
    if (obj.img  == null) 	{ obj.img = "/imperium/img/cards/objective_card_1_template.png"; }
    if (obj.vp == null)		{ obj.vp = 2; }

    if (obj.returnCardImage == null) {
      obj.returnCardImage = function() {
        return `
          <article class="objective-card is-stage-ii">
            <div class="objective-card-art" style="background-image: url(${obj.img})">
              <div class="objective-card-vp">${obj.vp}</div>
            </div>
            <div class="objective-card-body">
              <div class="objective-card-kind">Stage II</div>
              <div class="objective-card-name">${obj.name}</div>
              <div class="objective-card-text">${obj.text}</div>
            </div>
          </article>
        `;
      };
    }

    obj = this.addEvents(obj);
    this.stage_ii_objectives[name] = obj;

  }  



