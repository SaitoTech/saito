#!/usr/bin/env bash

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
BASE_PATH="$SCRIPT_DIR/../saito-rust"

if [ -f "$BASE_PATH/../target/debug/saito-rust" ]; then
  exit 0
fi


command_exists() {
  command -v "$1" >/dev/null 2>&1
}


brew_package_installed() {
  brew list --formula | grep -q "^$1\$"
}


ask_permission() {
  while true; do
    read -p "$1 [Y/n]: " yn
    case $yn in
      [Yy]* | "" ) return 0;;  # Treat empty input as Yes
      [Nn]* ) echo "Aborting. The following installations were pending: ${missing_packages[*]}"
              exit 1;;
      * ) echo "Please answer yes or no.";;
    esac
  done
}



missing_packages=()
! command_exists brew && missing_packages+=("Homebrew")
! command_exists rustc && ! command_exists cargo && missing_packages+=("Rust")


if ! command_exists brew; then
  ask_permission "Homebrew is not installed. Install Homebrew?"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || exit 1
  missing_packages=("${missing_packages[@]/Homebrew}")
fi


# Install Rust if not present
if ! command_exists rustc || ! command_exists cargo; then
  ask_permission "Rust is not installed. Install Rust?"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y || exit 1
  source "$HOME/.cargo/env"
  missing_packages=("${missing_packages[@]/Rust}")

else 
  echo "Rustup is already installed"
fi


# Update Homebrew and install necessary packages
for package in llvm clang pkg-config node npm python3; do
  if ! command_exists $package && ! brew_package_installed $package; then
    missing_packages+=("$package")
  fi
done

if [ ${#missing_packages[@]} -gt 0 ]; then
  ask_permission "Some required packages are missing. Update Homebrew and install missing packages (${missing_packages[*]})?"
  brew update || exit 1
  for package in "${missing_packages[@]}"; do
    brew install $package || exit 1
    missing_packages=("${missing_packages[@]/$package}")
  done
else
  echo "All required packages are already installed."
fi



ask_permission "Build Project?" && (
  cd "$BASE_PATH" || exit 1
  if cargo build; then
    echo "Setup completed successfully."
  else
    echo "Cargo build failed."
    exit 1
  fi
)


