use serde::{Deserialize, Serialize};

use crate::core::defs::Timestamp;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Default, Deserialize)]
pub struct RateLimiter {
    /// Max allowed requests in the window
    limit: u64,
    window: Timestamp,            // Window duration in milliseconds
    requests_in_window: u64,      // Number of requests made in the current window
    total_count: u64,             // Total requests made
    last_request_time: Timestamp, // Timestamp of the last request in milliseconds
}

impl RateLimiter {
    pub fn set_limit(&mut self, limit: u64) {
        self.limit = limit;
    }

    pub fn set_window(&mut self, window: Timestamp) {
        self.window = window;
    }

    pub fn has_limit_exceeded(&mut self, current_time: Timestamp) -> bool {
        // TODO : current implementation allows twice the peers from spikes. a sliding window implementation would be better I think.
        if current_time.saturating_sub(self.last_request_time) > self.window {
            self.requests_in_window = 0;
            self.last_request_time = current_time;
        }
        self.requests_in_window >= self.limit
    }
    pub fn increase(&mut self) {
        self.requests_in_window += 1;
        self.total_count += 1;
    }

    pub fn new(count: u64, duration: Duration) -> Self {
        Self {
            limit: count,
            window: duration.as_millis() as Timestamp,
            requests_in_window: 0,
            last_request_time: 0,
            total_count: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_rate_limiter_test() {
        let rate_limiter = RateLimiter::new(10, Duration::from_secs(1));

        assert_eq!(rate_limiter.limit, 10);
        assert_eq!(rate_limiter.window, 1_000);
        assert_eq!(rate_limiter.requests_in_window, 0);
        assert_eq!(rate_limiter.last_request_time, 0);
    }

    #[test]
    fn set_limit_test() {
        let mut rate_limiter = RateLimiter::new(10, Duration::from_secs(1));
        rate_limiter.set_limit(5);

        assert_eq!(rate_limiter.limit, 5);
    }

    #[test]
    fn set_window_test() {
        let mut rate_limiter = RateLimiter::new(10, Duration::from_secs(1));
        rate_limiter.set_window(120_000); // 120 seconds

        assert_eq!(rate_limiter.window, 120_000);
    }

    #[test]
    fn can_make_request_within_limit_test() {
        let mut rate_limiter = RateLimiter::new(10, Duration::from_secs(1));
        let current_time = 10_000;
        rate_limiter.increase();
        assert_eq!(rate_limiter.requests_in_window, 1);
        assert!(!rate_limiter.has_limit_exceeded(current_time));
        assert_eq!(rate_limiter.requests_in_window, 0);
    }

    #[test]
    fn can_make_request_exceeding_limit_test() {
        let mut rate_limiter = RateLimiter::new(10, Duration::from_secs(1));
        let current_time = 10_000;
        for _ in 0..rate_limiter.limit {
            rate_limiter.increase();
            assert!(!rate_limiter.has_limit_exceeded(current_time));
        }
        rate_limiter.increase();
        assert!(rate_limiter.has_limit_exceeded(current_time));
        assert_eq!(rate_limiter.requests_in_window, rate_limiter.limit);
    }

    #[test]
    fn can_make_request_after_window_reset_test() {
        let mut rate_limiter = RateLimiter::new(10, Duration::from_secs(1));
        let current_time = 10_000;

        for _ in 0..rate_limiter.limit {
            rate_limiter.increase();
            assert!(!rate_limiter.has_limit_exceeded(current_time));
        }
        let new_time = current_time + rate_limiter.window + 1;
        rate_limiter.increase();
        assert!(!rate_limiter.has_limit_exceeded(new_time));
        assert_eq!(rate_limiter.requests_in_window, 0);
        assert_eq!(rate_limiter.last_request_time, new_time);
    }

    #[test]
    fn can_make_request_reset_on_new_time_test() {
        let mut rate_limiter = RateLimiter::new(10, Duration::from_secs(1));
        let initial_time = 10_000;

        for _ in 0..rate_limiter.limit {
            rate_limiter.increase();
            assert!(!rate_limiter.has_limit_exceeded(initial_time));
        }

        let later_time = initial_time + rate_limiter.window + 500;
        rate_limiter.increase();
        assert!(!rate_limiter.has_limit_exceeded(later_time));
        dbg!("{}", &rate_limiter);
        assert_eq!(rate_limiter.requests_in_window, 0);
        assert_eq!(rate_limiter.last_request_time, later_time);
    }
}
