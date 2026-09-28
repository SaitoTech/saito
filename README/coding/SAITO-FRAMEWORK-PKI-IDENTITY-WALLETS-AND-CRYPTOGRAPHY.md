# Saito Framework — PKI, Identity, Wallets and Cryptography

## Purpose

This document explains how Saito handles cryptographic identity, wallets, public keys, private keys, transactions, peer authentication, encryption, key exchange, contacts, and cryptographic functions.

The purpose is not to prescribe a single application architecture.

Saito provides a set of cryptographic and networking tools. Applications choose which tools they need based on their communication, privacy, authentication, ownership, and data-availability requirements.

An AI developer working with Saito should therefore begin by asking:

- Who needs to communicate?
- What identity needs to be known?
- Does the application need to establish authorship?
- Does it need privacy?
- What information should be publicly available?
- What information should only be available to particular participants?
- Where does the data need to exist?
- Does the application need a user's wallet identity, a module/operator identity, or another keypair?
- Is the communication on-chain or off-chain?
- Does the transaction itself need to be signed?

Do not begin by assuming that every application needs accounts, passwords, sessions, JWTs, a centralized authentication server, or a database-backed user identity system.

Saito provides cryptographic primitives and APIs that allow applications to construct the communication and identity model they actually require.

---

# 1. The Fundamental Identity Model

A Saito network identity is a public/private key pair.

The public key is the network address.

Saito does not derive the user's network address by hashing the public key. The public key itself is used as the address.

Conceptually:

    private key
        │
        ├── proves control
        │
        ▼
    public key
        │
        ├── network address
        ├── transaction sender/recipient identity
        ├── wallet identity
        ├── peer identity after handshake
        └── application identity where appropriate

The private key proves control of the public key.

The public key can be distributed freely.

The private key must remain under the control of whoever is supposed to control that identity.

The current Core wallet uses a secp256k1 keypair. The wallet public key is represented as a Base58 public-key address. The private key is represented internally as the corresponding private key material.

The Core wallet is the underlying owner of the user's Saito cryptographic identity.

---

# 2. Public Keys Are Addresses

A Saito transaction is addressed using public keys.

Transactions have inputs and outputs containing slips associated with public keys.

For example, conceptually:

    Alice public key
          │
          ▼
    transaction input
          │
          ▼
    transaction output
          │
          ▼
    Bob public key

The public key is therefore not merely a username or account identifier. It is part of the actual transaction and UTXO model.

If an output belongs to a public key, control of the corresponding private key is what permits the owner to spend it.

Applications should normally use public keys directly when they need to identify Saito users.

Do not introduce an unnecessary intermediary account identifier simply because conventional web applications use:

    user_id → account → public key

The natural Saito model is:

    public key → identity

Applications may add names, profiles, handles, or other metadata on top of that identity.

Those additional identifiers do not replace the underlying public-key identity.

---

# 3. Wallet Identity

The Saito wallet contains the user's cryptographic identity and provides the application API for working with it.

The normal application-facing interface is:

    app.wallet

An application should use `app.wallet` for wallet operations rather than reaching directly into lower-level wallet implementation details.

The wallet API provides functionality including:

- obtaining the public key;
- obtaining the private key where the application legitimately requires it;
- creating transactions;
- creating unsigned transactions;
- signing transactions;
- managing wallet slips;
- managing NFTs;
- managing fees;
- importing and exporting wallet information;
- interacting with other supported wallet functionality.

The architectural rule is broader than the wallet itself:

> Treat the appropriate `lib/saito` class as the API for that class of Saito functionality.

Saito's implementation is layered. Rust/WASM may contain the underlying implementation, but application developers should normally use the JavaScript-facing Saito APIs rather than duplicating those implementations.

For example:

    app.wallet
        → wallet functionality

    app.crypto
        → cryptographic functionality

    app.keychain
        → relationships with other public keys

    app.network
        → network and peer functionality

The existence of lower-level implementations does not mean an application should bypass the public application API.

---

# 4. The Wallet Is Not a Conventional Web Account

A Saito wallet should not be conceptualized as:

    username
    password
    server-side account
    session token
    JWT

The fundamental identity is the cryptographic keypair.

A username may exist as an application-level naming layer.

A profile may exist as application data.

A contact may exist in the local Keychain.

None of those replace the wallet's public/private key identity.

This distinction is especially important when adapting conventional web development patterns to Saito.

A developer coming from a server-client architecture may instinctively build:

    login()
       ↓
    authenticate user
       ↓
    create session
       ↓
    associate session with database user

Saito applications frequently do not need this architecture.

The wallet already provides the user's cryptographic identity.

---

# 5. The Wallet and `app.options`

The live wallet is implemented through the Saito Core/WASM wallet infrastructure.

