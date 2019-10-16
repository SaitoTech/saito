# Module API
This is a list of all the existing functions that are implemented for our modules. If you have would like to help extend our modules, feel free to make a PR on our [Saito repo](https://github.com/SaitoTech/saito)


### installModule
- `app` Saito application state

this callback is run the first time the module is loaded

### initialize
- `app` Saito application state

this callback is run every time the module is initialized

### isBrowserActive
- `app` Saito application state

this callback returns 0 if the user is not browsing a webpage from the application, and 1 if it is browsing a webpage from  an application. We use it to selectively disable code when browsers are running.

### initializeHTML
- `app` Saito application state

is called whenever web applications are loaded

### attachEvents
- `app` Saito application state

this callback attaches the javascript interactive bindings to the DOM, allowing us to incorporate the web applications to our own internal functions and send and receive transactions natively.

### loadFromArchives
- `app` Saito application state
- `tx` Saito transaction

this callback is run whenever our archives loads additional data either from its local memory or whenever it is fetched from a remote server

### onConfirmation
- `tx` Saito transaction from latest block
- `confnum` times it's been confirmed by the current system
- `app` Saito application state

This callback is run every time a block receives a confirmation. This is where the most important code in your module should go, listening to requests that come in over the blockchain and replying.

### onNewBlock
- `blk` new block data
- `lc` boolean value that tells us if the new block is a part of the longest chain or not

This callback is run every time a block is added to the longest_chain it differs from the onConfirmation function in that it is not linked to individual transactions -- i.e. it will only be run once per block, while the onConfirmation function is run by every TRANSACTION tagged as this is where the most important code in your module should go, listening to requests that come in over the blockchain and replying.

### onChainReorganization
- `block_id` id of current block
- `block_hash` hash of current block
- `lc` boolean value that tells us if the new block is a part of the longest chain or not

This callback is run everytime the chain is reorganized, for every block with a status that is changed. so it is invoked first to notify us when  longest_chain is set to ZERO as we unmark the previously dominant chain and then it is run a second time setting the LC to 1 for all of the blocks that are moved (back?) into the longest_chain


### shouldAffixCallbackToModule
- `app` Saito application state

Sometimes modules want to run the onConfirmation function for transactions that belong to OTHER modules. An example is a server that wants to monitor AUTH messages, or a module that needs to parse third-party email messages for custom data processing.


### webServer
- `app` Saito application state
- `expressapp` express instance being passed to the module

this callback allows the module to serve pages through the main application
server, by listening to specific route-requests and serving data from its own 
separate web directory.

express routing link checkout the server.js class for an example of how to do this.

### updateBalance
- `app` Saito application state

this callback is run whenever the wallet balance is updated if your web application needs to display the amount of funds in the user wallet, you should hook into this to update your display when it changes.

### updateBlockchainSync
- `current` current block id
- `target` target block id

this callback is run to notify applications of the state of  blockchain syncing. It will be triggered on startup and with every additional block added.



## Email Functions
These three functions are used if you want your module to interact with the default Saito email client. They allow you to format and return HTML data that can be displayed in the main body of the email client.

### displayEmailForm
- `app` Saito application state

this prepares the HTML form that we use to enter the information needed by our module. In the email client this is what displays the title and email inputs into which the users can type their email.

### displayEmailMessage
- `app` Saito application state
- `message_id` unique string to identify email message

This formats our transaction so that it can be displayed in the body of an email if needed

### formatEmailTransaction
- `tx` Saito transaction
- `app` Saito application state

this is invoked when a user decides to send a transaction through the default email client. It should grab the submitted data and structure it into the transaction in a way that can be understood by other modules listening on the network.

### attachEmailEvents
- `app` Saito application state

Mail client runs this function on the mod class to let them optionally add interactivity to the emails they send (i.e. links that process data in certain ways, etc.)

### attachEmailFormEvents
- `app` Saito application state

Mail client runs this function on the mod class to let them optionally add interactivity to the email forms that the originator of the first email page uses.


## Peer-to-Peer
These are functions that are used to send off-chain information to other Saito nodes on the network.

### handleDomainRequest
- `app` Saito application state
- `message` message sent over the socket
- `peer` Saito peer
- `callback` function to run afterwards

This is a specialized callback for modules that want to respond to DNS requests over the Saito blockchain. DNS requests are routed directly to this function.

### handlePeerRequest
- `app` Saito application state
- `message` message sent over the socket
- `peer` Saito peer
- `callback` function to run afterwards

Not all messages sent from peer-to-peer need to be transactions. the underlying software structure supports a number of alternatives, including requests for transmitting blocks, transactions, etc. DNS messages are one example, and are treated specially because of the importance of the DNS system for routing data. This is a more generic way to plug into P2P routing.

if your web application defines a lower-level massage format, it can send and receive data WITHOUT the need for that data to be confirmed in the blockchain. See our search module for an example of this in action. This is useful for applications that are happy to pass data directly between peers, but still want to use the blockchain for peer discovery (i.e. "what is your IP address" requests)


