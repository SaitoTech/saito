from pathlib import Path

from saito_python import ClientConfig, NodeConfig, PeerConfig


def test_client_config_serializes_peer_and_extra_fields() -> None:
    config = ClientConfig(
        data_dir=Path("/tmp/client"),
        haste_multiplier=3,
        delete_old_blocks=True,
        peers=[PeerConfig(url="http://peer-1", public_key="peer-key")],
        extra={"network": "testnet"},
    )

    engine_config = config.to_engine_config()

    assert engine_config["data_dir"] == "/tmp/client"
    assert engine_config["haste_multiplier"] == 3
    assert engine_config["delete_old_blocks"] is True
    assert engine_config["peers"] == [{"url": "http://peer-1", "public_key": "peer-key"}]
    assert engine_config["network"] == "testnet"


def test_node_config_serializes_server_shape() -> None:
    config = NodeConfig(
        data_dir=Path("/tmp/node"),
        host="0.0.0.0",
        port=13500,
        endpoint_host="node.example.com",
        endpoint_port=14500,
        spv_mode=True,
    )

    engine_config = config.to_engine_config()

    assert engine_config["server"]["host"] == "0.0.0.0"
    assert engine_config["server"]["port"] == 13500
    assert engine_config["server"]["endpoint"]["host"] == "node.example.com"
    assert engine_config["server"]["endpoint"]["port"] == 14500
    assert engine_config["spv_mode"] is True