`app.options.wallet` contains a persistent representation of wallet information.

This distinction matters:

    live wallet state
        ↓
    Core / WASM wallet

    persistent application state
        ↓
    app.options.wallet

`app.options` is a general persistence mechanism and configuration document. It is not a secure hardware-backed key vault.

The current implementation persists wallet private-key material in wallet options. Browser persistence uses the application's local storage mechanism, while Node environments persist options through their configured storage.

Therefore:

> Treat wallet private keys as sensitive local state even though the current Saito persistence architecture stores them in application options.

Applications should not create redundant copies of the wallet private key merely because they need to sign transactions.

Use the wallet API.

---

# 6. Private Keys

Saito does not impose a universal rule that modules may never access private keys.

Whether a module should access a private key is an application and trust decision.

For ordinary consumer applications, the normal pattern is:

    user's browser
          ↓
    user's wallet
          ↓
    module
          ↓
    signed transaction

The module operates using the user's wallet identity.

There are also legitimate situations where a module or server operator needs a separate keypair.

For example, a server-operated service can have:

    service private key
          ↓
    service public key
          ↓
    service address

Users can send transactions to that public key.

The service can process those transactions and publish responses signed by its own identity.

The Registry is an example of this pattern.

The important distinction is therefore not:

> Modules must never have private keys.

The useful distinction is:

> Whose identity does this private key represent, and why does the application need to control it?

A consumer application normally uses the user's wallet identity.

A server-operated service may legitimately have its own operator identity.

A module distributed to users should not contain the developer's private key. Anyone receiving the module would receive the key.

Public keys, by contrast, can generally be distributed freely and may be hardcoded into applications when they are intentionally part of an addressing or authorization policy.

---

# 7. Module Identity

Modules can have their own public/private keypair when the application's design requires one.

For example, a server-operated module might:

1. maintain a public/private keypair;
2. publish its public key;
3. listen for transactions sent to that public key;
4. process requests;
5. create response transactions;
6. sign those responses using the module's private key.

This is not a second kind of Saito identity.

It is simply another cryptographic identity controlled by a particular application or operator.

The key question is always:

> What entity is this keypair intended to represent?

Possible answers include:

- the current user;
- a server operator;
- a Registry service;
- a Store service;
- another application-controlled identity;
- a temporary or disposable application identity.

---

# 8. Public Keys as Application Addresses

A module may publish its public key as an address that users can send transactions to.

This enables a straightforward distributed application pattern:

    User
      │
      │ transaction to module public key
      ▼
    Module operator
      │
      │ process request
      ▼
    response transaction
      │
      ▼
    User / network

The module does not need to be a conventional centralized API server merely because it accepts requests.

It can participate in Saito's transaction and peer-to-peer communication system.

The Registry is an example.

---

# 9. The Registry Pattern

Saito operates a Registry module that provides human-readable usernames.

The Registry does not replace public-key identity.

Instead, it creates a cryptographically verifiable relationship between a username and a public key.

Conceptually:

    username
       │
       ▼
    public key

The Registry is operated using its own public/private keypair.

A user sends a request to the Registry asking to register a username.

The Registry:

1. receives the request;
2. checks whether the username is already registered;
3. creates a transaction stating that the public key has been registered under that username;
4. signs the transaction using the Registry's private key;
5. publishes the transaction;
6. maintains a database/cache for convenient lookup.

Other nodes can receive and observe the Registry's signed transactions.

The signed transaction provides a decentralized, cryptographically verifiable statement made by the Registry.

The important architectural lesson is not that every application should build its own Registry.

It is:

> Human-readable names can be layered over cryptographic identities by an application or service that publishes signed statements establishing those relationships.

Applications that want to display Saito usernames should generally use the existing Registry rather than inventing another username system.

---

# 10. Usernames Are an Overlay

The underlying identity remains:

    public key

A username is an additional label.

For example:

    public key
        ↓
    Registry lookup
        ↓
    username

Applications can use the public key internally while displaying the username to users.

This is particularly useful because public keys are excellent machine identities but poor human-facing labels.

The Registry therefore solves a presentation and naming problem without changing the underlying identity model.

---

# 11. RedSquare and Username Resolution

The Registry is also used as an infrastructure service by applications.

RedSquare provides an example of this pattern.

Content can be rendered with information identifying public keys in a format that allows the browser-side application to subsequently request corresponding usernames from the Registry.

The username lookup occurs after the initial content has loaded.

Conceptually:

    load content
         ↓
    identify public keys
         ↓
    request usernames
         ↓
    Registry response
         ↓
    replace/render username information

This is an important Saito application pattern:

> Application content does not have to block on every piece of human-readable metadata before it can render.

Names can be resolved after the underlying content has loaded.

An AI implementing username display should investigate the existing Registry integration and RedSquare implementation rather than creating a new username service.

