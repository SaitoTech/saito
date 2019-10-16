# Create Your First Module

So now that you have Saito installed and you can connect to the network, it's time to start building on top of it. We'll show you the basics of getting an app up on Saito. As an example, we'll create a basic decentralized TODO app.

## Module App Structure

Before we can start coding, we need to get our module structure in order. Modules are located in the `lib/mods` directory in our Saito codebase.

```
└── mods
    └── todo
        └── web
            ├── index.html
            ├── style.css
        ├── todo.js
└── lib
    └── saito
        ├── modules.js
    └── templates
        ├── game.js
        ├── template.js

```

Notice that we have the files `game.js`, `mods.js`, and `template.js`. Both `game.js` and `template.js` act as templates that we can implement in our own modules. `mods.js` is the way that our node is able to interface the functionality of the Saito network with the modules that exist in our `modules` directory. 

We've created a new directory in our `mods` directory called `todo` with a `web` directory that has our `index.html` and `style.css` file that we'll serve using `todo.js`. Next, let's add some structure to our `todo.js` file.


## Coding our Module

### Create the Constructor
First thing to do is to make the constructor for our TODO module

```javascript
const util = require('util');
const ModTemplate = require('../../lib/templates/template');

function Todo(app) {

  if (!(this instanceof Todo)) { return new Todo(app); }

  Todo.super_.call(this);

  this.app             = app;

  this.name            = "Todo";
  this.browser_active  = 0;
  this.handlesEmail    = 1;
  this.emailAppName    = "Todo";

  return this;
}

module.exports = Todo;
util.inherits(Todo, ModTemplate);
```

Our module is inhereting our `template` so that it has all of the necessary functions. We will be overwriting the ones we want to use in order to add the business logic of our module.

The constructor is a place to setup any local app state that will be necessary for our application. Let's add a field to save our TODOS to the state of our module.

```javascript
// todo.js

const util = require('util');
const ModTemplate = require('../../lib/templates/template');

function Todo(app) {

  if (!(this instanceof Todo)) { return new Todo(app); }

  Todo.super_.call(this);

  this.app             = app;

  this.tasks           = {};

  this.name            = "Todo";
  this.browser_active  = 0;
  this.handlesEmail    = 1;
  this.emailAppName    = "Todo";

  return this;
}

module.exports = Todo;
util.inherits(Todo, ModTemplate);
```

### Listening with onConfirmation

We want to think about how our module will work and transact with the Saito chain. Let's say that it will cost someone their default fee to both create a task and to toggle its status of completion. So, we'll want to create that logic first in our `onConfirmation` function first.

```javascript
// todo.js

Todo.prototype.onConfirmation = function onConfirmation(blk, tx, conf, app) {
  if (tx.transaction.msg.module != "Todo") { return; }
  if (conf == 0) {
    todo = app.modules.returnModule("Todo");
    switch (tx.transaction.msg.type) {
      case "task":
        this.addTask(tx);
      case "checkbox":
        this.toggleCheckbox(tx);
      default:
        break;
    }
  }
}
```

We'll hold off on fleshing out the render logic to these functions until we've built out our HTML and CSS.


Next thing that we'll want to do is allow the user to create transactions for both tasks and checkboxes, and then propagate them into the network. We can write out our logic for that in a custom function called `createTodoTx`. This allows us to generically create TX for both our tasks and our checkboxes.

```javascript
// todo.js

Todo.prototype.createTodoTX = function createTodoTx(data) {
  var newtx = this.app.wallet.createUnsignedTransactionWithDefaultFee(this.app.wallet.returnPublicKey());

  newtx.transaction.msg = Object.assign({}, data, { module: "Todo" });

  var newtx = this.app.wallet.signTransaction(newtx);

  this.app.network.propagateTransactionWithCallback(newtx, () => {
    if (this.app.BROWSER) {
      alert("your message was propagated")
    }
  });

  return newtx;
}
```

### HTML & CSS

Now that we have some of our chain logic coded, we can start to connect this to the view logic of our module.

```html
<!-- index.html -->

<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Saito Todo Module">
    <meta name="author" content="Stephen Peterkins">

    <script type="text/javascript" src="/lib/jquery/jquery-3.2.1.min.js"></script>
    <script type="text/javascript" src="/lib/jquery/jquery-ui.min.js"></script>
    <link rel="stylesheet" href="/lib/jquery/jquery-ui.min.css" type="text/css" media="screen" />

    <link rel="stylesheet" type="text/css" href="/todo/style.css" />
    <link rel="icon" media="all" type="image/x-icon" href="/favicon.ico?v=2"/>

    <title>Saito R</title>
  </head>
  <body>
    <div id="Registry_browser_active"></div>
      <div class="container">
        <div class="header">
          <a href="/">
            <img src="/img/saito_logo_black.png" class="logo" />
          </a>
          <a href="/" style="text-decoration:none;color:inherits">
            <div class="module_label">saito todo</div>
          </a>
        </div>
        <div class="module_container">
          <div class="headerSpace">
            <h1>Tasks TODO</h1>
          </div>
          <div class="addTaskSpace">
            <button id="add_task_button">Add Task</button>
            <input type="text" class="submit_task" id="submit_task" name="submit_task" />
          </div>
          <div class="todoListSpace">
            <div class="todoList"></div>
          </div>
        </div>
      </div>
    <script src="/socket.io/socket.io.js"></script>
    <script type="text/javascript" src="/browser.js"></script>
  </body>
</html>
```

