use saito_rust::network_controller::LOCAL_LISTENER_SOCKET_PATH;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Attempt to connect
    let mut stream = UnixStream::connect(LOCAL_LISTENER_SOCKET_PATH)
        .await
        .expect(
            format!(
                "cannot open local socket on : {:?}",
                LOCAL_LISTENER_SOCKET_PATH
            )
            .as_str(),
        );

    // Send a message
    stream
        .write_all(b"Hello from the console app!")
        .await
        .expect("write to socket failed");

    // Read response
    let mut res = vec![0u8; 1024];
    let n = stream
        .read(&mut res)
        .await
        .expect("read from socket failed");
    println!("Server says: {}", String::from_utf8_lossy(&res[..n]));

    Ok(())
}
