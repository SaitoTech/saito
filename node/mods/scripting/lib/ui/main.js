const ScriptoriumMainTemplate = require('./main.template.js');
const SignMessageOverlay = require('./overlays/sign_message.js');
const GenerateHashOverlay = require('./overlays/generate_hash.js');
const VerifySignatureOverlay = require('./overlays/verify_signature.js');
const AdvancedScriptOverlay = require('./overlays/advanced_script.js');
const ListNFTsOverlay = require('./overlays/list-nfts');

class ScriptoriumMain {

  constructor(app, mod, container = "") {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.sign_message_overlay = new SignMessageOverlay(this.app, this.mod);
    this.generate_hash_overlay = new GenerateHashOverlay(this.app, this.mod);
    this.verify_signature_overlay = new VerifySignatureOverlay(this.app, this.mod);
    this.advanced_script_overlay = new AdvancedScriptOverlay(this.app, this.mod);
    this.list_nfts_overlay = new ListNFTsOverlay(this.app, this.mod);

    this.is_script_ok = 0;
    this.is_witness_ok = 0;
    this.is_evaluate_ok = 0;

    this.correctness_regexp = /"<[^">]+>"/;

  }

  render(container = "") {
    if (container !== "") {
      this.container = container;
    }

    // Defensive check — if no container defined, default to .main
    if (!this.container || this.container.trim() === "") {
      this.container = ".main";
    }

    const html = ScriptoriumMainTemplate(this.app, this.mod);

    //
    // if scriptorium doesn't exist, append it
    // otherwise, replace its content (for dynamic refresh)
    //
    if (!document.querySelector(".saito-scriptorium")) {
      this.app.browser.addElementToSelector(html, this.container);
    } else {
      this.app.browser.replaceElementBySelector(html, ".saito-scriptorium");
    }

    //
    // dynamic component rendering
    //
    this.renderOpcodes();
    this.attachEvents();

  }



  attachEvents() {

    document.querySelector('.ss-template-select').onchange = (e) => {
      const selectedOp = e.target.value.toLowerCase();
      const op = this.mod.opcodes[selectedOp];
      if (!op) { return; }
      const exampleScript = op.exampleScript || { op: op.name };
      const exampleWitness = op.exampleWitness || {};
      document.querySelector('.ss-script').value = JSON.stringify(exampleScript, null, 2);
      document.querySelector('.ss-witness').value = JSON.stringify(exampleWitness, null, 2);
      this.evaluateScript();
    };

    document.querySelector('.ss-sign-msg').onclick = (e) => {
      this.sign_message_overlay.render();
    }

    document.querySelector('.ss-generate-hash').onclick = (e) => {
      this.generate_hash_overlay.render();
    }

    document.querySelector('.ss-verify-sig').onclick = (e) => {
      this.verify_signature_overlay.render();
    }

    document.querySelector('.ss-list-nfts').onclick = (e) => {
      this.list_nfts_overlay.render();
    }

    document.querySelector('.ss-generate-expert').onclick = (e) => {
      this.enableExpertMode();
      this.advanced_script_overlay.render();
    };

    document.querySelector('.ss-mode-basic').onclick = (e) => {
      this.enableBasicMode();
    };

    document.querySelector('.ss-mode-expert').onclick = (e) => {
      this.enableExpertMode();
    };

    document.querySelector('.ss-script').addEventListener('input', async (e) => {
      await this.evaluateScript();
    });

    document.querySelector('.ss-witness').addEventListener('input', async (e) => {
      await this.evaluateWitness();
    });

  }

  async evaluateScript() {

console.log("EVALUATE SCRIPT FIRED");

    this.is_script_ok = 0;

    try {
      const script_raw = document.querySelector('.ss-script').value;
      const script = JSON.parse(script_raw);
      this.is_script_ok = 1;
      if (this.correctness_regexp.test(script_raw)) {
        this.updateEvalState('script', 'yellow');
      } else {
        this.is_script_ok = 2;
        this.updateEvalState('script', 'green');
      }
      await this.evaluateWitness();
    } catch (err) {
      this.updateEvalState('script', 'gray');
      this.updateEvalState('witness', 'gray');
      this.updateEvalState('eval', 'gray');
    }

  }

  async evaluateWitness() {

    this.is_witness_ok = 0;

    try {
      const witness_raw = document.querySelector('.ss-witness').value;
      const witness = JSON.parse(witness_raw);
      this.is_witness_ok = 1;
      if (this.correctness_regexp.test(witness_raw)) {
        this.updateEvalState('witness', 'yellow');
      } else {
        this.is_witness_ok = 2;
        if (this.is_script_ok >= 2) {
          this.updateEvalState('witness', 'green');
        } else {
          this.updateEvalState('witness', 'yellow');
        }
      }
      await this.evaluateScriptAndWitness();
    } catch (err) {
      this.updateEvalState('witness', 'gray');
      this.updateEvalState('eval', 'gray');
    }
  }

  async evaluateScriptAndWitness() {

    this.is_evaluate_ok = 0;

    try {
console.log("into evaluate script and witness...");

      const script_raw = document.querySelector('.ss-script').value;
console.log("into evaluate script and witness...");
      const hash = this.mod.hash(script_raw); 
console.log("into evaluate script and witness...");
      const witness_raw = document.querySelector('.ss-witness').value;
console.log("into evaluate script and witness...");
      const result = await this.mod.evaluate(hash, script_raw, witness_raw, {}, null, null);

console.log(script_raw);
console.log(hash);
console.log(witness_raw);
console.log(result);

      if (result === true) {
        this.is_evaluate_ok = 1;
        this.updateEvalState('eval', 'green');
      } else {
        this.updateEvalState('eval', 'yellow');
      }
    } catch {
      if (this.is_script_ok && this.is_witness_ok) {
        this.updateEvalState('eval', 'red');
      } else {
        this.updateEvalState('eval', 'gray');
      }
    }

  }

  updateEvalState(which, state) {
    const el = document.querySelector(`.ss-eval-${which}`);
    if (!el) { return; }
    el.classList.remove('green', 'yellow', 'red', 'gray');
    el.classList.add(state);
  }

  enableBasicMode() {

    document.querySelector('.ss-template-select').disabled = false;
    document.querySelector('.ss-template-select').classList.remove('ss-disabled');

    //document.querySelector('.ss-script').readOnly = true;
    //document.querySelector('.ss-witness').readOnly = true;

    document.querySelector('.ss-mode-basic').classList.add('active');
    document.querySelector('.ss-mode-expert').classList.remove('active');

    this.evaluateScript();
  }


  enableExpertMode() {

    document.querySelector('.ss-template-select').disabled = true;
    document.querySelector('.ss-template-select').classList.add('ss-disabled');

    //document.querySelector('.ss-script').readOnly = false;
    //document.querySelector('.ss-witness').readOnly = false;

    document.querySelector('.ss-mode-expert').classList.add('active');
    document.querySelector('.ss-mode-basic').classList.remove('active');

    const scriptBox = document.querySelector('.ss-script');
    const witnessBox = document.querySelector('.ss-witness');

    const scriptVal = scriptBox.value.trim();
    const witnessVal = witnessBox.value.trim();

    if ((scriptVal === "" && witnessVal === "") || (scriptVal.length < 10)) {
      const expertExample = {
        op: "AND",
        args: [
          { op: "CHECKSIG", publickey: "<publickey>", msg: "hello world" },
          { op: "OR",
            args: [
              { op: "CHECKTIME", after: 1720000000 }
            ]
          }
        ]
      };

      scriptBox.value = JSON.stringify(expertExample, null, 2);
      witnessBox.value = JSON.stringify({}, null, 2);
    }

    this.evaluateScript();
  }



  insertIntoWitness(field, value) {
    const textarea = document.querySelector('.ss-witness');
    textarea.value = textarea.value + `\n${field}: "${value}",`;
  }

  setEditMode(mode) {
    console.log(`Switching to ${mode} mode`);
    // placeholder – will toggle views later
  }


  renderOpcodes() {

    const select = document.querySelector('.ss-template-select');
    if (!select || !this.mod.opcodes) { return; }
    select.querySelectorAll('option:not([disabled])').forEach(opt => opt.remove());
    const opEntries = Object.values(this.mod.opcodes).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const op of opEntries) {
      const opt = document.createElement('option');
      opt.value = op.name.toLowerCase();
      opt.textContent = `${op.name} — ${op.description || 'No description'}`;
      select.appendChild(opt);
    }
  }

}

module.exports = ScriptoriumMain;