```css
/* style.css */

body {
    font-family: arial, helvetica, sans-serif;
    font-size: 13px;
    padding:0px;
    margin:0px;
}

h1 {
    margin: 0em;
}

.container {
    display: grid;
    grid-template-rows: 3.1rem auto;
    grid-template-areas:
    "header"
    "content"
}

.header {
    grid-area: header;
    border-bottom: 1px solid #a5a5a5;
    font-size:2em;
}

.logo {
    width: 35px;
    margin-top: 10px;
    margin-left: 1.3em;
    margin-right: 0.35em;
    float: left;
}

.module_container {
    grid-area: content;
    display: grid;
    grid-template-rows: 3.2rem;
    grid-template-columns: 1fr;
    padding: 3em;
    grid-template-areas:
    "headerSpace headerSpace addTaskSpace"
    "todoListSpace todoListSpace todoListSpace"
    "todoListSpace todoListSpace todoListSpace"
}

.task_container {
    display: flex;
    align-items: center;
}

.task_checkbox {
    margin-right: 2em;
}

.task {
    font-size: 1.25em;
}

.module_label {
    font-family:Georgia;
    padding-top:5px;
    font-size:1.2em;
    color:#444;
}

.headerSpace {
    grid-area: headerSpace
}

.addTaskSpace {
    grid-area: addTaskSpace
}

.todoListSpace {
    grid-area: todoListSpace
}
```

Just because these files exist, we need a way for our server to send them to our browser. We'll extend our web server with the `webServer` function.

```javascript
// todo.js

// ...

Todo.prototype.webServer = function webServer(app, expressapp) {
  expressapp.get('/todo/', (req, res) => {
    res.sendFile(__dirname + '/web/index.html');
    return;
  });
  expressapp.get('/todo/style.css', (req, res) => {
    res.sendFile(__dirname + '/web/style.css');
    return;
  });
}
```

Our serve won't bundle our module into our `browser.js` file with the rest of the modules unless it's added to the `mods.js` file in the root of our modules directory

```javascript
// mods.js

// ...

this.mods.push(require('../../mods/reddit/reddit')(this.app));
this.mods.push(require('../../mods/remix/remix')(this.app));
this.mods.push(require('../../mods/money/money')(this.app));
this.mods.push(require('../../mods/debug/debug')(this.app));

this.mods.push(require('../../mods/todo/todo')(this.app));
```

Ok, now we're starting to see it take form! If you don't have your Saito instance started at this point, make sure to run `npm run nuke` in your temrinal to recompile the modules, then `npm start` and take a look at [`http://localhost:12101/todo`](http://localhost:12101/todo) to check it out and see what it looks like.

### Event Listeners with attachEvents

Our module is starting to form, but it still isn't functional quite yet. Let's create an event listener on our button using jquery to create a transaction out of the whatever we put in the form next to it.

```javascript
// mods.js

// ...

Todo.prototype.attachEvents = function attachEvents(app) {
  if (!app.BROWSER) { return };

  $('#add_task_button').off();
  $('#add_task_button').on('click', () => {
    alert("You've clicked the button");

    let description = $('.submit_task').val();
    $('.submit_task').val("");

    if (description) {
      var task = {
        description,
        completed: false
      }
    } else {
      alert("Please put something in the description box before submitting");
    }

    var task_tx = this.createTodoTX(task);

    if (!task_tx) {
      alert("You don't have enough funds to post this");
    }

    this.addTask(task_tx);

  });
}

Todo.prototype.addTask = function addTask(task_tx) {
  if (this.tasks[task_tx.transaction.sig]) { return; }
  var {sig, msg} = task_tx.transaction

  var newTask = `
  <div class="task_container">
    <input type="checkbox" class="task_checkbox" id="${sig}">
    <div class="task" id="task_${sig}">${msg.description}</div>
  </div>
  `
  $('.todoList').append(newTask);

  this.tasks[task_tx.transaction.sig] = 1;

  this.attachEvents(this.app);
}

```

We're creating a transaction from our description, propagating out to the Saito network, then adding the task locally. You can have both peers on the network be able to stay synced now when posted.

Now we have to do this again for clicking on the checkbox. We'll add another handle on `attachEvents`

```javascript
// todo.js

// attachEvents

// ...

$('input:checkbox').off();
$('input:checkbox').on('click', function() {
  var checkbox = {
    id: this.id,
    type: "checkbox",
    completed: this.checked
  }

  var checkbox_tx = todo_self.createTodoTX(checkbox);

  if (!checkbox_tx) {
    alert("You don't have enough funds to post this");
  }
});
```

Locally our task will update automatically, but for the other nodes in the network we need to toggle our checkboxes manually when the request comes in through the transaction.

```javascript
Todo.prototype.toggleCheckbox = function toggleCheckbox(checkbox_tx) {
  var {id, completed} = checkbox_tx.transaction.msg;
  $(`#${id}`).prop('checked', completed);
}
```

With that, now we can open up two browsers both at `https://localhost:12101`. Assuming both wallets have tokens, we can have see that our tasks and checkboxes are synced between both tabs!

Congratulations, you've officially created your first Saito module! There's much more to be done with our module, you can add a database to save the state. You can use `handlePeerRequest` to send off-chain data between peers. You can even integrate with other Saito modules such as Saito Email and Saito Advertisements to give your users free Saito. This is only the beginning of your journey of building decentralized applicationbs on Saito. Check out the rest of the documentation to get a grasp of other functions, and check out the [repo](https://github.com/SaitoTech/saito) for examples of some more complicated Saito modules the Saito team has already created.

