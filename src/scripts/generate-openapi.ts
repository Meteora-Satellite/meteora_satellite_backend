import { writeFileSync } from 'fs';
import { buildOpenApi } from '@common/openapi';
import { env } from "@config";
const doc = buildOpenApi({ title: 'Meteora Satellite API', version: '0.1.0', serverUrl: env.API_BASE });
writeFileSync('openapi.json', JSON.stringify(doc, null, 2));
console.log('openapi.json written');
