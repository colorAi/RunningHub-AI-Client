import { isCapacityLimitedError } from '../../services/api';
import { createApiCapacityManagers } from '../../services/apiCapacity';
import { executeWorkflowTask, TaskCancelledError } from '../../services/taskExecutor';
import type { MultiTaskCardData } from './cardTypes';
import type { StepEditorSnapshot } from '../StepEditor';
import type { AutoSaveConfig, InstanceType, NodeInfo, PendingFilesMap } from '../../types';
import type { useRunHistory } from './history/useRunHistory';
import type { useMultiTaskWorkspace } from './useMultiTaskWorkspace';
import { isCardCancelled, registerCardConnection } from './schedulerConnections';
import { RunUnit, SessionState, createEmptyRunState, cloneNodes, cloneNodeRows, timestampLog, mergeUsage } from './workspaceModel';

export function useMultiTaskScheduler(workspace: ReturnType<typeof useMultiTaskWorkspace>, history: ReturnType<typeof useRunHistory>, autoSaveConfig: AutoSaveConfig) {
  const { cards, setCards, setSessionActive, setSessionNotice, editorRefs, manualSnapshotsRef, sessionRef, apiConfigs, totalConfiguredSlots, updateCard, appendCardLog } = workspace;
  const finishUnit = (session: SessionState, cardId: string) => {
    const remaining = Math.max(0, (session.remainingUnits.get(cardId) || 1) - 1);
    session.remainingUnits.set(cardId, remaining);
    if (remaining === 0) {
      session.runningCardIds.delete(cardId);
      session.connections.delete(cardId);
      setCards(prev => [...prev]);
    }
  };

  const stopTrackingCard = (cardId: string) => {
    const session = sessionRef.current;
    if (!session) return;

    history.controller.stopCard(cardId);
    session.cancelledCards.add(cardId);
    // Remove unsent units even when every API slot is occupied elsewhere.
    for (let i = session.pendingUnits.length - 1; i >= 0; i -= 1) {
      if (session.pendingUnits[i].cardId === cardId) {
        session.pendingUnits.splice(i, 1);
        finishUnit(session, cardId);
      }
    }
    session.wake?.();
    session.connections.get(cardId)?.forEach(close => close());

    updateCard(cardId, card => ({
      ...card,
      run: {
        ...card.run,
        status: 'cancelled',
        progressText: '已停止追踪，服务端已提交的任务可能仍在运行',
        activeUnits: 0,
      },
    }));
  };

  const stopAllTracking = () => {
    const session = sessionRef.current;
    if (!session) return;

    history.controller.stopAll();
    session.cancelled = true;
    session.wake?.();
    session.connections.forEach(closers => closers.forEach(close => close()));
    setSessionNotice('已停止当前调度的追踪，服务端已提交的任务可能仍在运行。');

    setCards(prev =>
      prev.map(card =>
        session.runningCardIds.has(card.id)
          ? {
              ...card,
              run: {
                ...card.run,
                status: 'cancelled',
                progressText: '已停止追踪，服务端已提交的任务可能仍在运行',
                activeUnits: 0,
              },
            }
          : card,
      ),
    );
  };

  const buildUnitsFromSnapshot = (card: MultiTaskCardData, snapshot: StepEditorSnapshot): RunUnit[] => {
    const batchList = snapshot.batchList.length > 0 ? snapshot.batchList.map(cloneNodes) : [];
    const nodes = cloneNodes(snapshot.nodes);
    const totalUnits = batchList.length > 0 ? batchList.length : 1;
    const taskGroups = batchList.length > 0 ? batchList : [nodes];

    const runId = history.controller.start({ cardId: card.id, appId: card.webappId,
      appName: card.webAppInfo?.webappName || card.webappId, batchName: snapshot.batchTaskName || '' }, totalUnits);
    return taskGroups.map((group, index) => ({
      runId,
      cardId: card.id,
      unitIndex: index,
      totalUnits,
      webappId: card.webappId,
      nodes: cloneNodes(group),
      pendingFiles: { ...snapshot.pendingFiles },
      batchTaskName: snapshot.batchTaskName,
      instanceType: snapshot.instanceType,
      runOptions: { ...card.runOptions },
    }));
  };

  const collectRunnableCards = (cardIds?: string[]) => {
    const targetIds = new Set(cardIds ?? cards.map(card => card.id));
    const runnable: { card: MultiTaskCardData; snapshot: StepEditorSnapshot }[] = [];

    cards.forEach(card => {
      if (!targetIds.has(card.id) || sessionRef.current?.runningCardIds.has(card.id) || card.loading) return;

      const snapshot = manualSnapshotsRef.current[card.id] || editorRefs.current[card.id]?.getSnapshot();
      if (!snapshot) return;
      if (!card.isConnected || !card.webappId.trim() || snapshot.nodes.length === 0) return;
      if (snapshot.hasUploadingFiles) {
        appendCardLog(card.id, '仍有文件上传中，已跳过本次调度');
        return;
      }

      runnable.push({ card, snapshot });
    });

    return runnable;
  };

  const startScheduler = async (targetCardIds?: string[]) => {
    if (sessionRef.current?.cancelled) {
      setSessionNotice('正在停止当前调度，请稍后再提交。');
      return;
    }

    if (apiConfigs.length === 0) {
      setSessionNotice('当前没有可用的 API Key，无法启动多任务调度。');
      return;
    }

    const runnableCards = collectRunnableCards(targetCardIds);
    if (runnableCards.length === 0) {
      setSessionNotice('没有可运行的卡片，请先加载应用并确认参数。');
      return;
    }

    const units = runnableCards.flatMap(({ card, snapshot }) => buildUnitsFromSnapshot(card, snapshot));
    if (units.length === 0) {
      setSessionNotice('当前卡片没有可执行的任务单元。');
      return;
    }

    runnableCards.forEach(({ card }) => {
      delete manualSnapshotsRef.current[card.id];
    });

    const existingSession = sessionRef.current;
    const session: SessionState = existingSession || {
      id: crypto.randomUUID(),
      runningCardIds: new Set(),
      cancelled: false,
      cancelledCards: new Set(),
      connections: new Map(),
      pendingUnits: [],
      remainingUnits: new Map(),
    };

    units.forEach(unit => {
      session.runningCardIds.add(unit.cardId);
      session.cancelledCards.delete(unit.cardId);
      session.remainingUnits.set(unit.cardId, (session.remainingUnits.get(unit.cardId) || 0) + 1);
    });
    session.pendingUnits.push(...units);
    sessionRef.current = session;
    setSessionActive(true);
    setSessionNotice(null);

    const cardRunConfig = new Map(
      runnableCards.map(({ card, snapshot }) => [
        card.id,
        {
          snapshot,
          totalUnits: snapshot.batchList.length > 0 ? snapshot.batchList.length : 1,
        },
      ]),
    );

    setCards(prev =>
      prev.map(card => {
        const config = cardRunConfig.get(card.id);
        if (!config) return card;

        return {
          ...card,
          nodes: cloneNodes(config.snapshot.nodes),
          instanceType: config.snapshot.instanceType,
          run: {
            ...createEmptyRunState(),
            mode: config.totalUnits > 1 ? 'batch' : 'single',
            status: 'queued',
            totalUnits: config.totalUnits,
            progressText: config.totalUnits > 1 ? '等待批量调度' : '等待调度',
            logs: [timestampLog(`已加入调度队列，并发槽位 ${totalConfiguredSlots}`)],
          },
        };
      }),
    );

    if (existingSession) {
      session.wake?.();
      return;
    }

    const capacityManagers = createApiCapacityManagers(apiConfigs);
    const pendingUnits = session.pendingUnits;
    const runningTasks = new Set<Promise<void>>();
    let hasLoggedCapacityWait = false;

    try {
      while (!session.cancelled && (pendingUnits.length > 0 || runningTasks.size > 0)) {
        let launchedCount = 0;

        for (const manager of capacityManagers) {
          if (session.cancelled || pendingUnits.length === 0) {
            break;
          }

          let availableSlots: number;
          try {
            availableSlots = (await manager.probe()).availableSlots;
          } catch (error: any) {
            setSessionNotice(`API${manager.index + 1} 队列查询失败，其他账号继续调度：${error.message || error}`);
            continue;
          }

          while (!session.cancelled && availableSlots > 0 && pendingUnits.length > 0) {
            const unit = pendingUnits.shift();
            if (!unit) {
              break;
            }

            if (isCardCancelled(session, unit.cardId)) {
              finishUnit(session, unit.cardId);
              continue;
            }

            if (!manager.reserveSlot()) {
              pendingUnits.unshift(unit);
              break;
            }

            availableSlots -= 1;
            launchedCount += 1;
            hasLoggedCapacityWait = false;

            updateCard(unit.cardId, card => ({
              ...card,
              run: {
                ...card.run,
                status: 'running',
                activeUnits: card.run.activeUnits + 1,
                progressText: unit.totalUnits > 1 ? `批量任务 ${unit.unitIndex + 1}/${unit.totalUnits} 执行中` : '任务执行中',
              },
            }));

            appendCardLog(unit.cardId, `调度到 API${manager.index + 1}，当前可用槽位 ${availableSlots}`);

            let retry = false;
            let taskPromise: Promise<void>;
            taskPromise = (async () => {
              try {
                const result = await executeWorkflowTask({
                  apiKey: manager.apiKey,
                  webappId: unit.webappId,
                  taskNodes: unit.nodes,
                  pendingFiles: unit.pendingFiles,
                  taskIndex: unit.unitIndex,
                  instanceType: unit.instanceType,
                  runOptions: unit.runOptions,
                  autoSaveEnabled: autoSaveConfig.enabled,
                  batchTaskName: unit.batchTaskName,
                  taskLabel: unit.totalUnits > 1 ? `任务 ${unit.unitIndex + 1}/${unit.totalUnits}` : `卡片 ${unit.cardId.slice(0, 6)}`,
                  callbacks: {
                    onSubmitted: taskId => history.controller.event(unit.runId, unit.unitIndex, { type: 'submitted', taskId }),
                    onLog: message => appendCardLog(unit.cardId, message),
                    onProgress: snapshot => {
                      if (isCardCancelled(session, unit.cardId)) return;
                      updateCard(unit.cardId, card => ({
                        ...card,
                        run: {
                          ...card.run,
                          status: 'running',
                          progressPercent: Math.round(snapshot.overallPercent),
                          progressText: snapshot.currentNodeName
                            ? `当前节点: ${snapshot.currentNodeName}`
                            : card.run.progressText,
                        },
                      }));
                    },
                    onStatusChange: status => {
                      if (isCardCancelled(session, unit.cardId)) return;
                      updateCard(unit.cardId, card => ({
                        ...card,
                        run: {
                          ...card.run,
                          status: status === 'RUNNING' ? 'running' : 'queued',
                          progressText:
                            status === 'SUBMITTING'
                              ? '正在提交任务'
                              : status === 'RUNNING'
                                ? '任务运行中'
                                : '任务排队中',
                        },
                      }));
                    },
                  },
                  control: {
                    isCancelled: () => isCardCancelled(session, unit.cardId),
                    registerConnection: connection => registerCardConnection(session, unit.cardId, connection),
                    pollOffsetMs: manager.index * 250,
                  },
                });

                if (isCardCancelled(session, unit.cardId)) throw new TaskCancelledError();
                history.controller.event(unit.runId, unit.unitIndex, { type: 'success', taskId: result.taskId, outputs: result.outputs, usage: result.usage });
                updateCard(unit.cardId, card => {
                  const completedUnits = card.run.completedUnits + 1;
                  const activeUnits = Math.max(0, card.run.activeUnits - 1);
                  const totalProcessed = completedUnits + card.run.failedUnits;
                  const isFinished = totalProcessed >= card.run.totalUnits;

                  return {
                    ...card,
                    run: {
                      ...card.run,
                      status: isFinished ? (card.run.failedUnits > 0 ? 'failed' : 'success') : 'running',
                      completedUnits,
                      activeUnits,
                      currentTaskId: result.taskId,
                      taskIds: [...card.run.taskIds, result.taskId],
                      outputs: [...card.run.outputs, ...result.outputs],
                      usage: mergeUsage(card.run.usage, result.usage),
                      progressPercent: isFinished ? 100 : card.run.progressPercent,
                      progressText: isFinished
                        ? (card.run.failedUnits > 0 ? '部分任务失败' : '全部任务完成')
                        : `已完成 ${completedUnits}/${card.run.totalUnits}`,
                    },
                  };
                });
              } catch (error: any) {
                if (error instanceof TaskCancelledError || isCardCancelled(session, unit.cardId)) {
                  updateCard(unit.cardId, card => ({
                    ...card,
                    run: {
                      ...card.run,
                      status: 'cancelled',
                      activeUnits: Math.max(0, card.run.activeUnits - 1),
                      progressText: '已停止追踪，服务端已提交的任务可能仍在运行',
                    },
                  }));
                  return;
                }

                if (isCapacityLimitedError(error)) {
                  retry = true;
                  pendingUnits.push(unit);
                  manager.markCapacityLimited();
                  updateCard(unit.cardId, card => ({
                    ...card,
                    run: {
                      ...card.run,
                      status: 'queued',
                      activeUnits: Math.max(0, card.run.activeUnits - 1),
                      progressText: '等待 API 空闲槽位后自动继续',
                    },
                  }));
                  appendCardLog(unit.cardId, '当前 API 并发暂时已满，已回到队列等待自动重试');
                  return;
                }

                history.controller.event(unit.runId, unit.unitIndex, { type: 'failed', error: error.message || '' });
                updateCard(unit.cardId, card => {
                  const failedUnits = card.run.failedUnits + 1;
                  const activeUnits = Math.max(0, card.run.activeUnits - 1);
                  const totalProcessed = failedUnits + card.run.completedUnits;
                  const isFinished = totalProcessed >= card.run.totalUnits;
                  const failedBatchIndices = new Set(card.run.failedBatchIndices);
                  failedBatchIndices.add(unit.unitIndex);

                  return {
                    ...card,
                    run: {
                      ...card.run,
                      status: isFinished ? 'failed' : 'running',
                      failedUnits,
                      activeUnits,
                      error: error.message || '任务执行失败',
                      failedBatchIndices,
                      progressText: isFinished ? '任务执行结束，存在失败项' : `存在失败项，已完成 ${totalProcessed}/${card.run.totalUnits}`,
                    },
                  };
                });

                appendCardLog(unit.cardId, `失败: ${error.message || error}`);
              } finally {
                manager.releaseSlot();
                if (!retry) finishUnit(session, unit.cardId);
              }
            })().finally(() => {
              runningTasks.delete(taskPromise);
              session.wake?.();
            });

            runningTasks.add(taskPromise);
          }
        }

        if (session.cancelled) {
          break;
        }

        if (launchedCount > 0) {
          continue;
        }

        if (pendingUnits.length > 0 && runningTasks.size === 0 && !hasLoggedCapacityWait) {
          setSessionNotice('当前 API 并发已被网页或其他任务占用，系统会在有空位时自动继续。');
          hasLoggedCapacityWait = true;
        }

        if (pendingUnits.length === 0 && runningTasks.size === 0) break;

        // Wake on appended cards, task completion or remote capacity becoming free.
        await new Promise<void>(resolve => {
          const wake = () => {
            clearTimeout(timer);
            if (session.wake === wake) session.wake = undefined;
            resolve();
          };
          const timer = setTimeout(wake, 3000);
          session.wake = wake;
        });
      }
    } finally {
      await Promise.all(runningTasks);
      session.connections.forEach(closers => closers.forEach(close => close()));
      sessionRef.current = null;
      setSessionActive(false);
    }

  };

  const handleRunCard = async (
    cardId: string,
    updatedNodes: NodeInfo[],
    batchList?: NodeInfo[][],
    pendingFiles?: PendingFilesMap,
    batchTaskName?: string,
    instanceType?: InstanceType,
  ) => {
    if (sessionRef.current?.cancelled || sessionRef.current?.runningCardIds.has(cardId)) {
      setSessionNotice('当前卡片仍在执行或停止中，请稍后再提交。');
      return;
    }

    const targetCard = cards.find(card => card.id === cardId);
    const nextInstanceType = instanceType || targetCard?.instanceType || 'default';

    updateCard(cardId, card => ({
      ...card,
      nodes: cloneNodes(updatedNodes),
      instanceType: nextInstanceType,
      initialBatchList: batchList ? cloneNodeRows(batchList) : [],
      initialBatchTaskName: batchTaskName || '',
    }));

    const snapshot: StepEditorSnapshot = {
      nodes: cloneNodes(updatedNodes),
      batchList: batchList ? batchList.map(cloneNodes) : [],
      pendingFiles: { ...(pendingFiles || {}) },
      batchTaskName: batchTaskName || '',
      instanceType: nextInstanceType,
      hasUploadingFiles: false,
      isConnected: true,
    };

    manualSnapshotsRef.current[cardId] = snapshot;

    await startScheduler([cardId]);
  };

  const handleRunAll = async () => {
    await startScheduler();
  };

  return { stopTrackingCard, stopAllTracking, handleRunCard, handleRunAll };
}