---

# 12. The Registry Is a Pattern, Not a Special Rule

The Registry illustrates a more general application architecture:

    request
       ↓
    service node
       ↓
    process request
       ↓
    create signed response
       ↓
    publish response

The fact that the Registry signs its statements is meaningful because the Registry's public key is known.

The same general architecture can be used by other application services.

The Registry is therefore an example of a module/operator identity, not a new fundamental identity layer in Saito.

---

# 13. Transaction Signing

A transaction can be cryptographically signed by the wallet.

The normal application pattern is:

    create transaction
          ↓
    populate transaction data
          ↓
    sign transaction
          ↓
    propagate transaction

The transaction signature proves control of the corresponding private key.

The current implementation signs the transaction after packing its data. The transaction data therefore participates in the signature.

The practical consequence is important:

> If an application needs cryptographic proof that a particular identity authored a transaction, the transaction should be signed.

Do not create an application-specific signature protocol when the Saito transaction-signing mechanism already provides the required proof.

---

# 14. Transaction Signatures Are Not Automatically Present Everywhere

Not every transaction-shaped communication path necessarily produces a cryptographically signed transaction.

This is especially important for off-chain application communication.

Some Saito APIs can send transaction-shaped application messages without requiring a transaction signature.

For example, `sendRequest` can operate with `signature_required` set to false.

Therefore an AI should not reason:

> “This object is a Saito transaction, therefore it must have been signed by the person whose public key appears in `from`.”

That assumption is incorrect for unsigned communication paths.

If authorship matters, use the signed form.

The exact API and arguments should be checked in the current Saito implementation when implementing the feature.

---

# 15. Peer Authentication

Saito nodes have their own public/private keys.

The network layer maintains connections to peers.

During the network handshake, Saito Core can require the peer to cryptographically prove control of its private key.

After successful authentication, the peer connection is associated with the corresponding public key.

Applications can inspect the network's peer information and determine whether a peer has completed the authentication process.

The relevant functionality is exposed through the Core network infrastructure.

The important point is that peer authentication is a property of the network connection.

It answers a question such as:

> Has this network connection cryptographically demonstrated control of the private key associated with this public key?

Whether that information matters to an application depends entirely on what the application is doing.

---

# 16. Do Not Assume Peer Authentication Is Always Necessary

A peer can initially appear in the peer list before it has completed its cryptographic handshake.

This is normal network behavior.

An application performing an ordinary data fetch may not care whether the peer has been authenticated yet.

An application performing a security-sensitive operation may care.

Therefore the correct rule is not:

> Always reject unauthenticated peers.

Nor is it:

> Always trust every peer.

The correct rule is:

> Determine whether the operation requires authenticated peer identity, and check the network authentication state when it does.

For example, the Admin module has a reason to expose peer connection and authentication information because network administration is one of its purposes.

A module fetching ordinary application data may have no reason to care.

---

# 17. Peer Identity Is Not Transaction Authorship

A peer is the network connection through which information arrives.

That does not automatically establish that the peer is the author of every transaction or transaction-shaped message that it forwards.

Therefore:

> Never infer transaction authorship merely from the network peer that delivered the transaction.

A transaction's cryptographic identity should be established from the transaction itself when authorship matters.

Conceptually:

    peer connection
         │
         └── tells you about the network endpoint

    transaction signature
         │
         └── proves transaction authorship

These are different questions.

---

# 18. When Should an Application Require Authentication?

There is no universal answer.

The application should ask what it actually needs to know.

For example:

    “I need to fetch data.”
        → peer authentication may not matter.

    “I need to know which node I am connected to.”
        → inspect Core network peer authentication.

    “I need proof that this transaction was authored by Alice.”
        → require a valid transaction signature.

    “I need the contents to remain private.”
        → encrypt the transaction message.

    “I need both privacy and authorship.”
        → encrypt the message and sign the transaction.

This is preferable to imposing an authentication layer on every application operation.

---

# 19. Encryption Is a Separate Decision

Authentication and encryption solve different problems.

Encryption answers:

> Who can read this information?

Signing answers:

> Who cryptographically authorized or authored this information?

An application may need:

- neither;
- encryption only;
- signing only;
- both.

Do not assume that every public transaction should be encrypted.

Do not assume that every encrypted transaction is automatically signed.

Do not assume that signing provides confidentiality.

---

# 20. What Can Be Encrypted?

Saito transactions contain routing and ledger information as well as application data.

The application message/content can be encrypted.

The transaction's routing information and UTXO structure cannot simply be hidden by encrypting the transaction message.

Conceptually:

    transaction
    ├── routing / network information
    ├── UTXO inputs
    ├── UTXO outputs
    └── application message/data
                      ↑
                  encrypt this

