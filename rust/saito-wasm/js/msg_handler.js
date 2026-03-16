class MsgHandler {
    static get bridge() {
        if (globalThis.__saito_wasm_bridge__) {
            return globalThis.__saito_wasm_bridge__;
        }

        if (globalThis.shared_methods) {
            return globalThis.shared_methods;
        }

        if (typeof global !== "undefined" && global.shared_methods) {
            return global.shared_methods;
        }

        throw new Error("saito wasm host bridge has not been installed");
    }

    static send_message(public_key, buffer) {
        return MsgHandler.bridge.send_message(public_key, buffer);
    }

    static send_message_to_all(buffer, exceptions) {
        return MsgHandler.bridge.send_message_to_all(buffer, exceptions);
    }

    static connect_to_peer(url, public_key) {
        return MsgHandler.bridge.connect_to_peer(url, public_key);
    }

    static write_value(key, value) {
        return MsgHandler.bridge.write_value(key, value);
    }

    static append_value(key, value) {
        return MsgHandler.bridge.append_value(key, value);
    }

    static flush_data(key) {
        return MsgHandler.bridge.flush_data(key);
    }

    static ensure_directory_exists(path) {
        return MsgHandler.bridge.ensure_directory_exists(path);
    }

    static read_value(key) {
        return MsgHandler.bridge.read_value(key);
    }

    static load_block_file_list() {
        return MsgHandler.bridge.load_block_file_list();
    }

    static is_existing_file(key) {
        return MsgHandler.bridge.is_existing_file(key);
    }

    static remove_value(key) {
        return MsgHandler.bridge.remove_value(key);
    }

    static disconnect_from_peer(public_key) {
        return MsgHandler.bridge.disconnect_from_peer(public_key);
    }

    static fetch_block_from_peer(hash, public_key, url, block_id) {
        return MsgHandler.bridge.fetch_block_from_peer(hash, public_key, url, block_id);
    }

    static process_api_call(buffer, msgIndex, peerIndex) {
        return MsgHandler.bridge.process_api_call(buffer, msgIndex, peerIndex);
    }

    static process_api_success(buffer, msgIndex, peerIndex) {
        return MsgHandler.bridge.process_api_success(
            buffer,
            msgIndex,
            peerIndex
        );
    }

    static process_api_error(buffer, msgIndex, peerIndex) {
        return MsgHandler.bridge.process_api_error(buffer, msgIndex, peerIndex);
    }

    static send_interface_event(event, peerIndex, public_key) {
        return MsgHandler.bridge.send_interface_event(event, peerIndex, public_key);
    }

    static send_block_fetch_status_event(count) {
        return MsgHandler.bridge.send_block_fetch_status_event(count);
    }

    static save_wallet() {
        return MsgHandler.bridge.save_wallet();
    }

    static load_wallet() {
        return MsgHandler.bridge.load_wallet();
    }

    static save_blockchain() {
        return MsgHandler.bridge.save_blockchain();
    }

    static load_blockchain() {
        return MsgHandler.bridge.load_blockchain();
    }

    static get_my_services() {
        return MsgHandler.bridge.get_my_services();
    }

    static send_block_success(hash, block_id) {
        return MsgHandler.bridge.send_block_success(hash, block_id);
    }

    static send_wallet_update() {
        return MsgHandler.bridge.send_wallet_update();
    }

    static send_new_version_alert(major, minor, patch, peerIndex) {
        return MsgHandler.bridge.send_new_version_alert(
            major,
            minor,
            patch,
            peerIndex
        );
    }

    static send_new_chain_detected_event() {
        return MsgHandler.bridge.send_new_chain_detected_event();
    }
}

// export { MsgHandler };
//
// if (typeof module !== "undefined") {
//   module.exports = { MsgHandler };
// }

//
// FEB 12, 2026 - above replaces this
module.exports = exports = {MsgHandler};
//


// if (typeof exports === "undefined") {
//     module.exports = {MsgHandler};
// } else {
//     exports = {MsgHandler};
// }
// export {MsgHandler};
