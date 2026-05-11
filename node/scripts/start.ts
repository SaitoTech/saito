import startServer from '../apps/server/index';
import process from 'process';

async function launchSaito() {
	const app = await startServer();
	function shutdownSaito() {
		console.log('Shutting down Saito');
		app.server.close();
		app.network.close();
	}

	/////////////////////
	// Cntl-C to Close //
	/////////////////////
	process.on('SIGTERM', function () {
		shutdownSaito();
		console.log('Network Shutdown');
		process.exit(0);
	});
	process.on('SIGINT', function () {
		shutdownSaito();
		console.log('Network Shutdown');
		process.exit(0);
	});
}

launchSaito().catch((e) => console.error(e));