The practical application pattern is therefore:

    transaction
         │
         ├── public transaction structure
         │
         └── encrypted application message
                         │
                         ▼
                    recipient decrypts

The encryption protects the application content rather than making the entire blockchain transaction invisible.

---

# 21. Encrypted Blockchain Communication

Saito can be used to send encrypted application data through blockchain transactions.

For example:

    Alice
      │
      │ create transaction
      │
      ├── public transaction structure
      │
      └── encrypted message
               │
               ▼
          Saito network
               │
               ▼
             Bob
               │
               ▼
           decrypt message

The encrypted transaction can therefore provide secure application communication over a decentralized blockchain network.

This is particularly useful for applications such as:

- private game moves;
- private chat;
- encrypted credentials or secrets;
- encrypted purchase information;
- other application-specific private data.

The decision to encrypt depends on the application's requirements.

---

# 22. Diffie-Hellman and Shared Secrets

Saito supports mechanisms for establishing shared secrets between participants.

One approach uses Diffie-Hellman/ECDH.

Conceptually:

    Alice private key + Bob public key
                  ↓
             shared secret

and:

    Bob private key + Alice public key
                  ↓
             same shared secret

The shared secret can then be used with symmetric encryption.

Saito has multiple existing mechanisms for this.

The Encrypt module supports explicit Diffie-Hellman key exchanges, including separate key material stored in the Keychain.

Saito's cryptographic APIs also expose shared-secret generation using wallet key material.

Applications should inspect the existing API and choose the mechanism appropriate to their use case rather than implementing their own key exchange.

---

# 23. Explicit Key Exchanges

The Encrypt module can establish a separate cryptographic relationship between two participants.

Conceptually:

    Alice
      │
      │ key-exchange request
      ▼
    Bob
      │
      │ response
      ▼
    Alice
      │
      ▼
    shared secret

The resulting encryption information can be associated with the corresponding Keychain entry.

This permits subsequent application messages to be encrypted for that relationship.

The explicit exchange is particularly useful when an application wants a persistent encryption relationship with another public-key identity.

---

# 24. Wallet-Key-Based Encryption

Saito also supports generating a shared secret from wallet key material and another user's public key.

This allows an application to derive encryption material without necessarily performing a separate explicit exchange first.

The exact behavior depends on the encryption API being used.

An application should therefore inspect the current `app.keychain` and encryption APIs rather than assuming that every encrypted relationship has been established through the Encrypt module's explicit exchange.

The important architectural concept is:

> Public-key identities can be used to establish symmetric encryption keys, allowing application messages to be encrypted for specific recipients.

---

# 25. Keychain

`app.keychain` is the Saito subsystem for maintaining information about other public-key identities and relationships with them.

A Keychain entry may contain information such as:

- public key;
- identifier/username;
- contact state;
- watched state;
- encryption-related key material;
- shared secrets;
- group/event information;
- other application-specific relationship metadata.

The Keychain is local application state.

It is not the blockchain's canonical identity registry.

It is not a certificate authority.

It does not mean that every public key in the Keychain is trusted.

An application can add a public key to its Keychain without proving that the corresponding person is trustworthy.

---

# 26. Adding a Contact Is Not the Same as Establishing Encryption

Adding a public key to the Keychain and establishing an encrypted communication channel are distinct operations.

For example:

    addKey(publicKey)
        ↓
    local relationship record

does not necessarily mean:

    addKey(publicKey)
        ↓
    DH exchange
        ↓
    shared secret
        ↓
    encrypted communication

The Encrypt module provides explicit key-exchange functionality when an application wants to establish such a relationship.

This distinction prevents an AI from assuming that “contact” automatically means “encrypted contact.”

---

# 27. `added` and `watched`

The Keychain can contain several different relationship states.

`added` can represent that a user has explicitly added a contact.

`watched` has different purposes and should not simply be interpreted as “friend” or “trusted person.”

Some Keychain state is associated with network/wallet monitoring and other application behaviors.

The important AI rule is:

> Do not collapse Keychain relationship fields into a single concept of trust.

If an application needs to know whether a user explicitly added another identity, use the appropriate contact state.

If it needs to know whether an identity is being watched or otherwise tracked, use the appropriate state for that function.

If it needs cryptographic confidentiality, check whether the required encryption relationship exists.

---

# 28. A Public Key Is Not Automatically Trusted

Anyone can know another person's public key.

Anyone can put a public key into a local Keychain.

Therefore:

    public key
        ≠
    trusted person

The public key establishes cryptographic identity.

Whether the application trusts that identity for a particular purpose is an application-level decision.

The Registry provides one example of an independently verifiable statement:

    Registry public key
          ↓
    signed statement
          ↓
    username → public key

That provides evidence of what the Registry asserted.

It does not magically turn every public key into a globally trusted human identity.

