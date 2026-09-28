/* Original, editable schematic artwork. Coordinates use a 1200 × 700 canvas.
 * Neighbouring mainland territories share exact border vertices: the renderer's
 * paper-coloured 2-unit stroke supplies a uniform narrow country boundary.
 * Wider open channels separate continents and geographic islands.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ConquestMap = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const continents = {
    north_america: { name: 'North America', bonus: 5, color: '#b78a39', label: [218,48] },
    south_america: { name: 'South America', bonus: 2, color: '#bd624c', label: [320,686] },
    europe: { name: 'Europe', bonus: 5, color: '#498f97', label: [555,87] },
    africa: { name: 'Africa', bonus: 3, color: '#b28b39', label: [621,673] },
    asia: { name: 'Asia', bonus: 7, color: '#7d8b4d', label: [906,40] },
    australia: { name: 'Australia', bonus: 2, color: '#a2698b', label: [1035,695] }
  };
  // id, name, continent, counter x/y, hand-drawn polygon points.
  const data = [
    ['alaska','Alaska','north_america',100,136,'38,105 90,80 150,88 171,136 141,170 76,171 42,153'],
    ['northwest_territory','Northwest Territory','north_america',225,122,'150,88 233,71 306,83 312,145 249,170 171,136'],
    ['greenland','Greenland','north_america',405,104,'358,54 422,38 459,65 447,125 402,159 356,132'],
    ['alberta','Alberta','north_america',188,206,'141,170 171,136 249,170 242,243 159,253 137,216'],
    ['ontario','Ontario','north_america',285,210,'249,170 312,145 340,181 330,253 252,268 242,243'],
    ['quebec','Quebec','north_america',367,211,'340,181 389,163 429,196 415,243 330,253'],
    ['western_united_states','Western United States','north_america',202,292,'159,253 242,243 252,268 268,311 233,346 187,329 150,288'],
    ['eastern_united_states','Eastern United States','north_america',316,289,'252,268 330,253 415,243 376,295 321,333 278,351 268,311'],
    ['central_america','Central America','north_america',252,368,'187,329 233,346 268,311 278,351 300,379 325,392 313,405 281,388 256,375 219,367'],
    ['venezuela','Venezuela','south_america',347,432,'317,422 342,410 399,422 421,451 375,467 326,451'],
    ['peru','Peru','south_america',337,504,'326,451 375,467 384,518 421,550 383,576 346,542 322,503'],
    ['brazil','Brazil','south_america',432,496,'399,422 474,448 499,481 474,530 421,550 384,518 375,467 421,451'],
    ['argentina','Argentina','south_america',390,602,'383,576 421,550 443,561 431,601 415,652 394,668 374,632'],
    ['iceland','Iceland','europe',516,137,'484,129 508,113 547,119 551,143 517,157 486,148'],
    ['scandinavia','Scandinavia','europe',622,129,'592,108 629,76 664,91 660,143 640,190 606,184 601,165'],
    ['great_britain','Great Britain','europe',529,226,'509,175 533,169 551,210 545,248 516,269 498,244 515,217'],
    ['northern_europe','Northern Europe','europe',609,230,'566,200 606,184 640,190 656,235 631,261 591,267 570,256'],
    ['ukraine','Ukraine','europe',718,212,'670,146 711,126 761,145 779,194 771,259 735,290 684,267 656,235 640,190 660,143'],
    ['western_europe','Western Europe','europe',547,306,'521,276 559,257 570,256 591,267 582,307 555,339 513,341 500,318'],
    ['southern_europe','Southern Europe','europe',624,301,'591,267 631,261 656,235 684,267 690,307 666,324 640,308 632,342 604,318 582,307'],
    ['north_africa','North Africa','africa',553,422,'506,371 552,349 599,356 627,409 610,462 562,486 513,459 489,415'],
    ['egypt','Egypt','africa',646,380,'599,356 660,352 691,378 684,412 627,409'],
    ['east_africa','East Africa','africa',699,466,'627,409 684,412 717,431 749,447 736,466 719,482 715,526 679,550 650,506 610,462'],
    ['congo','Congo','africa',610,505,'562,486 610,462 650,506 679,550 628,569 597,552'],
    ['south_africa','South Africa','africa',658,601,'597,552 628,569 679,550 715,526 700,590 674,629 638,645 617,607'],
    ['madagascar','Madagascar','africa',762,585,'762,546 783,538 790,564 775,610 751,629 744,601'],
    ['ural','Ural','asia',814,183,'785,120 821,104 854,114 862,153 860,211 839,245 789,247 793,195'],
    ['siberia','Siberia','asia',889,131,'854,114 858,96 894,71 932,81 946,125 936,155 922,219 932,232 925,250 860,211 862,153'],
    ['yakutsk','Yakutsk','asia',997,110,'932,81 1002,61 1056,90 1057,150 998,161 946,125'],
    ['kamchatka','Kamchatka','asia',1112,147,'1056,90 1121,102 1160,132 1149,167 1175,190 1148,202 1112,171 1114,211 1092,260 1064,220 1057,150'],
    ['irkutsk','Irkutsk','asia',986,201,'946,125 998,161 1057,150 1064,220 1025,240 932,232 922,219 936,155'],
    ['mongolia','Mongolia','asia',993,279,'932,232 1025,240 1064,220 1092,260 1064,305 997,319 932,303 925,250'],
    ['japan','Japan','asia',1136,295,'1138,237 1157,246 1151,278 1170,297 1159,333 1124,353 1114,336 1140,303 1124,278'],
    ['afghanistan','Afghanistan','asia',804,285,'789,247 839,245 873,267 871,331 827,334 781,317 749,300'],
    ['china','China','asia',943,347,'860,211 925,250 932,303 997,319 1064,305 1082,347 1038,382 992,394 962,425 915,401 871,331 873,267 839,245'],
    ['middle_east','Middle East','asia',749,377,'707,309 749,300 781,317 827,334 825,375 810,397 816,422 780,444 730,416 701,373 686,341'],
    ['india','India','asia',874,410,'827,334 871,331 915,401 908,439 878,487 854,451 838,416 810,397 825,375'],
    ['siam','Siam','asia',977,448,'915,401 962,425 992,394 1013,423 1000,456 1020,478 1006,500 982,471 968,451 946,473 908,439'],
    ['indonesia','Indonesia','australia',983,539,'912,503 936,498 960,527 1000,520 1043,539 1040,559 995,553 974,570 949,547 935,528'],
    ['new_guinea','New Guinea','australia',1100,513,'1062,481 1102,475 1128,496 1164,500 1176,522 1136,536 1101,519 1070,527'],
    ['western_australia','Western Australia','australia',1034,626,'1046,568 1086,572 1089,622 1066,667 1007,671 976,646 984,606 1019,596'],
    ['eastern_australia','Eastern Australia','australia',1132,611,'1086,572 1121,549 1146,576 1170,611 1171,644 1137,672 1066,667 1089,622']
  ];
  const territories = {};
  data.forEach(([id,name,continent,x,y,points], i) => {
    const vertices = points.split(' ').map(point => point.split(',').map(Number));
    const xs = vertices.map(point => point[0]), ys = vertices.map(point => point[1]);
    const left = Math.min(...xs), top = Math.min(...ys);
    const bounds = { x:left, y:top, width:Math.max(...xs)-left, height:Math.max(...ys)-top };
    territories[id] = { id,name,continent,x,y,center:[x,y],points,path:'M'+points.replace(/ /g,' L')+' Z',bounds,neighbors:[],symbol:['infantry','cavalry','artillery'][i%3] };
  });
  const links = {
    alaska:'northwest_territory alberta kamchatka',
    northwest_territory:'alberta ontario greenland',
    greenland:'ontario quebec iceland',
    alberta:'ontario western_united_states',
    ontario:'quebec western_united_states eastern_united_states',
    quebec:'eastern_united_states',
    western_united_states:'eastern_united_states central_america',
    eastern_united_states:'central_america',
    central_america:'venezuela',
    venezuela:'peru brazil', peru:'brazil argentina', brazil:'argentina north_africa',
    iceland:'great_britain scandinavia',
    scandinavia:'great_britain northern_europe ukraine',
    great_britain:'northern_europe western_europe',
    northern_europe:'ukraine western_europe southern_europe',
    ukraine:'southern_europe middle_east afghanistan ural',
    western_europe:'southern_europe north_africa',
    southern_europe:'north_africa egypt middle_east',
    north_africa:'egypt east_africa congo', egypt:'east_africa middle_east',
    east_africa:'middle_east congo south_africa madagascar', congo:'south_africa', south_africa:'madagascar',
    ural:'siberia china afghanistan', siberia:'yakutsk irkutsk mongolia china',
    yakutsk:'irkutsk kamchatka', kamchatka:'irkutsk mongolia japan',
    irkutsk:'mongolia', mongolia:'japan china', afghanistan:'china india middle_east',
    china:'india siam', middle_east:'india', india:'siam', siam:'indonesia',
    indonesia:'new_guinea western_australia', new_guinea:'western_australia eastern_australia', western_australia:'eastern_australia'
  };
  Object.entries(links).forEach(([a, list]) => list.split(' ').forEach(b => {
    territories[a].neighbors.push(b); territories[b].neighbors.push(a);
  }));
  Object.entries(continents).forEach(([id,c]) => {
    c.id = id; c.territories = data.filter(t=>t[2]===id).map(t=>t[0]);
    // Remove shared edges to trace the continent's outer coast, including islands.
    // Keeping this derived from the artwork makes future map reskins straightforward.
    const edges = new Map();
    c.territories.forEach(territory => {
      const vertices = territories[territory].points.split(' ');
      vertices.forEach((a, index) => {
        const b = vertices[(index+1)%vertices.length], key = [a,b].sort().join('|');
        if (edges.has(key)) edges.delete(key); else edges.set(key,[a,b]);
      });
    });
    const coasts = [];
    while (edges.size) {
      const [firstKey, first] = edges.entries().next().value;
      edges.delete(firstKey);
      const coast = [first[0],first[1]];
      while (coast[coast.length-1] !== coast[0]) {
        const end = coast[coast.length-1];
        const next = Array.from(edges).find(([,edge]) => edge[0] === end || edge[1] === end);
        if (!next) break;
        edges.delete(next[0]);
        coast.push(next[1][0] === end ? next[1][1] : next[1][0]);
      }
      coasts.push('M'+coast.join(' L')+' Z');
    }
    c.outline = coasts.join(' ');
  });
  const seaLinks = [ ['alaska','kamchatka'], ['greenland','iceland'], ['iceland','great_britain'], ['iceland','scandinavia'], ['great_britain','scandinavia'], ['great_britain','northern_europe'], ['great_britain','western_europe'], ['brazil','north_africa'], ['western_europe','north_africa'], ['southern_europe','north_africa'], ['southern_europe','egypt'], ['east_africa','madagascar'], ['south_africa','madagascar'], ['kamchatka','japan'], ['mongolia','japan'], ['siam','indonesia'], ['indonesia','new_guinea'], ['indonesia','western_australia'], ['new_guinea','western_australia'], ['new_guinea','eastern_australia'] ];
  return { territories, continents, seaLinks, width:1200, height:700 };
});
