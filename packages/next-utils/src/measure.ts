import { createMeasurer } from '@kirill.konshin/utils';
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';

export const isProd = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NEXT_PHASE === PHASE_PRODUCTION_SERVER;

export const measurer = createMeasurer({ colors: isProd });
