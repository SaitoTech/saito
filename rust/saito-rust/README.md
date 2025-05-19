# Saito Rust Node

Saito Rust node is a rust application using the saito-core library to run a standalone saito node.

## Running a node

Following are the steps to run a saito rust node.

### Step 1: Clone the Repository

First, clone the Saito Rust workspace repository from GitHub using the following command:

```bash
git clone https://github.com/saitotech/saito-rust-workspace 
````

### Step 2: Initialize the Environment

Navigate to the cloned directory and run the bootstrap script to prepare your environment:

**For Linux**
Run the bootstrap_linux.sh script to prepare your Linux environment:

````bash
cd saito-rust-workspace
bash scripts/bootstrap_linux.sh
````

**For macOS**
If you are on a macOS device, use the bootstrap_mac.sh script instead:

````bash
cd saito-rust-workspace
bash scripts/bootstrap_mac.sh
````

#### Step 3: Run the Application

Finally, start the Saito application with Rust's cargo tool, enabling debug logging:

````bash
RUST_LOG=debug cargo run

````
