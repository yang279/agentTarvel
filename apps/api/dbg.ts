import { loadEnvFile } from 'node:process';
loadEnvFile();
import { AmapService } from './src/amap/amap.service';
import { createModel, callJson } from './src/agent/llm';
import { PLAN_SEARCH_PROMPT, GENERATE_PROMPT } from './src/agent/prompts';

async function main() {
  const model = createModel({ baseURL: process.env.OPENAI_BASE_URL ?? '', apiKey: process.env.OPENAI_API_KEY ?? '', model: process.env.OPENAI_MODEL ?? '' });
  const amap = new AmapService({ get: (k: string) => process.env[k] } as any);

  console.log('--- planSearch ---');
  let t = Date.now();
  try {
    const s = PLAN_SEARCH_PROMPT.replace('{destination}','杭州').replace('{days}','3').replace('{people}','1').replace('{interests}','不限').replace('{budget}','不限');
    const r = await callJson(model, s, '请生成搜索计划。');
    console.log('plan ok', Date.now()-t, 'ms', JSON.stringify(r));
  } catch(e){ console.log('plan ERR', Date.now()-t,'ms', (e as Error).message); }

  console.log('--- generate ---');
  t = Date.now();
  try {
    const pois = await amap.searchText('杭州 景点', '杭州', 6);
    const s = GENERATE_PROMPT.replace('{destination}','杭州').replace('{days}','3').replace('{people}','1').replace('{interests}','不限').replace('{budget}','不限').replace('{pois}', JSON.stringify(pois));
    const r = await callJson(model, s, '请生成行程。');
    console.log('generate ok', Date.now()-t, 'ms', 'days:', r?.days?.length);
  } catch(e){ console.log('generate ERR', Date.now()-t,'ms', (e as Error).message); }
}
main();
