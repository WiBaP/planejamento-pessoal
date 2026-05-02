const dataService = {
  getState,

  addTask(payload) {
    store.tarefas.push(normalizeTask({ id: createId(), ...payload }));
    schedulePersist();
  },

  updateTask(taskId, payload, effectiveDate) {
    const current = store.tarefas.find(item => item.id === taskId);
    if (!current) throw new Error('Tarefa não encontrada para editar.');

    const hasHistoricRecords = store.registros.some(item => item.tarefaId === taskId);
    if (!hasHistoricRecords || effectiveDate <= current.startDate) {
      Object.assign(current, normalizeTask({ ...current, ...payload, id: taskId, startDate: current.startDate }));
      schedulePersist();
      return;
    }

    current.endDate = getPreviousDate(effectiveDate);
    store.tarefas.push(normalizeTask({ id: createId(), ...payload, startDate: effectiveDate, endDate: null }));
    schedulePersist();
  },

  deleteTask(taskId) {
    store.tarefas = store.tarefas.filter(item => item.id !== taskId);
    store.registros = store.registros.filter(item => item.tarefaId !== taskId);
    schedulePersist();
  },

  setTaskStatus(taskId, status, dateKey) {
    const tarefa = store.tarefas.find(item => item.id === taskId);
    if (!tarefa) throw new Error('Tarefa não encontrada para atualizar status.');

    const registroKey = getTaskProgressKey(tarefa, dateKey);
    const registro = store.registros.find(item => item.tarefaId === taskId && item.data === registroKey);

    if (!registro) {
      store.registros.push({
        id: createId(),
        tarefaId: taskId,
        data: registroKey,
        completedDate: status === 'feito' ? dateKey : null,
        status,
        completedAt: status === 'feito' ? formatCurrentTime() : null,
        duracaoMinutos: null,
      });
    } else if (registro.status === status) {
      store.registros = store.registros.filter(item => !(item.tarefaId === taskId && item.data === registroKey));
    } else {
      registro.status = status;
      registro.completedDate = status === 'feito' ? dateKey : null;
      registro.completedAt = status === 'feito' ? formatCurrentTime() : null;
    }

    schedulePersist();
  },

  saveTaskValue(taskId, dateKey, valor) {
    const tarefa = store.tarefas.find(item => item.id === taskId);
    if (!tarefa) throw new Error('Tarefa não encontrada para registrar valor.');

    const registroKey = getTaskProgressKey(tarefa, dateKey);
    let registro = store.registros.find(item => item.tarefaId === taskId && item.data === registroKey);

    if (!registro) {
      registro = {
        id: createId(),
        tarefaId: taskId,
        data: registroKey,
        completedDate: dateKey,
        status: 'feito',
        completedAt: formatCurrentTime(),
        valor,
      };
      store.registros.push(registro);
    } else {
      registro.valor = valor;
      if (!registro.status) {
        registro.status = 'feito';
        registro.completedDate = dateKey;
        registro.completedAt = formatCurrentTime();
      } else if (registro.status === 'feito' && !registro.completedDate) {
        registro.completedDate = dateKey;
      }
    }

    schedulePersist();
  },

  saveTaskDuration(taskId, dateKey, durationMinutes) {
    const tarefa = store.tarefas.find(item => item.id === taskId);
    if (!tarefa) throw new Error('Tarefa não encontrada para registrar duração.');

    const registroKey = getTaskProgressKey(tarefa, dateKey);
    let registro = store.registros.find(item => item.tarefaId === taskId && item.data === registroKey);

    if (!registro) {
      registro = {
        id: createId(),
        tarefaId: taskId,
        data: registroKey,
        completedDate: dateKey,
        status: 'feito',
        completedAt: formatCurrentTime(),
        duracaoMinutos: durationMinutes,
      };
      store.registros.push(registro);
    } else {
      registro.duracaoMinutos = durationMinutes;
      if (!registro.status) {
        registro.status = 'feito';
        registro.completedDate = dateKey;
        registro.completedAt = formatCurrentTime();
      } else if (registro.status === 'feito' && !registro.completedDate) {
        registro.completedDate = dateKey;
      }
    }

    schedulePersist();
  },

  addCategory(payload) {
    store.categorias.push({ id: createId(), ...payload });
    schedulePersist();
  },

  updateCategory(categoryId, payload) {
    const categoria = store.categorias.find(item => item.id === categoryId);
    if (!categoria) throw new Error('Categoria não encontrada para editar.');
    Object.assign(categoria, payload);
    schedulePersist();
  },

  deleteCategory(categoryId) {
    const metasDaCategoria = store.metas.filter(item => item.catId === categoryId);

    metasDaCategoria.forEach(meta => {
      store.sessoes = store.sessoes.filter(sessao => sessao.metaId !== meta.id);
      store.tarefas.forEach(tarefa => {
        if (tarefa.metaId === meta.id) tarefa.metaId = null;
      });
    });

    store.metas = store.metas.filter(item => item.catId !== categoryId);
    store.categorias = store.categorias.filter(item => item.id !== categoryId);
    schedulePersist();
  },

  addMeta(payload) {
    store.metas.push({ id: createId(), ...payload });
    schedulePersist();
  },

  updateMeta(metaId, payload) {
    const meta = store.metas.find(item => item.id === metaId);
    if (!meta) throw new Error('Meta não encontrada para editar.');
    Object.assign(meta, payload);
    schedulePersist();
  },

  deleteMeta(metaId) {
    store.metas = store.metas.filter(item => item.id !== metaId);
    store.sessoes = store.sessoes.filter(item => item.metaId !== metaId);
    store.tarefas.forEach(tarefa => {
      if (tarefa.metaId === metaId) tarefa.metaId = null;
    });
    schedulePersist();
  },

  addMetaLog(payload) {
    store.sessoes.push({ id: createId(), ...payload });
    schedulePersist();
  },

  addMarketItem(payload) {
    store.mercadoItens.push(normalizeMarketItem({ id: createId(), ...payload }));
    schedulePersist();
  },

  updateMarketItemStatus(itemId, status) {
    const item = store.mercadoItens.find(entry => entry.id === itemId);
    if (!item) throw new Error('Item nao encontrado na lista de mercado.');
    item.status = status === 'faltando' ? 'faltando' : 'ok';
    schedulePersist();
  },

  updateMarketItemQuantity(itemId, quantidade) {
    const item = store.mercadoItens.find(entry => entry.id === itemId);
    if (!item) throw new Error('Item nao encontrado na lista de mercado.');
    const nextQuantity = Number(quantidade || 1);
    item.quantidade = Number.isFinite(nextQuantity) && nextQuantity > 0 ? nextQuantity : 1;
    schedulePersist();
  },

  deleteMarketItem(itemId) {
    store.mercadoItens = store.mercadoItens.filter(item => item.id !== itemId);
    schedulePersist();
  },
};
