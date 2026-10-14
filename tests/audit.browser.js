// Isolated dev browser only. No real credentials, submissions or filesystem writes.
// playwright-cli -s=rh-audit open http://127.0.0.1:5178
// playwright-cli -s=rh-audit run-code --filename tests/audit.browser.js
async page => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('rh_terms_agreed', 'true');
    localStorage.setItem('rh_startup_view', 'workspace');
    localStorage.setItem('rh_runninghub_region_mode', 'cn');
    localStorage.setItem('rh_save_api_enabled', 'true');
    localStorage.setItem('rh_enterprise_api_v1', JSON.stringify({ id: 'enterprise', apiKey: 'enterprise', concurrency: 2 }));
    localStorage.setItem('rh_api_keys_v2', JSON.stringify([{ id: 'consumer', apiKey: 'consumer', concurrency: 1 }]));
    window.auditMock = { submissions: [], done: {}, queries: 0, limit: 2, pendingInfo: [], deferInfo: false, withImage: false, uploads: [], pendingUploads: [], deferUploads: false, sounds: [] };
    window.Audio = class { constructor(src) { this.src = src; } async play() { window.auditMock.sounds.push(this.src); } };
    window.showOpenFilePicker = async () => ['one.png', 'two.png'].map(name => ({ getFile: async () => new File(['test'], name, { type: 'image/png' }) }));
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      const mock = window.auditMock;
      const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname.endsWith('/models_registry.json')) return json([{ endpoint: 'mock/model', display_name: '测试标准模型', output_type: 'image', params: [{ fieldKey: 'prompt', type: 'STRING', defaultValue: 'model default' }] }]);
      if (!url.hostname.includes('runninghub.')) return realFetch(input, init);
      if (url.pathname.endsWith('/queue/status') || url.pathname.endsWith('/accountStatus')) {
        if (mock.deferInfo) await new Promise(resolve => mock.pendingInfo.push(resolve));
        if (url.pathname.endsWith('/accountStatus')) return json({ code: 0, data: { remainCoins: '100', currentTaskCounts: '0', apiType: 'NORMAL' } });
        return json({ code: 0, data: { concurrentLimit: mock.limit, runningCount: String(mock.submissions.filter(task => !mock.done[task.taskId]).length), queuedCount: '0' } });
      }
      if (url.pathname.endsWith('/apiCallDemo')) return json({ code: 0, data: { webappName: `应用 ${url.searchParams.get('webappId')}`, nodeInfoList: [
        { nodeId: '1', fieldName: 'prompt', nodeName: '提示词', fieldType: 'STRING', fieldValue: 'app default' },
        ...(mock.withImage ? [{ nodeId: '2', fieldName: 'image', nodeName: '图像', fieldType: 'IMAGE', fieldValue: '' }] : [])
      ] } });
      if (url.pathname.endsWith('/media/upload/binary')) {
        const file = init.body.get('file');
        mock.uploads.push(file.name);
        if (mock.deferUploads) await new Promise(resolve => mock.pendingUploads.push(resolve));
        return json({ code: 0, data: { fileName: `uploaded/${file.name}` } });
      }
      if (url.pathname.includes('/price-preview/')) return json({ estimatedPrice: 1, currency: 'CNY' });
      if (url.pathname.endsWith('/mock/model') || url.pathname.endsWith('/ai-app/run')) {
        const taskId = `task-${mock.submissions.length + 1}`;
        mock.submissions.push({ taskId, payload: JSON.parse(init.body) });
        return url.pathname.endsWith('/ai-app/run')
          ? json({ code: 0, data: { taskId, taskStatus: 'RUNNING' } })
          : json({ taskId, status: 'RUNNING' });
      }
      if (url.pathname.endsWith('/v2/query')) {
        mock.queries++;
        const { taskId } = JSON.parse(init.body);
        return json({ taskId, status: mock.done[taskId] ? 'SUCCESS' : 'RUNNING', results: [] });
      }
      if (url.pathname.endsWith('/outputs')) return json({ code: 0, data: [] });
      throw new Error(`Unexpected request: ${url.pathname}`);
    };
  });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  const test = async (name, fn) => {
    await page.reload();
    try { await fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  };
  const prepareModel = async () => {
    await page.getByRole('button', { name: '获取模型', exact: true }).click();
    await page.getByRole('button', { name: '获取参数', exact: true }).click();
    await page.getByPlaceholder('请输入文本...').waitFor();
  };
  const startModel = async () => {
    await prepareModel();
    await page.getByRole('button', { name: /^运行/ }).click();
    await page.waitForFunction(() => window.auditMock.submissions.length === 1);
  };
  await test('standard task survives navigation without resubmission', async () => {
    await startModel();
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '交流与支持', exact: true }).waitFor();
    await page.getByRole('button', { name: '标准模型 API', exact: true }).click();
    await page.getByPlaceholder('请输入文本...').waitFor();
    await page.waitForTimeout(400);
    check(await page.evaluate(() => window.auditMock.submissions.length) === 1, 'navigation submitted the same paid task again');
    await page.evaluate(() => { window.auditMock.done['task-1'] = true; });
    await page.getByRole('button', { name: '查看结果', exact: true }).waitFor({ timeout: 7000 });
    await page.getByRole('button', { name: '查看结果', exact: true }).click();
    await page.getByRole('button', { name: '历史记录', exact: true }).waitFor();
  });
  await test('continued submissions respect account capacity', async () => {
    await page.evaluate(() => { window.auditMock.limit = 1; });
    await startModel();
    await page.getByRole('button', { name: /^继续提交/ }).click();
    await page.waitForTimeout(400);
    check(await page.evaluate(() => window.auditMock.submissions.length) === 1, 'continued submission exceeded account concurrency');
    await page.evaluate(() => { window.auditMock.done['task-1'] = true; });
    await page.waitForFunction(() => window.auditMock.submissions.length === 2, { timeout: 12000 });
  });
  await test('stop tracking cancels queued submissions and polling', async () => {
    await page.evaluate(() => { window.auditMock.limit = 1; });
    await startModel();
    await page.getByRole('button', { name: /^继续提交/ }).click();
    await page.getByRole('button', { name: '停止追踪', exact: true }).click({ timeout: 1500 });
    await page.evaluate(() => { window.auditMock.done['task-1'] = true; });
    await page.waitForTimeout(4200);
    check(await page.evaluate(() => window.auditMock.submissions.length) === 1, 'cancelled queued task was submitted');
    const queries = await page.evaluate(() => window.auditMock.queries);
    await page.waitForTimeout(4000);
    check(await page.evaluate(() => window.auditMock.queries) === queries, 'polling continued after cancellation');
  });
  await test('editing an app ID invalidates old parameters', async () => {
    await page.getByRole('button', { name: '多任务模式', exact: true }).click();
    const input = page.getByPlaceholder('请输入 WebApp ID，或粘贴应用详情页链接');
    await input.fill('111');
    await page.getByRole('button', { name: '加载', exact: true }).click();
    await page.getByPlaceholder('请输入文本...').waitFor();
    await input.fill('222');
    check(await page.getByRole('button', { name: '运行', exact: true }).isDisabled(), 'new app ID can run with the previous app parameters');
    await page.getByRole('button', { name: '加载', exact: true }).click();
    await page.getByRole('heading', { name: '应用 222', exact: true }).waitFor();
  });
  await test('API refresh does not undo edits or resurrect removed entries', async () => {
    await page.getByRole('button', { name: '个人中心', exact: true }).click();
    await page.evaluate(() => { window.auditMock.deferInfo = true; });
    await page.getByRole('button', { name: '获取信息', exact: true }).nth(1).click();
    await page.waitForFunction(() => window.auditMock.pendingInfo.length === 2);
    await page.getByPlaceholder('填写消费级 API KEY').fill('edited-key');
    await page.getByRole('button', { name: '新增消费 API', exact: true }).click();
    await page.evaluate(() => { window.auditMock.deferInfo = false; window.auditMock.pendingInfo.forEach(resolve => resolve()); });
    await page.waitForTimeout(200);
    check(await page.getByPlaceholder('填写消费级 API KEY').count() === 2, 'API refresh discarded a newly added entry');
    check(await page.getByPlaceholder('填写消费级 API KEY').first().inputValue() === 'edited-key', 'API refresh restored an old key');
  });
  await test('batch copies retain pending files, drafts reject missing files, reload resets batches, reminder plays once', async () => {
    await page.evaluate(() => {
      window.auditMock.withImage = true;
      localStorage.setItem('rh_batch_reminder_enabled', 'true');
      localStorage.setItem('rh_batch_reminder_audio', 'test.wav');
    });
    await page.getByRole('button', { name: '多任务模式', exact: true }).click();
    await page.getByPlaceholder('请输入 WebApp ID，或粘贴应用详情页链接').fill('111');
    await page.getByRole('button', { name: '加载', exact: true }).click();
    await page.getByRole('button', { name: '批量设置', exact: true }).click();
    await page.getByTitle('按选择顺序批量导入图片', { exact: true }).click();
    await page.getByRole('button', { name: '保存设置 (2)', exact: true }).click();
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await page.getByText('草稿无法保存尚未上传的本地文件，请先上传文件或移除对应的批量文件后再保存。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '复制卡片', exact: true }).click();
    await page.getByRole('button', { name: '批量运行', exact: true }).nth(1).click();
    await page.waitForFunction(() => window.auditMock.submissions.length === 2);
    check(await page.evaluate(() => window.auditMock.uploads.length) === 2, 'copy lost pending file data');
    check(await page.evaluate(() => window.auditMock.submissions.every(task => task.payload.nodeInfoList[1].fieldValue.startsWith('uploaded/'))), 'batch submitted local filenames instead of uploaded files');
    await page.evaluate(() => window.auditMock.submissions.forEach(task => { window.auditMock.done[task.taskId] = true; }));
    await page.getByRole('button', { name: '全部运行', exact: true }).waitFor();
    check(await page.evaluate(() => window.auditMock.sounds.length) === 1, 'batch completion reminder missing or repeated');
    await page.getByPlaceholder('请输入 WebApp ID，或粘贴应用详情页链接').first().fill('222');
    await page.getByRole('button', { name: '加载', exact: true }).first().click();
    await page.getByRole('button', { name: '批量设置', exact: true }).first().click();
    await page.getByRole('button', { name: '保存设置 (1)', exact: true }).waitFor();
  });
  await test('late uploads cannot overwrite a newly loaded app with identical fields', async () => {
    await page.evaluate(() => { window.auditMock.withImage = true; window.auditMock.deferUploads = true; });
    await page.getByRole('button', { name: '多任务模式', exact: true }).click();
    const input = page.getByPlaceholder('请输入 WebApp ID，或粘贴应用详情页链接');
    await input.fill('111');
    await page.getByRole('button', { name: '加载', exact: true }).click();
    await page.getByPlaceholder('请输入文本...').waitFor();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: 'old.png', mimeType: 'image/png', buffer: Buffer.from('test') });
    await page.waitForFunction(() => window.auditMock.pendingUploads.length === 1);
    await input.fill('222');
    await page.getByRole('button', { name: '加载', exact: true }).click();
    await page.getByRole('heading', { name: '应用 222', exact: true }).waitFor();
    await page.evaluate(() => { window.auditMock.deferUploads = false; window.auditMock.pendingUploads.forEach(resolve => resolve()); });
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: '运行', exact: true }).click();
    await page.waitForFunction(() => window.auditMock.submissions.length === 1);
    check(await page.evaluate(() => window.auditMock.submissions[0].payload.nodeInfoList[1].fieldValue) === '', 'old upload polluted the new app');
  });
  const failed = results.filter(result => !result.passed);
  if (failed.length) throw new Error(JSON.stringify(results, null, 2));
  return results;
}