---

# 29. `app.crypto`

`app.crypto` exposes Saito's cryptographic functionality to application code.

A major reason to use these APIs is that important cryptographic operations are implemented in Rust and exposed through WASM.

This can provide substantially better performance than implementing the same operations purely in JavaScript.

Applications should therefore prefer the existing Saito cryptographic API rather than importing unrelated cryptographic libraries for functions Saito already provides.

The cryptographic subsystem includes functionality for operations such as:

- key generation;
- signing;
- signature verification;
- hashing;
- shared-secret generation;
- encryption-related operations;
- random-number/random-byte generation;
- other cryptographic primitives.

The exact API should always be checked against the current Saito source.

---

# 30. Cryptography Is Infrastructure, Not Application State

Cryptographic functions are tools.

They generate or transform cryptographic material.

They do not themselves define application state.

For example:

    generate private key
    generate randomness
    hash data
    sign data
    verify signature
    derive shared secret
    encrypt data
    decrypt data

These operations can be used by applications to construct their own protocols and state.

The cryptographic subsystem should therefore not be confused with:

- the blockchain;
- the wallet's application state;
- the Keychain;
- module SQL databases;
- the Registry;
- application-specific data structures.

---

# 31. Use Saito's Cryptographic APIs

An AI should generally prefer:

    app.crypto
    app.wallet
    app.keychain

over independently implementing equivalent cryptographic functionality.

This avoids:

- duplicate cryptographic implementations;
- inconsistent hashing;
- incompatible signing formats;
- unnecessary JavaScript cryptography;
- accidental divergence from Saito's transaction format;
- unnecessary dependencies.

There are existing legacy and specialized cases where modules directly use lower-level or third-party cryptographic libraries.

Those cases should not automatically be copied into new application code.

The AI should first determine whether the Saito API already provides the required functionality.

---

# 32. Saito Hashing

Saito's core hashing implementation uses Blake3.

Do not assume that SHA-256 is the Saito consensus hash merely because SHA-256 is common in other blockchain systems.

When an application needs a Saito-compatible hash, use the Saito cryptographic API or the corresponding Saito implementation.

For example:

    app.crypto.hash(...)

is preferable to introducing another hashing implementation without a reason.

---

# 33. Transaction Identity and Signatures

Transaction signatures are useful application identifiers.

Applications commonly use transaction signatures for:

- identifying transactions;
- linking application records;
- referencing previous application messages;
- constructing application-level trees;
- storing transaction-related records.

For example, RedSquare uses transaction signatures when working with tweet relationships.

However:

> A transaction signature is not necessarily a universal permanent identifier for every possible representation of an application event.

Chain inclusion and transaction identity are related but distinct concepts.

A reorganization can change whether a transaction is part of the current longest chain.

Applications that care about canonical chain inclusion must track that separately.

---

# 34. Wallet Identity vs Transaction Identity

These should not be confused.

Wallet identity:

    public key

Transaction identity:

    transaction signature

Chain inclusion:

    block / chain position

UTXO identity:

    slip information

Application record identity:

    whatever identifier the module chooses

These concepts can be related without being interchangeable.

For example:

    public key
        ↓
    author

    transaction signature
        ↓
    particular transaction

    block hash
        ↓
    particular block inclusion

An AI should not use one of these identifiers merely because it is convenient if the application actually needs another.

---

# 35. NFT Ownership

NFT ownership is ultimately represented through the relevant UTXO/slip state.

An application should not infer current NFT ownership merely by finding the original NFT mint transaction.

The current owner is represented by the current ownership state.

This is important because ownership can change through subsequent transactions.

Therefore:

> When determining current NFT ownership, use the current wallet/UTXO/NFT state or the appropriate Saito ownership mechanism rather than treating the original mint transaction as the current ownership record.

---

# 36. P2SH and Cryptographic Authorization

Saito P2SH provides another way to use cryptographic conditions.

A P2SH script can encode conditions that determine whether a particular UTXO can be spent.

The condition might involve:

- a public key;
- signatures;
- ownership;
- NFT ownership;
- transaction fields;
- other supported script predicates;
- combinations of conditions.

There is no single required pattern.

For example, a script might permit:

    Alice can spend

or:

    Alice OR Store can spend

or:

    anyone can spend if they provide
    the required counter-value

The appropriate design depends on the application's economic and messaging requirements.

Do not hardcode a public key merely because conventional smart-contract examples do.

A public key is one possible authorization condition among many.

---

# 37. Example: A Decentralized Exchange

A decentralized exchange could publish P2SH-controlled UTXOs whose spending condition effectively says:

> Anyone may spend this input if the transaction provides the required counter-value.

The exchange does not necessarily need to have a special operator public key.

The authorization condition itself can define the required exchange.

