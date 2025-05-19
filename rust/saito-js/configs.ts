type Configs = {
    server: {
        host: string;
        port: number;
        protocol: string;
        endpoint: {
            host: string;
            port: number;
            protocol: string;
        };
        verification_threads: number;
        channel_size: number;
        stat_timer_in_ms: number;
        reconnection_wait_time: number;
        thread_sleep_time_in_ms: number;
        block_fetch_batch_size: number;
    };
    peers: {
        host: string;
        port: number;
        protocol: string;
        synctype: string;
    }[];
    spv_mode: boolean;
    browser_mode: boolean;
    consensus: {
        genesis_period: number,
        heartbeat_interval: number,
        prune_after_blocks: number,
        max_staker_recursions: number,
    }
};

export default Configs;
