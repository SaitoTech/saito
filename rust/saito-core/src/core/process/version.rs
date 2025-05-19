use crate::core::util::serialize::Serialize;
use log::warn;
use std::cmp::Ordering;
use std::io::{Error, ErrorKind};

const VERSION_SIZE: u8 = 4;

pub fn read_pkg_version() -> Version {
    let v = env!("CARGO_PKG_VERSION");

    let tokens: Vec<&str> = v.split('.').collect();
    if tokens.len() != 3 {
        return Default::default();
    }

    let major = tokens[0].parse();
    let minor = tokens[1].parse();
    let patch = tokens[2].parse();

    if major.is_err() || minor.is_err() || patch.is_err() {
        return Default::default();
    }

    Version::new(major.unwrap(), minor.unwrap(), patch.unwrap())
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Version {
    pub major: u8,
    pub minor: u8,
    pub patch: u16,
}

impl Version {
    pub fn is_set(&self) -> bool {
        !(self.major == 0 && self.minor == 0 && self.patch == 0)
    }

    pub fn new(major: u8, minor: u8, patch: u16) -> Self {
        Version {
            major,
            minor,
            patch,
        }
    }

    /// Same minor version nodes should be able to work without any issues
    ///
    /// # Arguments
    ///
    /// * `version`:
    ///
    /// returns: bool
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn is_same_minor_version(&self, version: &Version) -> bool {
        self.is_set() && self.major == version.major && self.minor == version.minor
    }
}

impl Serialize<Self> for Version {
    fn serialize(&self) -> Vec<u8> {
        let mut v = [self.major, self.minor].to_vec();
        v.append(&mut self.patch.to_be_bytes().to_vec());
        v
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() < VERSION_SIZE as usize {
            warn!(
                "buffer size : {:?} cannot be parsed as a version",
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let ver = Version {
            major: *buffer.get(0).ok_or(Error::from(ErrorKind::InvalidInput))?,
            minor: *buffer.get(1).ok_or(Error::from(ErrorKind::InvalidInput))?,
            patch: u16::from_be_bytes([
                *buffer.get(2).ok_or(Error::from(ErrorKind::InvalidInput))?,
                *buffer.get(3).ok_or(Error::from(ErrorKind::InvalidInput))?,
            ]),
        };

        Ok(ver)
    }
}

impl Eq for Version {}

impl PartialEq<Self> for Version {
    fn eq(&self, other: &Self) -> bool {
        self.major == other.major && self.minor == other.minor && self.patch == other.patch
    }
}

impl PartialOrd<Self> for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        if self.major < other.major {
            return Some(Ordering::Less);
        } else if self.major > other.major {
            return Some(Ordering::Greater);
        }
        if self.minor < other.minor {
            return Some(Ordering::Less);
        } else if self.minor > other.minor {
            return Some(Ordering::Greater);
        }

        self.patch.partial_cmp(&other.patch)
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        self.partial_cmp(other).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use crate::core::process::version::{Version, VERSION_SIZE};
    use crate::core::util::serialize::Serialize;

    #[test]
    fn test_version_serialization() {
        let version = Version {
            major: 2,
            minor: 45,
            patch: 1243,
        };
        let buffer = version.serialize();
        assert_eq!(buffer.len(), VERSION_SIZE as usize);
        let version2 = Version::deserialize(&buffer)
            .expect("can't deserialize given buffer to version object");

        assert_eq!(version, version2);
    }
    #[test]
    fn test_version_compare() {
        assert!(
            Version {
                major: 10,
                minor: 20,
                patch: 30,
            } < Version {
                major: 10,
                minor: 30,
                patch: 20,
            }
        );
        assert!(
            Version {
                major: 10,
                minor: 20,
                patch: 30,
            } > Version {
                major: 10,
                minor: 10,
                patch: 30,
            }
        );
        assert!(
            Version {
                major: 10,
                minor: 20,
                patch: 30,
            } < Version {
                major: 10,
                minor: 20,
                patch: 40,
            }
        );

        assert!(Version::new(0, 1, 7).is_same_minor_version(&Version::new(0, 1, 10)));
        assert!(Version::new(0, 1, 7).is_same_minor_version(&Version::new(0, 1, 7)));
        assert!(!Version::new(0, 1, 7).is_same_minor_version(&Version::new(0, 2, 7)));
        assert!(!Version::new(0, 1, 7).is_same_minor_version(&Version::new(1, 1, 7)));
        assert!(!Version::new(0, 1, 7).is_same_minor_version(&Version::new(1, 0, 7)));
        assert!(!Version::new(0, 1, 7).is_same_minor_version(&Version::new(1, 0, 1)));
        assert!(!Version::new(0, 0, 0).is_same_minor_version(&Version::new(1, 0, 1)));
        assert!(!Version::new(0, 1, 7).is_same_minor_version(&Version::new(0, 0, 0)));
        assert!(!Version::new(0, 0, 0).is_same_minor_version(&Version::new(0, 0, 0)));
    }
}