The important development process is:

1. determine what assets are being exchanged;
2. determine what constitutes a valid trade;
3. determine what information must be published;
4. determine who must be able to spend the UTXO;
5. determine what conditions must be cryptographically verifiable;
6. construct the appropriate transaction/P2SH mechanism.

Do not begin by assuming the application needs a conventional contract/account architecture.

---

# 38. Cryptographic Authorization Is Different from Encryption

A P2SH spending condition can authorize an operation.

It does not necessarily encrypt anything.

Similarly:

    signature
        → authorship/authentication

    P2SH
        → authorization condition

    encryption
        → confidentiality

These can be combined when necessary.

They should not be treated as interchangeable.

---

# 39. Communication Design Comes Before Cryptography

When implementing an application, determine the communication model first.

Ask:

    Who communicates with whom?

    What data is being communicated?

    Is the data public?

    Is it private?

    Who should be able to decrypt it?

    Does the recipient need proof of authorship?

    Does the network peer's identity matter?

    Does the data need to be on-chain?

    Does the application need the data permanently?

    Where will recipients retrieve it?

Only after answering these questions should the application choose:

    unsigned transaction
    signed transaction
    encrypted transaction
    authenticated peer connection
    explicit DH exchange
    P2SH authorization
    module/operator key
    public Registry identity
    or some combination

---

# 40. Public Application Data

Some applications intentionally publish information to everyone.

Examples include:

- social posts;
- public profiles;
- public market information;
- public application events.

For these applications, encrypting the application data would defeat the application's purpose.

The correct design may simply be:

    transaction
       ↓
    public application data
       ↓
    network
       ↓
    everyone can read it

The fact that encryption exists does not mean it should be used.

---

# 41. Private Application Data

Other applications need confidentiality.

Examples include:

- private chat;
- private game moves;
- private credentials;
- encrypted application secrets;
- private purchase information.

The application can encrypt the transaction's application message before publishing or transmitting it.

Conceptually:

    plaintext application message
              ↓
          encryption
              ↓
    encrypted transaction data
              ↓
          Saito network
              ↓
          recipient
              ↓
           decrypt

The blockchain can therefore serve as a decentralized communication and publication mechanism even when the application content itself is private.

---

# 42. The Application Should Decide Whether to Sign

The important question is not:

> “Are transactions supposed to be signed?”

The useful question is:

> “Does this particular operation require cryptographic proof of authorship?”

If yes, ensure the transaction is signed.

Some APIs require explicitly requesting a signature.

For example, off-chain request mechanisms can have a `signature_required` option.

An AI implementing a security-sensitive operation should inspect the actual API and make sure it has selected the signed path.

Do not assume that merely constructing a transaction-shaped object guarantees a cryptographic signature.

---

# 43. The Application Should Decide Whether to Encrypt

Likewise:

> “Should all transactions be encrypted?”

is the wrong question.

Instead ask:

> “Does the application data need confidentiality?”

If no:

    publish the application data

If yes:

    encrypt the application data for the intended recipient(s)

If authorship also matters:

    sign the transaction as well

This produces a much simpler design than creating a universal authentication/encryption layer.

---

# 44. Encryption and Signing Can Be Combined

An application may require both.

Conceptually:

    application message
          │
          ├── encrypt for recipient
          │
          ▼
    transaction data
          │
          ▼
       sign tx
          │
          ▼
      propagate

The recipient can then:

1. verify the transaction signature;
2. decrypt the application data;
3. process the application message.

The exact order and API calls should follow the existing Saito implementation.

For example, Saito provides wallet functionality for signing and encrypting transactions together.

---

# 45. Authenticated Peers vs Signed Transactions

These mechanisms answer different application questions.

A network handshake tells the software:

> This network connection has cryptographically demonstrated control of this public key.

A signed transaction tells the software:

> This transaction was cryptographically signed by the corresponding private key.

An application may need one, both, or neither.

Do not create an artificial hierarchy in which one is universally “stronger.”

Choose the mechanism according to the question the application needs to answer.

---

# 46. Network Connections Have a Small Authentication Window

When peers connect, they may initially appear in the peer list before completing the cryptographic handshake.

This does not necessarily indicate a security problem.

It simply means authentication has not yet been established.

If the application needs authenticated peer identity, it can inspect the Core network state and wait for or require successful authentication.

If it does not need that information, there is no reason to block ordinary network operations merely because the handshake has not yet completed.

---

# 47. Do Not Build a Conventional Authentication System Without a Requirement

A common mistake for an AI coming from conventional web development is to see a requirement such as:

> “We need to know who the user is.”

and immediately build:

    username
    password
    login endpoint
    session
    JWT
    user database

In Saito, first ask whether the application actually needs any of these.

The user already has a cryptographic identity.

