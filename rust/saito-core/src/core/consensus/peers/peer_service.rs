use std::{fmt::Display, io::{Error, ErrorKind}};

use log::{error, warn};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerService {
    pub service: String,
    pub domain: String,
    pub name: String,
    // TODO: add versioning info here for application services for #622
}



impl TryFrom<String> for PeerService {
    type Error = std::io::Error;

    fn try_from(value: String) -> Result<PeerService, std::io::Error> {
        let values: Vec<&str> = value.split('|').collect();
        if values.len() != 3 {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let service = values[0].try_into();
        let domain = values[1].try_into();
        let name = values[2].try_into();
        if service.is_err() {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        if domain.is_err() {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        if name.is_err() {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        Ok(PeerService {
            service: service.unwrap(),
            domain: domain.unwrap(),
            name: name.unwrap(),
        })
    }
}

impl Into<String> for PeerService {
    fn into(self) -> String {
        self.service + "|" + self.domain.as_str() + "|" + self.name.as_str()
    }
}

impl PeerService {
    pub fn serialize_services(services: &Vec<PeerService>) -> Vec<u8> {
        if services.is_empty() {
            return vec![];
        }
        let str: String = services
            .iter()
            .map(|service| {
                let str: String = service.clone().into();
                str
            })
            .collect::<Vec<String>>()
            .join(";");
        str.as_bytes().to_vec()
    }
    pub fn deserialize_services(buffer: Vec<u8>) -> Result<Vec<PeerService>, Error> {
        if buffer.is_empty() {
            return Ok(vec![]);
        }
        let str = String::from_utf8(buffer);
        if str.is_err() {
            warn!("failed parsing services.");
            error!("{:?}", str.err().unwrap());
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let str = str.unwrap();
        let strings = str.split(";");
        let mut services: Vec<PeerService> = Default::default();
        for str in strings {
            if str.is_empty() {
                continue;
            }
            let result = str.try_into();
            if result.is_err() {
                warn!("cannot parse services from : {:?}", str);
                return Err(Error::from(ErrorKind::InvalidData));
            }
            let result: String = result.unwrap();
            let service = result.try_into();

            if service.is_err() {
                warn!("cannot parse services from : {:?}", str);
                return Err(Error::from(ErrorKind::InvalidData));
            }

            services.push(service.unwrap());
        }
        Ok(services)
    }
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::peers::peer_service::PeerService;

    #[test]
    fn test_serialize() {
        let mut services = vec![];
        services.push(PeerService {
            service: "service1".to_string(),
            domain: "domain1".to_string(),
            name: "name1".to_string(),
        });
        services.push(PeerService {
            service: "service2".to_string(),
            domain: "".to_string(),
            name: "name2".to_string(),
        });
        services.push(PeerService {
            service: "service3".to_string(),
            domain: "domain3".to_string(),
            name: "".to_string(),
        });
        services.push(PeerService {
            service: "service4".to_string(),
            domain: "".to_string(),
            name: "".to_string(),
        });

        let buffer = PeerService::serialize_services(&services);

        assert!(buffer.len() > 0);

        let result = PeerService::deserialize_services(buffer);
        assert!(result.is_ok());
        let services = result.unwrap();
        assert_eq!(services.len(), 4);

        let service = services.get(0).unwrap();
        assert_eq!(service.service, "service1");
        assert_eq!(service.domain, "domain1");
        assert_eq!(service.name, "name1");

        let service = services.get(1).unwrap();
        assert_eq!(service.service, "service2");
        assert_eq!(service.domain, "");
        assert_eq!(service.name, "name2");

        let service = services.get(2).unwrap();
        assert_eq!(service.service, "service3");
        assert_eq!(service.domain, "domain3");
        assert_eq!(service.name, "");

        let service = services.get(3).unwrap();
        assert_eq!(service.service, "service4");
        assert_eq!(service.domain, "");
        assert_eq!(service.name, "");
    }
}
