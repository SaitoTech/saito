# Saito Game Engine (SaGE)

SAGE is an open source game engine designed to make it easy to build multiplayer boardgames. All games run in the browser and communicate using the Saito blockchain. SAGE handles network operations, deck and dice management, and provides a framework for handling game logic.


## Sample Applications ##

Below are three examples of games built using SAGE. We encourage developers to take a look at the actual code to get a feel for how to build games using the system.

**CHESS**
https://github.com/SaitoTech/saito/tree/master/mods/chess

**WORDBLOCKS**
https://github.com/SaitoTech/saito/tree/master/mods/wordblocks

**TWILIGHT STRUGGLE**
https://github.com/trevelyan/ts-blockchain



## Module Design ##

Implementing a game on SAGE requires implementing three key functions:

- initializeGame

  This creates the gameboard and loads the state of the game from the last saved version. Developers should check how the Wordblocks and Twilight Struggle modules perform these tasks. Remember that you can use the *scale* function to adjust the size of the images you are loading to keep them properly scaled depending on the width of your "gameboard" in your DOM. This requires your defining the gameboardWidth variable in your constructor to the unaltered width of the gameboard.

- webServer

  This is a standard function that needs to be told how to serve any web-assets. Just update your directories.

- handleGame

  This function handles the heart of game operations. To understand what it does it is necessary to know a bit about how SAGE works, and specifically that when a game is started a game object is created for all players that contains a stack:

    ```
    this.game.queue 
    ```

  The game object also contains a number of other variables, including the number of the player and a list of their opponents. The game object will be saved to the user wallet at periodic intervals, so you can attach your own variables to this object. We recommend adding a state object to this object in the initializeGame function that contains all of the information that is specific to your game:

    ```
    if (this.game.state == undefined) {
      this.game.state = this.returnState();
      this.saveGame(this.game.id);
    }

    ```

  The purpose of the handleGame() function is to interact with the game stack (this.game.queue). Commands which are specific to your game should be handled in ths handleGame() function while commands that you want the SAGE game engine to handle can be included and will be processed automatically by the lower-level software. The SAGE game library exposes a number of commands that can be used to simplify things like deck shuffling and cryptographic key exchanges for instance and you should probably use those instead of building your own. What follows is an example from the game Twilight Struggle, which shows how the game is initialized. SAGE convention is for all functions handled by the game engine to be invoked in CAPITAL LETTERS and for games to handle lowercase commands.

    ```
    this.game.queue.push("round");
    this.game.queue.push("placement\t2");
    this.game.queue.push("placement\t1");
    this.game.queue.push("EMAIL\tready");
    this.game.queue.push("DEAL\t2\t8");
    this.game.queue.push("DEAL\t1\t8");
    this.game.queue.push("DECKENCRYPT\t2");
    this.game.queue.push("DECKENCRYPT\t1");
    this.game.queue.push("DECKXOR\t2");
    this.game.queue.push("DECKXOR\t1");
    this.game.queue.push("DECK\t"+JSON.stringify(this.returnEarlyWarCards()));
    ```

  Your handleGame function should loop through this.game.queue and execute the instructions that it can in stepwise fashion. When it has done this, it should remove the element from the stack:

    ```
    this.game.queue.splice(idx, 1);
    ```

  When you want your game to continue to execute (i.e passing control back down to the lower-level SAFE engine so that core gameplay functions can be executed), you should:

    ```
    return 1;
    ```

  If you want the game to halt execution, you should:

    ```
    return 0;
    ```

  Once a game has halted execution, it will "wake up" if it receives a move broadcast by another player. Players make moves by adding moves to and then broadcasting them to their peers. The SAGE game engine provides an abstract way to handle this:

    ```
    this.addMove("purchase\t2\tpark place");
    this.addMove("build\t2\thouse\tpark place");
    this.endTurn();
    ```

  Because SAGE is built atop blockchain tech, developers can assume that all turns will happen in the same order on all machines. The SAGE game engine will also make sure that moves are not processed more than once.

  Writing a game essentually thus involves structuring the logic of your game so that gameplay proceeds until players need to provide input, and then halts while waiting for moves. For developers looking for a simple example, we recommend Wordblocks as a tutorial application. It shows the basics of board setup and management as well as how to handle reasonably simple gameplay (placing tiles on a board and keeping players in sync). Twilight Struggle uses the same basic structure to support much more complicated gameplay. The blockchain guarantees that all moves are executed in stepwise fashion even if a player is offline while other players are making moves.

  SAFE is a very early-stage project. We are working to continue to improve the code and hope that this project will be useful for both gamers and game publishers. In the next version we are planning to move random dice rolling and simultaneous card draws down into the SAGE game engine so that developers can rely on lower-level support instead of manually coding those functions at the higher level. We will also be expanding support for multiplayer (n > 2) games so that it is possible to play Wordblocks with 4 or 5 players. We hope to add features that game publishers can use to drive community adoption and make sales.

  If you have questions or feedback, please reach out to David Lancashire at david@saito.tech (legacy email) or david@saito for technical assistance. Happy hacking!

