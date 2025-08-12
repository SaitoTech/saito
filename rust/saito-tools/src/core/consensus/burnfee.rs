use std::cmp::max;

use log::debug;

use crate::core::defs::{Currency, Timestamp};

//
// our target blocktime
// #[cfg(not(test))]
// pub const HEARTBEAT: Timestamp = Duration::from_secs(5).as_millis() as Timestamp;
//
// #[cfg(test)]
// pub const HEARTBEAT: Timestamp = Duration::from_millis(100).as_millis() as Timestamp;
//
// Burn Fee
//
// The burn fee algorithms determine how much ROUTING WORK needs to be in any block
// in order for that block to be valid according to consensus rules. There are two
// functions that are needed.
//
// - determine routing work needed (to produce block)
// - determine burnfee variable (to include in block)
//
// Both of these functions are
pub struct BurnFee {}

impl BurnFee {
    ///
    /// Returns the amount of work needed to produce a block given the timestamp of
    /// the previous block, the current timestamp, and the y-axis of the burn fee
    /// curve. This is used both in the creation of blocks (mempool) as well as
    /// during block validation.
    ///
    /// * `start` - burn fee value (y-axis) for curve determination ("start")
    /// * `current_block_timestamp`- candidate timestamp
    /// * `previous_block_timestamp` - timestamp of previous block
    ///
    pub fn return_routing_work_needed_to_produce_block_in_nolan(
        burn_fee_previous_block: Currency,
        current_block_timestamp_in_ms: Timestamp,
        previous_block_timestamp_in_ms: Timestamp,
        heartbeat: Timestamp,
    ) -> Currency {
        // impossible if times misordered
        //
        if previous_block_timestamp_in_ms >= current_block_timestamp_in_ms {
            return 10_000_000_000_000_000_000;
        }

        let elapsed_time = max(
            current_block_timestamp_in_ms - previous_block_timestamp_in_ms,
            1,
        );

        if elapsed_time >= (2 * heartbeat) {
            return 0;
        }

        // convert to float for division
        let elapsed_time_float = elapsed_time as f64;
        let burn_fee_previous_block_as_float: f64 = burn_fee_previous_block as f64 / 100_000_000.0;
        let work_needed_float: f64 = burn_fee_previous_block_as_float / elapsed_time_float;

        // convert back to nolan for rounding / safety
        (work_needed_float * 100_000_000.0).round() as Currency
    }

    /// Returns an adjusted burnfee based on the start value provided
    /// and the difference between the current block timestamp and the
    /// previous block timestamp
    ///
    /// * `start` - The starting burn fee
    /// * `current_block_timestamp` - The timestamp of the current `Block`
    /// * `previous_block_timestamp` - The timestamp of the previous `Block`
    ///
    pub fn calculate_burnfee_for_block(
        burn_fee_previous_block: Currency,
        current_block_timestamp_in_ms: Timestamp,
        previous_block_timestamp_in_ms: Timestamp,
        heartbeat: Timestamp,
    ) -> Currency {
        debug!("calculate burnfee : previous block burn fee = {:?} current timestamp = {:?} prev block timestamp : {:?}",
            burn_fee_previous_block, current_block_timestamp_in_ms, previous_block_timestamp_in_ms);
        // impossible if times misordered
        if previous_block_timestamp_in_ms >= current_block_timestamp_in_ms {
            return 10_000_000_000_000_000_000;
        }
        let timestamp_difference = max(
            1,
            current_block_timestamp_in_ms - previous_block_timestamp_in_ms,
        );

        // algorithm fails if burn fee last block is 0, so default to low value
        if burn_fee_previous_block == 0 {
            return 50_000_000;
        }

        let burn_fee_previous_block_as_float: f64 = burn_fee_previous_block as f64 / 100_000_000.0;

        let res0 = heartbeat as f64 / timestamp_difference as f64;
        let res1 = res0.sqrt();
        let res2: f64 = burn_fee_previous_block_as_float * res1;
        let new_burnfee: Currency = (res2 * 100_000_000.0).round() as Currency;

        new_burnfee
    }
}

#[cfg(test)]
mod tests {
    use crate::core::defs::Currency;

    use super::*;

    #[test]
    fn burnfee_return_work_needed_test() {
        // if our elapsed time is twice our heartbeat, return 0
        assert_eq!(
            BurnFee::return_routing_work_needed_to_produce_block_in_nolan(10, 2 * 2_000, 0, 1_000),
            0
        );

        // if their is no difference, the value should be the start value * 10^8
        assert_eq!(
            BurnFee::return_routing_work_needed_to_produce_block_in_nolan(
                10_0000_0000,
                0,
                0,
                1_000
            ),
            10_000_000_000_000_000_000,
        );
    }

    #[test]
    fn burnfee_burn_fee_adjustment_test() {
        // if the difference in timestamps is equal to HEARTBEAT, our start value should not change
        let mut new_start_burnfee =
            BurnFee::calculate_burnfee_for_block(100_000_000, 1_000, 0, 1_000);
        assert_eq!(new_start_burnfee, 100_000_000);

        // the difference should be the square root of HEARBEAT over the difference in timestamps
        new_start_burnfee = BurnFee::calculate_burnfee_for_block(100_000_000, 1_000 / 10, 0, 1_000);
        assert_eq!(
            new_start_burnfee,
            (100_000_000.0 * 10f64.sqrt()).round() as Currency
        );
    }

    #[test]
    fn burnfee_slr_match() {
        let burn_fee_previous_block = 50000000;
        let current_block_timestamp: Timestamp = 1658821423;
        let previous_block_timestamp: Timestamp = 1658821412;

        let burnfee = BurnFee::calculate_burnfee_for_block(
            burn_fee_previous_block,
            current_block_timestamp,
            previous_block_timestamp,
            100,
        );
        assert_eq!(burnfee, 150755672);
    }
}
