#!/usr/bin/env bash

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
BASE_PATH="$SCRIPT_DIR/../saito-rust"

if [ -f "$BASE_PATH/../target/debug/saito-rust" ]; then
  exit 0
fi

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

linux_package_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "ok installed"
}

ask_permission() {
  while true; do
    read -p "$1 [Y/n]: " yn
    case $yn in
      [Yy]* | "" ) return 0;;  # Treat empty input as Yes
      [Nn]* ) echo "Aborting. The following installations were pending: ${missing_packages[*]}"
              exit 1;;
      * ) echo "Please answer yes (default) or no.";;
    esac
  done
}


missing_packages=()





sudo apt update

export PATH="$HOME/.cargo/bin:$PATH"
# Install Rust if not present
if ! command_exists rustc || ! command_exists cargo; then
  ask_permission "Rust is not installed. Install Rust?"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
    echo "Sourced $HOME/.cargo/env successfully."
  else
    echo "$HOME/.cargo/env does not exist. Attempting to directly update PATH."
  fi
  export PATH="$HOME/.cargo/bin:$PATH"
  echo "Updated PATH: $PATH"
  missing_packages=("${missing_packages[@]/Rust}")

else 
  echo "Rustup is already installed"
fi



for package in build-essential libssl-dev pkg-config nodejs npm clang gcc-multilib python-is-python3; do
  if ! command_exists $package && ! linux_package_installed $package; then
    missing_packages+=("$package")
  fi
done



if [ ${#missing_packages[@]} -ne 0 ]; then
  ask_permission "Install necessary packages (${missing_packages[*]})?"
  for package in "${missing_packages[@]}"; do
      sudo NEEDRESTART_MODE=a apt install -y $package || exit 1
       missing_packages=("${missing_packages[@]/$package}")
  done
else
  echo "All necessary packages are already installed."
fi



# Build project
ask_permission "Build Project?" && (
  cd "$BASE_PATH" || exit 1
  if cargo build; then
    echo "Setup completed successfully."
  else
    echo "Cargo build failed."
    exit 1
  fi
)
