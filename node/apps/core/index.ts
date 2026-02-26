import { Saito, parseLogLevel } from '../../lib/saito/app';
import { LogLevel } from 'saito-js/saito';
import saito_lib from '../../lib/saito/saito';

export type ArgType = {
  loglevel?: string;
};

export { Saito, LogLevel, parseLogLevel, saito_lib };
