// Run against an isolated local dev browser; all RunningHub requests are mocked.
// playwright-cli -s=rh-store-test open http://127.0.0.1:5178
// playwright-cli -s=rh-store-test run-code --filename tests/store-use.browser.js
async page => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.setViewportSize({ width: 1800, height: 1100 });
  await page.evaluate(() => sessionStorage.removeItem('rh_store_test_initialized'));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('rh_store_test_initialized')) {
      localStorage.clear();
      localStorage.setItem('rh_terms_agreed', 'true');
      localStorage.setItem('rh_startup_view', 'home');
      localStorage.setItem('rh_home_default_tab', 'official');
      localStorage.setItem('rh_runninghub_region_mode', 'cn');
      localStorage.setItem('rh_api_keys_v2', JSON.stringify([{ id: 'test', apiKey: 'test-app-key', concurrency: 1 }]));
      localStorage.setItem('rh_favorites', JSON.stringify([
        { webappId: '333', name: '缓存收藏', appInfo: { webappName: '缓存收藏' }, nodes: [
          { nodeId: '1', nodeName: '提示词', fieldName: 'prompt', fieldType: 'STRING', fieldValue: 'cached default' }
        ] },
        { webappId: '444', name: '未缓存收藏' }
      ]));
      sessionStorage.setItem('rh_store_test_initialized', 'true');
    }
    window.rhStoreMock = { loads: [], submissions: [], failNext: false };
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.hostname.includes('runninghub.')) return realFetch(input, init);
      const mock = window.rhStoreMock;
      let data;
      if (url.pathname.endsWith('/webapp/list')) {
        data = { code: 0, data: { total: '2', records: [
          { id: '111', name: '商城应用一' }, { id: '222', name: '商城应用二' }
        ] } };
      } else if (url.pathname.endsWith('/apiCallDemo')) {
        const appId = url.searchParams.get('webappId');
        mock.loads.push({ appId, key: url.searchParams.get('apiKey') });
        if (mock.failNext) {
          mock.failNext = false;
          return new Response(JSON.stringify({ code: 500, msg: 'mock load failed' }));
        }
        data = { code: 0, data: { webappName: `已加载应用 ${appId}`, nodeInfoList: [
          { nodeId: '1', nodeName: '提示词', fieldName: 'prompt', fieldType: 'STRING', fieldValue: `default ${appId}` },
          { nodeId: '2', nodeName: '步数', fieldName: 'steps', fieldType: 'INT', fieldValue: 20 },
          { nodeId: '3', nodeName: '尺寸', fieldName: 'size', fieldType: 'COMBO', fieldValue: 'large', fieldData: ['COMBO', { options: ['small', 'large'] }] },
          { nodeId: '4', nodeName: '启用', fieldName: 'enabled', fieldType: 'BOOLEAN', fieldValue: true }
        ] } };
      } else if (url.pathname.endsWith('/queue/status')) {
        data = { code: 0, data: { concurrentLimit: 1, runningCount: '0', queuedCount: '0', totalCurrentTasks: '0' } };
      } else if (url.pathname.endsWith('/ai-app/run')) {
        mock.submissions.push(JSON.parse(init.body));
        data = { code: 0, data: { taskId: 'mock-task', taskStatus: 'RUNNING' } };
      } else if (url.pathname.endsWith('/v2/query')) {
        data = { taskId: 'mock-task', status: 'RUNNING', results: [] };
      } else {
        throw new Error(`Unexpected RunningHub request: ${url.pathname}`);
      }
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    };
  });
  await page.reload();
  const useStoreApp = async index => {
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '立即使用', exact: true }).nth(index).click();
    await page.getByRole('heading', { name: '多任务模式', exact: true }).waitFor();
  };
  const cardInputs = () => page.getByPlaceholder('请输入 WebApp ID，或粘贴应用详情页链接');
  const prompts = () => page.getByPlaceholder('请输入文本...');

  // A store click replaces the initial placeholder and loads every default field.
  await useStoreApp(0);
  await page.getByRole('heading', { name: '已加载应用 111', exact: true }).waitFor();
  check(await cardInputs().count() === 1, 'first store click left an extra blank card');
  check(await cardInputs().inputValue() === '111', 'wrong app ID');
  check(await prompts().inputValue() === 'default 111', 'text default missing');
  check(await page.locator('input[type="number"]:visible').inputValue() === '20', 'numeric default missing');
  check(await page.getByRole('combobox').inputValue() === 'large', 'list default missing');
  check(await page.getByRole('switch').getAttribute('aria-checked') === 'true', 'boolean default missing');
  check(await page.evaluate(() => window.rhStoreMock.loads[0].key) === 'test-app-key', 'wrong API key source');
  check(await page.evaluate(() => window.rhStoreMock.submissions.length) === 0, 'Use Now submitted a paid task automatically');

  // Leaving and returning must not create another card or lose user edits.
  await prompts().fill('keep my edits');
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await page.getByRole('button', { name: '多任务模式', exact: true }).click();
  check(await cardInputs().count() === 1, 'navigation replayed the store click');
  check(await prompts().inputValue() === 'keep my edits', 'navigation lost edited parameters');

  // New store cards must coexist with an already running card.
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await page.waitForFunction(() => window.rhStoreMock.submissions.length === 1);
  check(await page.evaluate(() => window.rhStoreMock.submissions[0].nodeInfoList[0].fieldValue) === 'keep my edits', 'edited parameters were not submitted');
  await useStoreApp(1);
  await page.getByRole('heading', { name: '已加载应用 222', exact: true }).waitFor();
  check(await cardInputs().count() === 2, 'second app replaced an existing card');
  check(await prompts().first().inputValue() === 'keep my edits', 'new app reset the existing card');
  check(await page.getByRole('button', { name: '取消运行', exact: true }).count() === 1, 'new app stopped the running card');
  await page.getByRole('button', { name: '取消运行', exact: true }).click();
  await page.getByRole('button', { name: '全部运行', exact: true }).waitFor();

  // A deliberate second click on the same app creates an independent card.
  await useStoreApp(0);
  await prompts().nth(2).waitFor();
  check(await cardInputs().count() === 3, 'repeat app click was ignored or duplicated');
  check(await prompts().nth(2).inputValue() === 'default 111', 'repeat click reused edited parameters');

  // Both cached and uncached favorites use the same task-card destination.
  for (const [index, expected] of [[0, 'cached default'], [1, 'default 444']]) {
    await page.getByRole('button', { name: '标准模型 API', exact: true }).click();
    await page.getByRole('button', { name: '我的收藏', exact: true }).click();
    await page.getByRole('button', { name: '立即使用', exact: true }).nth(index).click();
    await page.getByRole('heading', { name: '多任务模式', exact: true }).waitFor();
    await prompts().nth(3 + index).waitFor();
    check(await prompts().nth(3 + index).inputValue() === expected, 'favorite parameters missing');
  }
  check(await page.evaluate(() => window.rhStoreMock.loads.filter(item => item.appId === '333').length) === 0, 'cached favorite fetched unnecessarily');
  check(await cardInputs().count() === 5, 'favorite click created the wrong number of cards');

  // Loading errors stay on the new card and support retry without duplication.
  await page.evaluate(() => { window.rhStoreMock.failNext = true; });
  await useStoreApp(1);
  await page.getByText('mock load failed', { exact: true }).waitFor();
  check(await cardInputs().count() === 6, 'failed load lost its card');
  await page.getByRole('button', { name: '加载', exact: true }).last().click();
  await prompts().nth(5).waitFor();
  check(await prompts().nth(5).inputValue() === 'default 222', 'retry did not load defaults');
  check(await cardInputs().count() === 6, 'retry created another card');

  // Missing credentials produce an actionable card error, not an empty Model API view.
  await page.evaluate(() => localStorage.removeItem('rh_api_keys_v2'));
  await page.reload();
  await useStoreApp(0);
  await page.getByText('请先配置 API Key 并填写 WebApp ID', { exact: true }).waitFor();
  check(await cardInputs().inputValue() === '111', 'missing credentials lost the selected app');
  check(await page.evaluate(() => window.rhStoreMock.loads.length) === 0, 'app loading sent empty credentials');
  console.log('PASS: store routing, parameter defaults, navigation, running-card preservation, repeated clicks, cached/uncached favorites, retry, missing API key');
}
