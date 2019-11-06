var saito = require('../../lib/saito/saito');
var Game = require('../../lib/templates/game');
var util = require('util');

function Connect4(app,selector){
    if(!(this instanceof Connect4)){return new Connect4(app);}

    Connect4.super_.call(this);
    this.app=app;

    this.name= "Connect4";
    this.browser_active=0;
    this.handlesEmail=1;
    this.emailAppName="Connect Four";
    this.maxplayers=2;

        this.ROWS=6;
        this.COLS=7;
        this.player1='red';
        this.player2='black';
        this.selector = selector;
        this.createGrid;
        this.setupEventListeners;
        this.onPlayerMove = function(){};
        this.$board=null;

    this_connect4 = this;

    return this;

}
module.exports = Connect4;
util.inherits(Connect4, Game);


Connect4.prototype.initializeGame = async function initializeGame(game_id)
{
  if(this.browser_active == 1){
  if(!this.app.browser.isMobileBrowser(navigator.userAgent))
  {
    const chat = this.app.modules.returnModule("Chat");
    chat.addPopUpChat();
  
  }
}
  this.updateStatus("loading game...");
  this.loadGame(game_id);
  
  if(this.game.status !=""){
    this.updateStatus(this.game.status)
  }
  if (this.game.initializing == 1) {

    this.game.initializing = 0;
    this.saveGame(this.game.id);
  }

}

Connect4.prototype.createGrid = function createGrid(){
  if(this.app.BROWSER){
const $board = $(this.selector);
  }
this.isGameOver = false;
this.player1='red';
this.player2='black';
for (let row = 0; row < this.ROWS; row++) {
    const $row = $('<div>')
      .addClass('row');
    for (let col = 0; col < this.COLS; col++) {
      const $col = $('<div>')
        .addClass('col empty')
        .attr('data-col', col)
        .attr('data-row', row);
      $row.append($col);
    }
    $board.append($row);
  }
}

////////////////
// handleGame //
////////////////
Connect4.prototype.handleGame = function handleGame(msg) {

  let player = "red"; if (this.game.player == 2) { player = "black"; }
  if (msg.extra == undefined) {
    console.log("NO MESSAGE DEFINED!");
    return;
  }
  if (msg.extra.data == undefined) {
    console.log("NO MESSAGE RECEIVED!");
    return;
  }

  let data = JSON.parse(msg.extra.data);
  this.game.target = msg.extra.target;
  

  if (msg.extra.target == this.game.player) {
    if (this.browser_active == 1) {
      this.createGrid();
      this.updateLog(data.move, 999);
      this.updateStatusMessage();
      this.setupEventListeners();
    }
  } 
  this.saveGame(this.game.id);

  return 0;

}

Connect4.prototype.setupEventListeners = function setupEventListeners(){
  const $board = $(this.selector);
  const that = this;

  function findLastEmptyCell(col) {
    const cells = $(`.col[data-col='${col}']`);
    for (let i = cells.length - 1; i >= 0; i--) {
      const $cell = $(cells[i]);
      if ($cell.hasClass('empty')) {
        return $cell;
      }
    }
    return null;
  }

  $board.on('mouseenter', '.col.empty', function() {
    if (that.isGameOver) return;
    const col = $(this).data('col');
    const $lastEmptyCell = findLastEmptyCell(col);
    $lastEmptyCell.addClass(`next-${that.player}`);
  });

  $board.on('mouseleave', '.col', function() {
    $('.col').removeClass(`next-${that.player}`);
  });

  $board.on('click', '.col.empty', function() {
    if (that.isGameOver) return;
    const col = $(this).data('col');
    const $lastEmptyCell = findLastEmptyCell(col); 
    $lastEmptyCell.removeClass(`empty next-${that.player}`);
    $lastEmptyCell.addClass(that.player);
    $lastEmptyCell.data('player', that.player);

    const winner = that.checkForWinner(
      $lastEmptyCell.data('row'), 
      $lastEmptyCell.data('col')
    )
    if (winner) {
      that.isGameOver = true;
      alert(`Game Over! Player ${that.player} has won!`);
      $('.col.empty').removeClass('empty');
      return;
    }

    that.player = (that.player === 'red') ? 'black' : 'red';
    that.onPlayerMove();
    $(this).trigger('mouseenter');
  });
}


Connect4.prototype.checkForWinner  = function checkForWinner(row, col) {
const that = this;

function $getCell(i, j) {
  return $(`.col[data-row='${i}'][data-col='${j}']`);
}

Connect4.prototype.checkDirection = function checkDirection(direction) {
  let total = 0;
  let i = row + direction.i;
  let j = col + direction.j;
  let $next = $getCell(i, j);
  while (i >= 0 &&
    i < that.ROWS &&
    j >= 0 &&
    j < that.COLS && 
    $next.data('player') === that.player
  ) {
    total++;
    i += direction.i;
    j += direction.j;
    $next = $getCell(i, j);
  }
  return total;
}

Connect4.prototype.checkWin = function checkWin(directionA, directionB) {
  const total = 1 +
    checkDirection(directionA) +
    checkDirection(directionB);
  if (total >= 4) {
    return that.player;
  } else {
    return null;
  }
}

Connect4.prototype.checkDiagonalBLtoTR = function checkDiagonalBLtoTR() {
  return checkWin({i: 1, j: -1}, {i: 1, j: 1});
}

Connect4.prototype.checkDiagonalTLtoBR = function checkDiagonalTLtoBR() {
  return checkWin({i: 1, j: 1}, {i: -1, j: -1});
}

Connect4.prototype.checkVerticals  = function checkVerticals() {
  return checkWin({i: -1, j: 0}, {i: 1, j: 0});
}

Connect4.prototype.checkHorizontals = function checkHorizontals() {
  return checkWin({i: 0, j: -1}, {i: 0, j: 1});
}

return checkVerticals() || 
  checkHorizontals() || 
  checkDiagonalBLtoTR() ||
  checkDiagonalTLtoBR();
}

Connect4.prototype.updateStatusMessage = function updateStatusMessage(str = "") {

  if (this.browser_active != 1) { return; }

  if (str != "") {
    var statusEl = $('#status');
    statusEl.html(str);
    return;
  }

  var status = '';

  var moveColor = 'red';
  if (this.engine.turn() === 'b') {
    moveColor = 'black';
  }

  if (this.engine.checkForWinner() === true) {
    status = 'Game over, ' + moveColor + 'wins';
  }

  var statusEl = $('#status');
  statusEl.html(status);
};

///////////////
// webServer //
///////////////

Connect4.prototype.webServer = function webServer(app, expressapp) {

    expressapp.get('/connect4/', (req, res) => {
      res.sendFile(__dirname + '/web/index.html');
      return;
    });
    expressapp.get('/connect4/style.css', (req, res) => {
      res.sendFile(__dirname + '/web/style.css');
      return;
    });
    expressapp.get('/connect4/main', (req, res) => {
      res.sendFile(__dirname + '/web/main.js');
      return;
    });
}  
