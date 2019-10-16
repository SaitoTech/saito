# Peer API

### sendRequest
- `message` a string describing the context of the request
- `data` JSON to deliver to a Saito Peer

Sends message to other Saito peer. These functions are handled by Saito peer's `addSocketEvents` function. For modules, additional handles can be added to the `handlePeerRequest` function.

### sendRequestWithCallback
- `message` a string describing the context of the request
- `data` JSON to deliver to a Saito Peer
- `callback` function to run after the success

Sends message to other Saito peer and runs callback on success. These functions are handled by Saito peer's `addSocketEvents` function.

