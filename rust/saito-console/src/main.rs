use saito_rust::network_controller::LOCAL_LISTENER_SOCKET_PATH;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use std::io::{self, Write};

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

    println!("Connected to server. Type 'exit' to quit.");

    loop {
        print!("> ");
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;

        let input = input.trim();

        if input.eq_ignore_ascii_case("exit") {
            break;
        }

        if input.is_empty() {
            continue;
        }

        // Send a message
        if let Err(e) = stream.write_all(input.as_bytes()).await {
            eprintln!("Failed to write to socket: {}", e);
            break;
        }

        // Read response
        let mut res = vec![0u8; 1024];
        match stream.read(&mut res).await {
            Ok(n) if n == 0 => {
                println!("Server closed connection");
                break;
            }
            Ok(n) => {
                println!("Server says: {}", String::from_utf8_lossy(&res[..n]));
            }
            Err(e) => {
                eprintln!("Failed to read from socket: {}", e);
                break;
            }
        }
    }

    Ok(())
}