If the application needs a human-readable name:

    use the Registry.

If the application needs proof that the user authored an operation:

    sign the transaction.

If the application needs encrypted communication:

    use Saito's encryption/DH mechanisms.

If the application needs a server-operated identity:

    create and manage an appropriate module/operator keypair.

If the application needs a local relationship with another public key:

    use the Keychain.

Do not build an account system merely because account systems are familiar.

---

# 48. The Keychain Is Not a Certificate Authority

A Keychain entry should not be interpreted as:

> “The Saito system has certified that this person is trustworthy.”

The Keychain is local application state.

It can contain:

    public key
    username/identifier
    contact state
    watched state
    encryption state
    shared secret
    group information
    application metadata

The application decides what those relationships mean.

---

# 49. Private-Key Risk Is Application-Specific

Saito allows applications to access wallet private-key functionality where appropriate.

That flexibility is intentional.

It allows developers to build applications with different trust and security models.

For example, an application may be deliberately disposable:

    create lightweight wallet
          ↓
    put small amount of funds in it
          ↓
    use application
          ↓
    abandon / destroy wallet

In such an application, the user may consciously accept a higher compromise risk in exchange for convenience.

Another application may hold significant assets and therefore require much stronger operational security.

Saito does not force every application into the same security model.

The developer and user decide what level of risk is appropriate.

The important requirement is that the consequences of the decision are understood.

---

# 50. Public Keys Can Be Distributed

Public keys are intended to be public.

It is therefore generally safe for applications to:

- publish public keys;
- include public keys in configuration;
- hardcode known service public keys;
- use public keys as transaction destinations;
- use public keys in authorization policies.

A distributed application may need to know the public key of a service it communicates with.

That does not require distributing the service's private key.

---

# 51. Never Distribute Operator Private Keys

The inverse rule is critical.

If a module contains a private key and the module is distributed to users, every user receives that private key.

That means the private key no longer identifies a single trusted operator.

Therefore:

> A distributed module may contain a known public key, but an operator's private key should remain under the operator's control.

Server-operated services should keep their private keys on the server or in whatever secure environment the operator chooses.

---

# 52. There Is No Single “Correct” Cryptographic Architecture

Saito provides tools rather than forcing every application into one pattern.

For example, an application might use:

    wallet identity
    +
    signed transactions
    +
    public application data

Another might use:

    wallet identity
    +
    encrypted transactions
    +
    signed transactions

Another might use:

    server/module identity
    +
    request transactions
    +
    signed service responses

Another might use:

    P2SH
    +
    UTXOs
    +
    cryptographic spending conditions

Another might combine all of these.

The correct architecture depends on the application's requirements.

An AI should resist the temptation to choose one familiar pattern and apply it everywhere.

---

# 53. Saito Is a Toolkit of Cryptographic and Communication Primitives

The right mental model is not:

> “Saito has one authentication system.”

It is:

> “Saito provides cryptographic identities, wallets, transactions, peer connections, encryption, key exchange, scripting, and application APIs that can be composed according to application requirements.”

The developer's job is to select the appropriate primitives.

The AI's job is to understand those primitives well enough not to introduce unnecessary infrastructure.

---

# 54. Common Mistakes for AI Developers

### Mistake 1: Creating usernames as the primary identity

Wrong:

    username → user account → public key

Preferred:

    public key → identity
        ↓
    Registry → optional username

### Mistake 2: Creating passwords and JWTs

Do not build conventional login infrastructure unless the application has a specific requirement that the Saito identity model does not address.

### Mistake 3: Treating every peer as authenticated

Peers may initially be connected before the cryptographic handshake completes.

Check network authentication if the application actually requires authenticated peer identity.

### Mistake 4: Treating peer identity as transaction authorship

The peer that delivered a transaction is not automatically its author.

When authorship matters, verify the transaction signature.

### Mistake 5: Assuming every transaction is signed

Some transaction/application-message APIs allow unsigned communication.

Explicitly select the signed path when cryptographic authorship is required.

### Mistake 6: Assuming encryption is automatic

If an application requires privacy, explicitly use the encryption mechanism appropriate to the communication path.

### Mistake 7: Assuming signing provides privacy

A signature authenticates/authors data. It does not make the data confidential.

### Mistake 8: Encrypting everything

Public applications should normally publish public information.

Encryption is a requirement-driven choice.

### Mistake 9: Implementing cryptography independently

Use `app.crypto`, `app.wallet`, `app.keychain`, and existing Saito encryption mechanisms before reaching for independent implementations.

### Mistake 10: Using SHA-256 because it is familiar

Saito's core hashing uses Blake3.

### Mistake 11: Treating Keychain entries as trusted identities

A public key can be added locally without proving anything about the person controlling it.

### Mistake 12: Distributing private operator keys

