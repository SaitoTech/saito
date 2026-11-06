const checkboxRow = ({ name, label, className = '' }) => {
  let classes = ['saito-checkbox', 'remove_card'];
  if (className) {
    classes = classes.concat(className.trim().split(/\s+/).filter(Boolean));
  }
  return `
    <div class="overlay-input">
      <label>
        <input class="${classes.join(' ')}" type="checkbox" name="${name}" />
        ${label}
      </label>
    </div>
  `;
};

const checklistSection = (title, cards) => {
  return `
    <div class="overlay-input">
      <div class="saito-overlay-form-text">
        <p>${title}</p>
      </div>
      <div class="advanced-options-checklist">
        ${cards.map(checkboxRow).join('')}
      </div>
    </div>
  `;
};

module.exports = () => {
  const remove_cards = [
    { name: 'asia', label: 'Asia Scoring' },
    { name: 'europe', label: 'Europe Scoring' },
    { name: 'mideast', label: 'Middle-East Scoring' },
    { name: 'duckandcover', label: 'Duck and Cover' },
    { name: 'fiveyearplan', label: 'Five Year Plan' },
    { name: 'socgov', label: 'Socialist Governments' },
    { name: 'fidel', label: 'Fidel' },
    { name: 'vietnamrevolts', label: 'Vietnam Revolts' },
    { name: 'blockade', label: 'Blockade' },
    { name: 'koreanwar', label: 'Korean War' },
    { name: 'romanianab', label: 'Romanian Abdication' },
    { name: 'arabisraeli', label: 'Arab Israeli War' },
    { name: 'comecon', label: 'Comecon' },
    { name: 'nasser', label: 'Nasser' },
    { name: 'warsawpact', label: 'Warsaw Pact' },
    { name: 'degaulle', label: 'De Gaulle Leads France' },
    { name: 'naziscientist', label: 'Nazi Scientists Captured' },
    { name: 'truman', label: 'Truman' },
    { name: 'olympic', label: 'Olympic Games' },
    { name: 'nato', label: 'NATO' },
    { name: 'indreds', label: 'Independent Reds' },
    { name: 'marshall', label: 'Marshall Plan' },
    { name: 'indopaki', label: 'Indo-Pakistani War' },
    { name: 'containment', label: 'Containment' },
    { name: 'cia', label: 'CIA Created' },
    { name: 'usjapan', label: 'US/Japan Defense Pact' },
    { name: 'suezcrisis', label: 'Suez Crisis' },
    { name: 'easteuropean', label: 'East European Unrest' },
    { name: 'decolonization', label: 'Decolonization' },
    { name: 'redscare', label: 'Red Scare' },
    { name: 'unintervention', label: 'UN Intervention' },
    { name: 'destalinization', label: 'Destalinization' },
    { name: 'nucleartestban', label: 'Nuclear Test Ban Treaty' },
    { name: 'formosan', label: 'Formosan Resolution' },
    { name: 'defectors', label: 'Defectors', className: 'optional_edition' },
    { name: 'specialrelation', label: 'Special Relationship', className: 'optional_edition' },
    { name: 'cambridge', label: 'The Cambridge Five', className: 'optional_edition' },
    { name: 'norad', label: 'NORAD', className: 'optional_edition' },
    { name: 'brushwar', label: 'Brush War' },
    { name: 'camerica', label: 'Central America Scoring' },
    { name: 'seasia', label: 'Southeast Asia Scoring' },
    { name: 'armsrace', label: 'Arms Race' },
    { name: 'cubanmissile', label: 'Cuban Missile Crisis' },
    { name: 'nuclearsubs', label: 'Nuclear Subs' },
    { name: 'quagmire', label: 'Quagmire' },
    { name: 'saltnegotiations', label: 'Salt Negotiations' },
    { name: 'beartrap', label: 'Bear Trap' },
    { name: 'summit', label: 'Summit' },
    { name: 'howilearned', label: 'How I Learned to Stop Worrying' },
    { name: 'junta', label: 'Junta' },
    { name: 'kitchendebates', label: 'Kitchen Debates' },
    { name: 'missileenvy', label: 'Missile Envy' },
    { name: 'wwby', label: 'We Will Bury You' },
    { name: 'brezhnev', label: 'Brezhnev Doctrine' },
    { name: 'portuguese', label: 'Portuguese Empire Crumbles' },
    { name: 'southafrican', label: 'South African Unrest' },
    { name: 'allende', label: 'Allende' },
    { name: 'willybrandt', label: 'Willy Brandt' },
    { name: 'muslimrevolution', label: 'Muslim Revolution' },
    { name: 'abmtreaty', label: 'ABM Treaty' },
    { name: 'culturalrev', label: 'Cultural Revolution' },
    { name: 'flowerpower', label: 'Flower Power' },
    { name: 'u2', label: 'U-2 Incident' },
    { name: 'opec', label: 'OPEC' },
    { name: 'lonegunman', label: 'Lone Gunman' },
    { name: 'colonial', label: 'Colonial' },
    { name: 'panamacanal', label: 'Panama Canal' },
    { name: 'campdavid', label: 'Camp David Accords' },
    { name: 'puppet', label: 'Puppet Governments' },
    { name: 'grainsales', label: 'Grain Sales to Soviets' },
    { name: 'johnpaul', label: 'John Paul' },
    { name: 'deathsquads', label: 'Death Squads' },
    { name: 'oas', label: 'OAS Founded' },
    { name: 'nixon', label: 'Nixon Plays the China Card' },
    { name: 'sadat', label: 'Sadat Expels Soviets' },
    { name: 'shuttle', label: 'Shuttle Diplomacy' },
    { name: 'voiceofamerica', label: 'Voice of America' },
    { name: 'liberation', label: 'Liberation Theology' },
    { name: 'ussuri', label: 'Ussuri River Skirmish' },
    { name: 'asknot', label: 'Ask Not What Your Country Can Do For You' },
    { name: 'alliance', label: 'Alliance for Progress' },
    { name: 'africa', label: 'Africa Scoring' },
    { name: 'onesmallstep', label: 'One Small Step' },
    { name: 'samerica', label: 'South America' },
    { name: 'che', label: 'Che', className: 'optional_edition' },
    { name: 'tehran', label: 'Our Man in Tehran', className: 'optional_edition' },
    { name: 'iranianhostage', label: 'Iranian Hostage Crisis' },
    { name: 'ironlady', label: 'The Iron Lady' },
    { name: 'reagan', label: 'Reagan Bombs Libya' },
    { name: 'starwars', label: 'Star Wars' },
    { name: 'northseaoil', label: 'North Sea Oil' },
    { name: 'reformer', label: 'The Reformer' },
    { name: 'marine', label: 'Marine Barracks Bombing' },
    { name: 'KAL007', label: 'Soviets Shoot Down KAL-007' },
    { name: 'glasnost', label: 'Glasnost' },
    { name: 'ortega', label: 'Ortega Elected in Nicaragua' },
    { name: 'terrorism', label: 'Terrorism' },
    { name: 'ironcontra', label: 'Iran Contra Scandal' },
    { name: 'chernobyl', label: 'Chernobyl' },
    { name: 'debtcrisis', label: 'Latin American Debt Crisis' },
    { name: 'teardown', label: 'Tear Down this Wall' },
    { name: 'evilempire', label: 'An Evil Empire' },
    { name: 'aldrichames', label: 'Aldrich Ames Remix' },
    { name: 'pershing', label: 'Pershing II Deployed' },
    { name: 'wargames', label: 'Wargames' },
    { name: 'solidarity', label: 'Solidarity' },
    { name: 'iraniraq', label: 'Iran-Iraq War', className: 'optional_edition' },
    { name: 'yuri', label: 'Yuri and Samantha', className: 'optional_edition' },
    { name: 'awacs', label: 'AWACS Sale to Saudis', className: 'optional_edition' }
  ];

  const add_cards = [
    { name: 'iranianultimatum', label: 'Iranian Ultimatum (Early-War)' },
    { name: 'tsarbomba', label: 'Tsar Bomba (Early-War)' },
    { name: 'unitedfruit', label: 'United Fruit Company (Early-War)' },
    { name: 'berlinagreement', label: 'Berlin Agreement (Mid-War)' },
    { name: 'carterdoctrine', label: 'Carter Doctrine (Mid-War)' },
    { name: 'energycrisis', label: 'Energy Crisis (Mid-War)' },
    { name: 'nixonshock', label: 'Nixon Shock (Mid-War)' },
    { name: 'kissinger', label: 'Kissinger Bombs Cambodia (Mid-War)' },
    { name: 'khruschevthaw', label: 'Khruschev Thaw (Mid-War)' },
    { name: 'bayofpigs', label: 'Bay of Pigs (Mid-War)' },
    { name: 'fallofsaigon', label: 'Fall of Saigon (Mid-War)' },
    { name: 'fischerspassky', label: 'Fischer-Spassky (Mid-War)' },
    { name: 'sudan', label: 'Sudanese Civil War (Mid-War)' },
    { name: 'revolutionsof1989', label: 'Revolutions of 1989 (Late-War)' },
    { name: 'samotlor', label: 'Samotlor Oil Fields (Late-War)' },
    { name: 'antiapartheid', label: 'Anti-Apartheid Movement (Late-War)' },
    { name: 'rustinredsquare', label: 'Rust Lands in Red Square (Late-War)' },
    { name: 'august1968', label: 'August Protests (Late-War)' },
    { name: 'argo', label: 'Argo (Late-War)' },
    { name: 'culturaldiplomacy', label: 'Cultural Diplomacy (Early-War)' },
    { name: 'gouzenkoaffair', label: 'Gouzenko Affair (Early-War)' },
    { name: 'poliovaccine', label: 'Polio Vaccine (Early-War)' },
    { name: 'peronism', label: 'Peronism (Early-War)', className: 'endofhistory_edition' },
    {
      name: 'manwhosavedtheworld',
      label: 'The Man Who Saved the World (Mid-War)',
      className: 'endofhistory_edition'
    },
    {
      name: 'breakthroughatlopnor',
      label: 'Breakthrough at Lop Nor (Mid-War)',
      className: 'endofhistory_edition'
    },
    { name: 'nationbuilding', label: 'Nation Building (Mid-War)', className: 'endofhistory_edition' },
    { name: 'greatsociety', label: 'Great Society (Mid-War)', className: 'endofhistory_edition' },
    { name: 'perestroika', label: 'Perestroika (Late-War)', className: 'endofhistory_edition' },
    { name: 'eurocommunism', label: 'Eurocommunism (Mid-War)', className: 'endofhistory_edition' },
    { name: 'inftreaty', label: 'INF Treaty (Late-War)', className: 'endofhistory_edition' },
    {
      name: 'communistrevolution',
      label: 'Communist Revolution (Early-War)',
      className: 'coldwarcrazies_edition'
    }
  ];

  return `
    <div class="overlay-input">
      <label for="player1">Play As:</label>
      <select class="saito-form-select" id="player1" name="player1">
        <option value="random" selected>random sides</option>
        <option value="ussr">play as USSR</option>
        <option value="us">play as US</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="usbonus">US bonus influence:</label>
      <select class="saito-form-select usbonus" id="usbonus" name="usbonus">
        <option value="0">0</option>
        <option value="1">1</option>
        <option value="2" selected>2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
        <option value="6">6</option>
        <option value="7">7</option>
        <option value="8">8</option>
        <option value="9">9</option>
        <option value="10">10</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="clock">Player Time Limit:</label>
      <select class="saito-form-select" id="clock" name="clock">
        <option value="0" default>no limit</option>
        <option value="10">10 minutes</option>
        <option value="20">20 minutes</option>
        <option value="30">30 minutes</option>
        <option value="60">60 minutes</option>
        <option value="90">90 minutes</option>
        <option value="120">120 minutes</option>
      </select>
    </div>
    ${checklistSection('Remove cards', remove_cards)}
    ${checklistSection('Add cards', add_cards)}
  `;
};
