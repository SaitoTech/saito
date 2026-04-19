class MsgHandler {

static send_message_by_peer_id(peer_id, buffer) {
  return global.shared_methods.send_message_by_peer_id(peer_id, buffer);
}

    static send_message(public_key, buffer) {
        return global.shared_methods.send_message(public_key, buffer);
    }

    static send_message_to_all(buffer, exceptions) {
        return global.shared_methods.send_message_to_all(buffer, exceptions);
    }

    static connect_to_peer(url) {
        return global.shared_methods.connect_to_peer(url);
    }

    static write_value(key, value) {
        return global.shared_methods.write_value(key, value);
    }

    static append_value(key, value) {
        return global.shared_methods.append_value(key, value);
    }

    static flush_data(key) {
        return global.shared_methods.flush_data(key);
    }

    static ensure_directory_exists(path) {
        return global.shared_methods.ensure_directory_exists(path);
    }

    static read_value(key) {
        return global.shared_methods.read_value(key);
    }

    static load_block_file_list() {
        return global.shared_methods.load_block_file_list();
    }

    static is_existing_file(key) {
        return global.shared_methods.is_existing_file(key);
    }

    static remove_value(key) {
        return global.shared_methods.remove_value(key);
    }

    static disconnect_from_peer(peer_id) {
        return global.shared_methods.disconnect_from_peer(peer_id);
    }

    static fetch_block_from_peer(hash, peer_id, url, block_id) {
        return global.shared_methods.fetch_block_from_peer(hash, peer_id, url, block_id);
    }

    static process_api_call(buffer, msgIndex, peerIndex) {
        return global.shared_methods.process_api_call(buffer, msgIndex, peerIndex);
    }

    static process_api_success(buffer, msgIndex, peerIndex) {
        return global.shared_methods.process_api_success(
            buffer,
            msgIndex,
            peerIndex
        );
    }

    static process_api_error(buffer, msgIndex, peerIndex) {
        return global.shared_methods.process_api_error(buffer, msgIndex, peerIndex);
    }

    static send_interface_event(event, peerIndex, public_key) {
        return global.shared_methods.send_interface_event(event, peerIndex, public_key);
    }

    static save_wallet() {
        return global.shared_methods.save_wallet();
    }

    static load_wallet() {
        return global.shared_methods.load_wallet();
    }

    static save_blockchain() {
        return global.shared_methods.save_blockchain();
    }

    static load_blockchain() {
        return global.shared_methods.load_blockchain();
    }

    static get_my_services() {
        return global.shared_methods.get_my_services();
    }

    static send_block_success(hash, block_id) {
        return global.shared_methods.send_block_success(hash, block_id);
    }

    static send_wallet_update() {
        return global.shared_methods.send_wallet_update();
    }

    static send_new_version_alert(major, minor, patch, peerIndex) {
        return global.shared_methods.send_new_version_alert(
            major,
            minor,
            patch,
            peerIndex
        );
    }

    static send_new_chain_detected_event() {
        return global.shared_methods.send_new_chain_detected_event();
    }
}

export { MsgHandler };

if (typeof module !== "undefined") {
  module.exports = { MsgHandler };
}

//
// FEB 12, 2026 - above replaces this
// module.exports = exports = {MsgHandler};
//


// if (typeof exports === "undefined") {
//     module.exports = {MsgHandler};
// } else {
//     exports = {MsgHandler};
// }
// export {MsgHandler};
