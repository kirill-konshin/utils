import { measure } from '@kirill.konshin/utils';
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';

const isProd = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NEXT_PHASE === PHASE_PRODUCTION_SERVER;

export default measure.createMeasurer({ colors: isProd });
