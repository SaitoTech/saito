module.exports = (app, mod, witness_overlay={}) => {

  let access_script = witness_overlay.access_script || '{\n  "op": "CHECKHASH",\n  "hash": "..."\n}';

  // Parse and pretty-print the access script if it's a string
  let scriptDisplay = '';
  try {
    if (typeof access_script === 'string') {
      // Try to parse as JSON and pretty-print
      let parsed = JSON.parse(access_script);
      scriptDisplay = JSON.stringify(parsed, null, 2);
    } else {
      // Already an object, just stringify with formatting
      scriptDisplay = JSON.stringify(access_script, null, 2);
    }
  } catch (err) {
    // If parsing fails, use the original value (might be malformed JSON or plain text)
    scriptDisplay = typeof access_script === 'string' ? access_script : JSON.stringify(access_script);
  }

  // Escape HTML special characters for safe insertion
  scriptDisplay = scriptDisplay
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  let msg = `

    <div class="create-nft-container">
   
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               PROVIDE WITNESS DATA
            </div>
         </div>
      </div>

      <div class="nft-creator">
        <div class="dropdown-cont vault-scripting-intro">
	  This file is protected by a custom access script. For access, you must satisfy the conditions
	  created on its creation. The access script that protects it is shown below, followed by 
	  a field where you can enter your witness data.
        </div>

        <div class="witness-dual-textarea-container">
          <div class="witness-textarea-section">
            <label class="witness-textarea-label">Access Script (Read-Only):</label>
            <textarea class="witness-script-textarea" id="witness-script-textarea" readonly>${scriptDisplay}</textarea>
          </div>

          <div class="witness-textarea-section">
            <label class="witness-textarea-label">Your Witness Data:</label>
            <textarea class="witness-data-textarea" id="witness-data-textarea" placeholder='Enter witness data, e.g.:\n{\n  "password": "your_password_here"\n}'></textarea>
          </div>
        </div>
      </div>

        <div class="create-nft-btn-row">
            <div class="create-nft-help-link" id="witness-help-link">need help?</div>    
            <div class="saito-button-row">
                 <button id="download_with_witness_btn">Download File</button>
            </div>
        </div>
`;

  return msg;

};

