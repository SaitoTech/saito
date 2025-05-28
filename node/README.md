# How To Use Saito

The NodeJS Implementation of Saito is where dApp developers can make their magic happen. Developers can get started by cloning the repo and running a local node which can serve applications directly to the browser. 

For comprehensive developer information, including instructions on deploying applications, please visit [The Saito Wiki](https://wiki.saito.io/en/install).

## Quickstart

### Installation Requirements:

- Machine with at least 2GB RAM.
- Build tools: git, g++, make, python, tsc
- Stack: node.js (v.16+), npm (v6+)
- TypeScript

**Install Saito:**
```
git clone https://github.com/saitotech/saito
cd saito/node
npm install
```
**Compile and run:**
```
git clone https://github.com/saitotech/saito
cd saito/node
npm install
```

Consult the **[Saito Wiki](https://wiki.saito.io/en/install)** for more detailed instructions, including installation instructions for [Windows](https://wiki.saito.io/install/windows) or [Mac](https://wiki.saito.io/install/mac), and [developer tutorials](https://wiki.saito.io/en/tutorials/dev).

<!--
### Linux

```
sudo apt-get update
sudo apt-get install g++ make git python
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash
sudo apt-get install -y nodejs npm
```

### Mac / Windows / Other

System-specific installation instructions are available on the [official NodeJS website](https://nodejs.org/en/).

## Install Saito and Start a Node

Clone the Saito software directory and through a Bash shell start-up an instance of Saito as follows:

```
git clone https://github.com/saitotech/saito-lite-rust
cd saito-lite-rust
npm install
npm run nuke
npm run dev
```

The system will be started in 'local' or 'development' mode with a default set of modules responding on port 12101.

Once Saito is running you can test that it is working by visiting `http://localhost:12101/wallet` in your browser. Saito applications look and feel like websites. They are not -- applications run directly inside your browser and connect with blockchain access-points to send and receive data. Our default installation includes a default set of modules (applications). You can change which modules are installed by editing the file `/config/modules.config.js` to include them. Modules are installed by default in the `/mods` directory. 

## Building Applications

A tutorial series that will get you started building applications can be found in our list of [online developer tutorials](http://org.saito.tech/introduction-to-saito-development).

Details on the API used by Saito modules can be found in our [Applications documentation in the /docs directory](docs/applications.md).

Developers may also build applications that integrate directly with the blockchain-layer REST API described below. Tools to assist with this will be coming shortly.

## Installing Applications and Running:

Once you have developed an application, see our [online developer tutorials](http://org.saito.tech/introduction-to-saito-development) for information on how to publish it into the live network and get it hosted on the Saito AppStore for other users and developers to install.

If you wish to install your module locally for testing, put it into the `/mods` directory and add it to both the `core` and `lite` sections of your `/config/modules.config.js` file. Then run this command:

```
npm run compile dev
```

This command will compile the codebase into a javascript payload which can be delivered to browsers. The payload will saved as the `/web/saito/saito.js` file and can be loaded by any page you wish to author. As a convenience, the Saito Application/Module platform will automatically serve web requests if configured correctly, making it quite simple to get started making DAPPs in the browser.

-->

## Applications

There exist dozens of live [Web3 Saito applications](https://wiki.saito.io/en/applications) and modules that can be utilized and enjoyed, with no reliance on a central server.

We invite new users to start with **[Saito Arcade](https://wiki.saito.io/applications/arcade)**  and **[Red Square](https://wiki.saito.io/applications/redsquare)**, since they serve as hubs and integrate many other popular applications. We'd be remiss not to recommend a team and community favorite Saito Arcade Title, [*Twilight Struggle*](https://wiki.saito.io/applications/twilight).

A non-comprehensive list of other P2P applications:

- [*Saito Talk*](https://wiki.saito.io/applications/videocall) - P2P Video Call
- [*Saito Chat*](https://wiki.saito.io/applications/chat) - P2P, Encrypted
- [*Swarmcast*](https://wiki.saito.io/applications/swarmcast) - Medium-scale P2P livestreaming
- [*Fileshare*](https://wiki.saito.io/applications/fileshare) - Direct connect, serverless fileshare

...and much more, including a multi-currency crypto wallet, ZK-proofs and other useful Web3 utilities ready to be leveraged. The [module structure](https://wiki.saito.io/docs/modules) means these applications are easy to integrate within each other or new apps.

## APIs

See the complete directory of [API Documentation](https://wiki.saito.io/docs) on our wiki.

- [Module API](https://wiki.saito.io/docs/module-api)
- [Events API](https://wiki.saito.io/docs/events-api)
- [Services API](https://wiki.saito.io/docs/services-api)
- [Network API](https://wiki.saito.io/docs/network-api)

<!--
-   [REST API](docs/restapi.md)
-   [Application/Module Protocol](docs/applications.md)
-   [Application/Module Events Protocol](docs/events.md)
-   [Application/Module Context API](docs/appcontext.md)
-   [Services](docs/services.md)
-->
## Web3 Grant and Polkadot Integration

*The Saito Game Engine* is a recipient of a Web3 grant and features Polkadot integration for Web3 Gaming.

-   [Web3 Game Protocol and Engine Grant](https://github.com/w3f/Open-Grants-Program/blob/master/applications/saito-game-protocol-and-engine.md)
-   [Polkadot Integration](docs/polkadot.md)
