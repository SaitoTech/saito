const Template = require('./technologies.template');

class FactionSheetTechnologies {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render(player) {
    let el = document.querySelector('.faction-sheet-body');
    if (!el) {
      return;
    }
    el.innerHTML = Template(this.mod, player);
    this.bind(el, player);
  }

  bind(el, player) {
    let mod = this.mod;
    let root = el.querySelector('.fs-techmap');
    let board = el.querySelector('.fs-techmap-board');
    let detail = el.querySelector('.fs-tech-detail');
    let body = el.querySelector('.fs-tech-detail-body');
    if (!root || !board || !detail || !body) {
      return;
    }

    let pinned = null;
    let pinfo = mod.game.state.players_info[player - 1];
    let owned = pinfo.tech || [];
    let counts = Template.colorCounts(mod, pinfo);
    let faction = pinfo.faction;

    let stateOf = (key, tech) => {
      if (owned.indexOf(key) != -1) {
        return 'researched';
      }
      if (Template.missingPrereqs(tech, counts, pinfo).length == 0) {
        return 'available';
      }
      return 'future';
    };

    let prereqHtml = (tech) => {
      let prereqs = tech.prereqs || [];
      if (!prereqs.length) {
        return '<div class="fs-tech-detail-line">None</div>';
      }
      let seen = { blue: 0, green: 0, red: 0, yellow: 0 };
      return prereqs
        .map((color) => {
          seen[color] = (seen[color] || 0) + 1;
          let met = (counts[color] || 0) >= seen[color] ? ' is-met' : '';
          return `<span class="fs-prereq ${color}${met}">${color}</span>`;
        })
        .join('');
    };

    let unlocksHtml = (key, tech) => {
      let names = [];
      if (tech.color && tech.unit != 1) {
        for (let other in mod.tech) {
          let candidate = mod.tech[other];
          if (!candidate || other == key || candidate.unit == 1 || candidate.color != tech.color) {
            continue;
          }
          if (candidate.type == 'ability') {
            continue;
          }
          if (candidate.type == 'special' && candidate.faction != faction) {
            continue;
          }
          if ((candidate.prereqs || []).length <= (tech.prereqs || []).length) {
            continue;
          }
          if (owned.indexOf(other) != -1) {
            continue;
          }
          names.push(candidate.name);
        }
      }
      for (let other in mod.tech) {
        let candidate = mod.tech[other];
        if (!candidate || candidate.unit != 1 || owned.indexOf(other) != -1) {
          continue;
        }
        if (candidate.faction && candidate.faction != 'all' && candidate.faction != faction) {
          continue;
        }
        if (tech.color && (candidate.prereqs || []).indexOf(tech.color) != -1) {
          names.push(candidate.name);
        }
      }
      names = names.filter((name, index) => {
        return names.indexOf(name) == index;
      });
      if (!names.length) {
        return '';
      }
      return `<div class="fs-tech-detail-label">Counts toward</div><div class="fs-tech-detail-line">${names
        .map((name) => {
          return `<div>${name}</div>`;
        })
        .join('')}</div>`;
    };

    let fill = (key, kind) => {
      let tech = mod.tech[key];
      if (!tech) {
        return;
      }
      let state = stateOf(key, tech);
      let state_label = {
        researched: 'Researched',
        available: 'Available',
        future: 'Further along this path'
      }[state];
      if (kind == 'unit' && state != 'researched') {
        state_label = state == 'available' ? 'Next upgrade · requirements met' : 'Next upgrade · requirements not met';
      }
      let type_label = tech.unit == 1 ? 'Unit upgrade' : (tech.color || 'Technology') + ' technology';
      if (tech.type == 'special') {
        type_label = tech.unit == 1 ? 'Faction unit upgrade' : 'Faction technology';
      }
      body.innerHTML = `
        <div class="fs-tech-detail-name">${tech.name}</div>
        <div class="fs-tech-detail-type">${type_label}</div>
        <div class="fs-tech-detail-state is-${state}">${state_label}</div>
        <div class="fs-tech-detail-text">${tech.text || ''}</div>
        <div class="fs-tech-detail-label">Prerequisites</div>
        <div class="fs-tech-detail-prereqs">${prereqHtml(tech)}</div>
        ${unlocksHtml(key, tech)}
      `;
    };

    let relate = (key) => {
      root.querySelectorAll('.is-related').forEach((node) => {
        node.classList.remove('is-related');
      });
      let tech = mod.tech[key];
      if (!tech) {
        return;
      }
      let colors = tech.prereqs || [];
      if (tech.color) {
        colors = colors.concat([tech.color]);
      }
      root.querySelectorAll('.fs-tech-node').forEach((node) => {
        if (colors.indexOf(node.getAttribute('data-color')) != -1) {
          node.classList.add('is-related');
        }
      });
    };

    let clearSelection = () => {
      root.querySelectorAll('.is-selected').forEach((node) => {
        node.classList.remove('is-selected');
      });
      root.querySelectorAll('.is-related').forEach((node) => {
        node.classList.remove('is-related');
      });
    };

    let phase = 'closed';
    let side = null;
    let pending_node = null;
    let close_timer = null;

    let sideFor = (node) => {
      let rect = root.getBoundingClientRect();
      let box = node.getBoundingClientRect();
      let from_right = box.left + box.width / 2 < rect.left + rect.width / 2;
      return from_right ? 'from-right' : 'from-left';
    };

    let mark = (node) => {
      clearSelection();
      if (!node) {
        return;
      }
      node.classList.add('is-selected');
      relate(node.getAttribute('data-key'));
    };

    let finishClose = () => {
      if (phase != 'closing') {
        return;
      }
      detail.removeEventListener('transitionend', onTransitionEnd);
      clearTimeout(close_timer);
      let next = pending_node;
      pending_node = null;
      phase = 'closed';
      side = null;
      if (next) {
        reveal(next);
        return;
      }
      detail.setAttribute('aria-hidden', 'true');
      pinned = null;
      mark(null);
    };

    let onTransitionEnd = (event) => {
      if (event.target != detail || event.propertyName != 'transform') {
        return;
      }
      finishClose();
    };

    let beginClose = (next) => {
      pending_node = next || null;
      if (phase == 'closing') {
        return;
      }
      phase = 'closing';
      detail.classList.remove('is-open');
      detail.addEventListener('transitionend', onTransitionEnd);
      clearTimeout(close_timer);
      close_timer = setTimeout(finishClose, 280);
    };

    let reveal = (node) => {
      let next_side = sideFor(node);
      detail.style.transition = 'none';
      detail.classList.remove('is-open', 'from-left', 'from-right');
      detail.classList.add(next_side);
      void detail.offsetWidth;
      fill(node.getAttribute('data-key'), node.getAttribute('data-kind'));
      detail.style.transition = '';
      void detail.offsetWidth;
      detail.classList.add('is-open');
      detail.setAttribute('aria-hidden', 'false');
      phase = 'open';
      side = next_side;
      pinned = node;
      mark(node);
    };

    let open = (node) => {
      let next_side = sideFor(node);
      pinned = node;
      mark(node);
      if (phase == 'open' && side == next_side) {
        fill(node.getAttribute('data-key'), node.getAttribute('data-kind'));
        return;
      }
      if (phase == 'closed') {
        reveal(node);
        return;
      }
      beginClose(node);
    };

    let close = () => {
      if (phase == 'closing') {
        pending_node = null;
        pinned = null;
        mark(null);
        return;
      }
      if (phase == 'closed') {
        pinned = null;
        mark(null);
        return;
      }
      beginClose(null);
    };

    root.querySelectorAll('.fs-tech-node, .fs-upgrade').forEach((node) => {
      node.addEventListener('mouseenter', () => {
        node.classList.add('is-hot');
      });
      node.addEventListener('mouseleave', () => {
        node.classList.remove('is-hot');
      });
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        if (pinned == node && phase == 'open') {
          close();
          return;
        }
        if (pinned == node && phase == 'closing') {
          pending_node = null;
          pinned = null;
          mark(null);
          return;
        }
        open(node);
      });
    });

    detail.querySelector('.fs-tech-detail-close').addEventListener('click', (event) => {
      event.stopPropagation();
      close();
    });

    board.addEventListener('click', () => {
      if (pinned) {
        close();
      }
    });
  }
}

module.exports = FactionSheetTechnologies;
