const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Run nuke
execSync('npm run nuke', { stdio: 'inherit' });

// 2. Modify config/options
const optionsPath = path.resolve(__dirname, '../config/options');

let options = JSON.parse(fs.readFileSync(optionsPath, 'utf-8'));

// Ensure admin array exists
options.admin = options.admin || [];

// Enable block production
options.consensus = options.consensus || {};
options.consensus.disable_block_production = false;
options.consensus.default_social_stake = 0;
options.consensus.default_social_stake_period = 0;
options.homeModule = 'Arcade';

fs.writeFileSync(optionsPath, JSON.stringify(options, null, 2));

// 1. Run nuke
execSync('npm run setuplocal', { stdio: 'inherit' });
