const AdminServerConnection = require('../../../mods/admin/lib/server-connection');

function connectionFor(network, serverKey = 'SERVERKEY') {
  const mod = {
    app: {
      BROWSER: 1,
      options: {
        peers: [{ host: 'localhost', port: 12101, protocol: 'http' }]
      },
      network
    },
    server_publickey: serverKey,
    main: {
      adminkey_ui: {
        updateConnection() {}
      }
    }
  };
  mod.server_connection = new AdminServerConnection(mod);
  return mod.server_connection;
}

describe('Admin server connection', () => {
  test('an already connected server peer enables registration without waiting', async () => {
    jest.useFakeTimers();
    const connection = connectionFor({
      async getPeer(publicKey) {
        if (publicKey !== 'SERVERKEY') {
          throw new Error('peer not found');
        }
        return { publicKey };
      }
    });

    await connection.start();

    expect(connection.state).toBe('connected');
    jest.advanceTimersByTime(20000);
    expect(connection.state).toBe('connected');
    jest.useRealTimers();
  });

  test('a peer list entry counts when lookup by key fails', async () => {
    const connection = connectionFor({
      async getPeer() {
        throw new Error('peer not found');
      },
      async getPeers() {
        return [{ publicKey: 'OTHER' }, { publicKey: 'SERVERKEY' }];
      }
    });

    await connection.start();

    expect(connection.state).toBe('connected');
  });
});