A distributed module must not contain the operator's private key.

### Mistake 13: Treating the Registry as the identity system

The Registry provides human-readable naming on top of public-key identity.

### Mistake 14: Assuming there is one correct cryptographic pattern

Different applications require different combinations of signing, encryption, peer authentication, P2SH, service identities, and public data.

---

# 55. Practical Decision Process for an AI

When implementing an application feature involving identity or cryptography, use this sequence.

### Step 1: Identify the parties

Who is communicating?

    user ↔ user
    user ↔ service
    node ↔ node
    module ↔ user
    public network

### Step 2: Identify the required identity

What identity actually matters?

    user's wallet public key
    remote peer public key
    module/operator public key
    Registry username
    application-specific identity

### Step 3: Determine whether authorship matters

If the application needs cryptographic proof of authorship:

    sign the transaction

Check the actual transaction API to ensure signing is enabled.

### Step 4: Determine whether privacy matters

If the application data is private:

    encrypt the application message

Do not attempt to encrypt the parts of the transaction that necessarily remain visible for routing and ledger operation.

### Step 5: Determine whether peer authentication matters

If the application specifically needs to know the identity of a connected node:

    inspect app.core.network / peer authentication state

Do not add an independent authentication protocol without a reason.

### Step 6: Determine whether a persistent encryption relationship is needed

If participants need repeated encrypted communication:

    investigate Keychain + Encrypt/DH

If one-off encryption is sufficient:

    use the appropriate existing Saito encryption API.

### Step 7: Determine whether human-readable names are needed

If the application needs Saito usernames:

    use the Registry

Do not create a second username registry.

### Step 8: Determine whether a module needs its own identity

If the module is operating as a service:

    create/use a module or operator keypair

If it is an ordinary consumer application:

    use the user's wallet identity unless there is a specific reason not to.

### Step 9: Determine the data lifecycle

Ask:

    Is this data public?
    Is it private?
    Is it on-chain?
    Is it off-chain?
    Who needs to retrieve it?
    How long must it remain available?
    Does it need cryptographic proof?
    Does it need encryption?

Cryptography should follow these requirements rather than precede them.

---

# 56. API Orientation

For normal application development, begin with these interfaces:

    app.wallet
    app.crypto
    app.keychain
    app.network
    app.core.network

Use:

    app.wallet
        for wallet identity and transaction operations

    app.crypto
        for cryptographic primitives

    app.keychain
        for local relationships with other identities and encryption state

    app.network
        for application-facing network operations

    app.core.network
        when the application specifically needs lower-level peer/network information such as authentication state

When an API does not provide the required operation, inspect the relevant `lib/saito` implementation and lower-level WASM/Core APIs.

Do not duplicate functionality that Saito already provides.

---

# 57. The AI's Core Mental Model

The simplest useful mental model is:

    Public key
        = Saito network identity

    Private key
        = proof/control of that identity

    Wallet
        = API for the user's cryptographic identity and assets

    Transaction
        = structured object for communicating and transferring value

    Transaction signature
        = cryptographic proof of transaction authorship

    Peer handshake
        = cryptographic proof of control of the peer's network identity

    Keychain
        = local relationships with other public keys

    Registry
        = service that binds human-readable names to public keys

    app.crypto
        = cryptographic primitives implemented through Saito's crypto stack

    Encryption
        = confidentiality for application content

    P2SH
        = programmable spending/authorization conditions

    Module/operator key
        = an additional cryptographic identity used when an application needs one

None of these should be collapsed into a generic “user account” abstraction.

---

# 58. Final Principle

Saito does not require developers to choose between a fixed set of identities, authentication systems, or encryption architectures.

It provides cryptographic primitives and communication mechanisms from which applications can construct the architecture they need.

The most important question for an AI developer is therefore not:

> “What is the standard way to authenticate a Saito user?”

It is:

> “What does this application need to know, who needs to know it, what needs to be proven, what needs to remain private, and where does the resulting data need to exist?”

From that answer, select the appropriate Saito primitives.

Use the wallet when the user's identity is required.

Use transaction signatures when authorship needs to be cryptographically established.

Use peer authentication when the identity of a network connection matters.

Use encryption when application content needs confidentiality.

Use Diffie-Hellman and the existing encryption facilities when participants need shared secrets.

Use the Keychain for local relationships with other public keys.

Use the Registry when human-readable Saito usernames are required.

Use module/operator keypairs when a service itself needs a cryptographic identity.

Use P2SH when authorization needs to be expressed as a cryptographically enforceable spending condition.

And use the existing Saito APIs rather than rebuilding these mechanisms through conventional web authentication, database, or cryptographic libraries.

The central development principle is:

> Saito gives the application a set of cryptographic and communication tools. The application chooses how to compose them according to its actual requirements.
