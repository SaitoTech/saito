#!/bin/bash

VERSION=$(cat ./VERSION | tr -d '\n')

echo "$VERSION"

update_cargo() {
    local cargo_file="$1"
    if [[ -f $cargo_file ]]; then
        OS=$(uname)
        if [[ "$OS" == "Darwin" ]]; then
            sed -i "" "s/^version = .*/version = \"$VERSION\"/" $cargo_file
        else
            sed -i "s/^version = .*/version = \"$VERSION\"/" $cargo_file
        fi
        echo "Updated version in $cargo_file"
    else
        echo "No Cargo.toml found in $(dirname $cargo_file)"
    fi
}


update_package_json() {
    local json_file="$1"
    if [[ -f $json_file ]]; then
        if jq .version "$json_file" > /dev/null 2>&1; then
            jq ".version = \"$VERSION\"" "$json_file" | sponge "$json_file"
        fi
    fi
}

update_saito_wasm_version_in_js() {
    local package_json_file="./saito-js/package.json"
    if [[ -f $package_json_file ]]; then
        second_version_number=$(echo $VERSION | cut -d'.' -f2)
        updated_version=$(jq ".dependencies.\"saito-wasm\" = \"$VERSION\"" $package_json_file)
        echo "$updated_version" > $package_json_file
    fi
}


members=("./saito-core" "./saito-wasm" "./saito-rust" "./saito-spammer" "./saito-js")

for member in "${members[@]}"; do
    echo "Checking $member..."

    update_cargo "$member/Cargo.toml"
    
    update_package_json "$member/package.json"
done

update_saito_wasm_version_in_js

echo "Version update complete!"
