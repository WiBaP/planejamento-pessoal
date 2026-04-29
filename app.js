const APP_STORAGE_KEY = 'planejamento.app_state.v4';
const APP_LAST_ROLLOVER_KEY = 'planejamento.last_rollover_date.v1';
const PROGRESS_ANIMATION_MS = 4000;
const TASK_STATUS_ANIMATION_MS = 1300;
const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Dom' },
];

/* Estrutura principal dos dados. Esta é a base que depois pode ser migrada para banco. */
function createInitialState() {
  return {
    categorias: [],
    metas: [],
    tarefas: [],
    registros: [],
    sessoes: [],
    transacoes: [],
  };
}

/* Utilitários para leitura e saneamento do estado salvo. */
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTask(raw) {
  return {
    id: raw?.id || createId(),
    nome: raw?.nome || '',
    metaId: raw?.metaId || null,
    recorrencia: raw?.recorrencia || 'diario',
    inicio: raw?.inicio || null,
    fim: raw?.fim || null,
    diasSemana: Array.isArray(raw?.diasSemana) ? raw.diasSemana.map(Number).filter(Boolean) : [1, 2, 3, 4, 5, 6, 7],
    dataUnica: raw?.dataUnica || null,
    dataMensal: raw?.dataMensal || null,
    dataAnual: raw?.dataAnual || null,
    mesAnual: raw?.mesAnual || null,
    comentario: raw?.comentario || '',
    startDate: raw?.startDate || getToday(),
    endDate: raw?.endDate || null,
  };
}

function normalizeState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;

  base.categorias = Array.isArray(raw.categorias) ? raw.categorias : [];
  base.metas = Array.isArray(raw.metas)
    ? raw.metas.map(meta => ({ ...meta, unidade: meta?.unidade === 'paginas' ? 'vezes' : meta?.unidade }))
    : [];
  base.tarefas = Array.isArray(raw.tarefas) ? raw.tarefas.map(normalizeTask) : [];
  base.registros = Array.isArray(raw.registros) ? raw.registros : [];
  base.sessoes = Array.isArray(raw.sessoes) ? raw.sessoes : [];
  base.transacoes = Array.isArray(raw.transacoes) ? raw.transacoes : [];
  return base;
}

/* Persistência local. Depois pode ser trocada por API sem reescrever as telas. */
const storageGateway = {
  loadState() {
    try {
      const raw = localStorage.getItem(APP_STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : createInitialState();
    } catch (error) {
      console.error('Erro ao carregar o estado salvo no navegador.', error);
      return createInitialState();
    }
  },

  saveState(state) {
    try {
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error('Erro ao salvar o estado no navegador.', error);
      return false;
    }
  },
};

/* Estado de dados separado do estado visual. */
let store = storageGateway.loadState();

const uiState = {
  paginaAtual: null,
  cachePaginas: {},
  dataSelecionada: getToday(),
  mesCalendario: new Date(),
  ultimoDiaRenderizado: getToday(),
  saveTimer: null,
  feedbackTimer: null,
  actionFeedbackTimer: null,
  progressoAnterior: {},
  buscaCompartilhada: '',
  rotinaFiltro: 'todas',
  rotinaFormularioAberto: false,
  categoriaFormularioAberto: false,
  metaFormularioAberto: false,
  editandoTarefaId: null,
  editandoCategoriaId: null,
  editandoMetaId: null,
  secoesMinimizadas: {
    unica: false,
    diario: false,
    semanal: false,
    mensal: false,
    anual: false,
  },
  comentariosMinimizados: {},
  categoriasMinimizadas: {},
  tarefasConcluidasExpandidas: {},
};

function getState() {
  return store;
}

function getSnapshot() {
  return deepClone(store);
}

function updateSaveStatus(status, label) {
  const dot = document.getElementById('save-dot');
  const text = document.getElementById('save-label');
  if (dot) dot.className = `save-dot ${status}`;
  if (text) text.textContent = label;
}

function showFeedback(type, message, keepVisible = false) {
  const banner = document.getElementById('feedback-banner');
  const text = document.getElementById('feedback-text');
  if (!banner || !text) return;

  banner.className = `banner show ${type}`;
  text.textContent = message;

  if (uiState.feedbackTimer) clearTimeout(uiState.feedbackTimer);
  if (keepVisible) return;

  uiState.feedbackTimer = setTimeout(() => {
    banner.className = 'banner';
    text.textContent = '';
    uiState.feedbackTimer = null;
  }, 4200);
}

function showActionFeedback(type, message, anchor = document.activeElement, keepVisible = false) {
  const anchorElement = anchor instanceof Element ? anchor : null;
  const target = anchorElement?.closest('.form-row, .task-item, .meta-item, .tx-row, .routine-toolbar-actions, .card');
  if (!target) {
    showFeedback(type, message, keepVisible);
    return;
  }

  document.querySelectorAll('.action-feedback').forEach(item => item.remove());

  const feedback = document.createElement('div');
  feedback.className = `action-feedback ${type}`;
  feedback.textContent = message;
  target.insertAdjacentElement('afterend', feedback);

  if (uiState.actionFeedbackTimer) clearTimeout(uiState.actionFeedbackTimer);
  if (keepVisible) return;

  uiState.actionFeedbackTimer = setTimeout(() => {
    feedback.remove();
    uiState.actionFeedbackTimer = null;
  }, 5500);
}

function persistNow() {
  const saved = storageGateway.saveState(getSnapshot());
  updateSaveStatus(saved ? 'saved' : 'error', saved ? 'Salvo Neste Navegador' : 'Erro Ao Salvar');
  if (!saved) showFeedback('error', 'Não foi possível salvar os dados neste navegador.', true);
}

function schedulePersist() {
  updateSaveStatus('saving', 'Salvando...');
  if (uiState.saveTimer) clearTimeout(uiState.saveTimer);
  uiState.saveTimer = setTimeout(() => {
    uiState.saveTimer = null;
    persistNow();
  }, 250);
}

function flushPersist() {
  if (!uiState.saveTimer) return;
  clearTimeout(uiState.saveTimer);
  uiState.saveTimer = null;
  persistNow();
}

/* Serviço de dados com métodos claros. Este é o contrato futuro com o banco. */
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

  addTransaction(payload) {
    store.transacoes.push({ id: createId(), ...payload });
    schedulePersist();
  },

  deleteTransaction(transactionId) {
    store.transacoes = store.transacoes.filter(item => item.id !== transactionId);
    schedulePersist();
  },
};

/* Helpers genéricos. */
function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const date = new Date(`${monthStr}-01T12:00:00`);
  const label = date.toLocaleDateString('pt-BR', { month: 'long' });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getIsoWeekday(dateStr) {
  return new Date(`${dateStr}T12:00:00`).getDay() || 7;
}

function getWeekStart(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

function getWeekEnd(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay() || 7;
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - day + 7);
  return sunday.toISOString().slice(0, 10);
}

function getNextDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function getPreviousDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getMonthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function getMonthEnd(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return lastDay.toISOString().slice(0, 10);
}

function getYearStart(dateStr) {
  return `${dateStr.slice(0, 4)}-01-01`;
}

function getYearEnd(dateStr) {
  return `${dateStr.slice(0, 4)}-12-31`;
}

function getRangeForPrazo(prazo, dateStr = getToday()) {
  if (prazo === 'semanal') return { start: getWeekStart(dateStr), end: getWeekEnd(dateStr) };
  if (prazo === 'anual') return { start: getYearStart(dateStr), end: getYearEnd(dateStr) };
  return { start: getMonthStart(dateStr), end: getMonthEnd(dateStr) };
}

function getTaskStartDate(payload, baseDate) {
  if (payload.recorrencia === 'unica') return payload.dataUnica || baseDate;

  if (payload.recorrencia === 'semanal') {
    const dias = payload.diasSemana?.length ? payload.diasSemana : [];
    if (!dias.length) return baseDate;
    let cursor = baseDate;
    for (let i = 0; i < 14; i += 1) {
      if (dias.includes(getIsoWeekday(cursor))) return cursor;
      cursor = getNextDate(cursor);
    }
    return baseDate;
  }

  if (payload.recorrencia === 'mensal' && payload.dataMensal) {
    const selectedDay = Number(payload.dataMensal.slice(-2));
    const base = new Date(`${baseDate}T12:00:00`);
    const currentMonthCandidate = new Date(base.getFullYear(), base.getMonth(), selectedDay);
    if (currentMonthCandidate.toISOString().slice(0, 10) >= baseDate) {
      return currentMonthCandidate.toISOString().slice(0, 10);
    }
    const nextMonthCandidate = new Date(base.getFullYear(), base.getMonth() + 1, selectedDay);
    return nextMonthCandidate.toISOString().slice(0, 10);
  }

  if (payload.recorrencia === 'anual') {
    if (payload.dataAnual) {
      const selectedMonthDay = payload.dataAnual.slice(5);
      const currentYearCandidate = `${baseDate.slice(0, 4)}-${selectedMonthDay}`;
      if (currentYearCandidate >= baseDate) return currentYearCandidate;
      return `${Number(baseDate.slice(0, 4)) + 1}-${selectedMonthDay}`;
    }

    if (payload.mesAnual) {
      const selectedMonth = payload.mesAnual.slice(5, 7);
      const currentYearCandidate = `${baseDate.slice(0, 4)}-${selectedMonth}-01`;
      if (currentYearCandidate >= getMonthStart(baseDate)) return currentYearCandidate;
      return `${Number(baseDate.slice(0, 4)) + 1}-${selectedMonth}-01`;
    }
  }

  return baseDate;
}

function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + minutes;
}

function validateTimeRange(start, end, contextLabel) {
  if (!start || !end) return;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (startMinutes === null || endMinutes === null) return;
  if (endMinutes <= startMinutes) {
    throw new Error(`${contextLabel} não pode terminar no dia seguinte. Ajuste o horário final para antes de 00:00.`);
  }
}

function calcDurationMinutes(start, end) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return 0;
  return Math.max(0, endMinutes - startMinutes);
}

function formatMinutes(totalMinutes) {
  if (!totalMinutes) return '0min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}min`;
  if (!minutes) return `${hours}h`;
  return `${hours}h${minutes}min`;
}

function formatCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function durationInputToMinutes(value) {
  if (!value) return 0;
  return timeToMinutes(value);
}

function minutesToDecimalHours(totalMinutes) {
  return totalMinutes / 60;
}

function getTaskProgressKey(tarefa, selectedDate) {
  if (tarefa.recorrencia === 'semanal') return getWeekStart(selectedDate);
  if (tarefa.recorrencia === 'mensal') return getMonthStart(selectedDate);
  if (tarefa.recorrencia === 'anual') return getYearStart(selectedDate);
  if (tarefa.recorrencia === 'unica') return tarefa.dataUnica;
  return selectedDate;
}

function loadLastRolloverDate() {
  try {
    return localStorage.getItem(APP_LAST_ROLLOVER_KEY) || getToday();
  } catch (error) {
    console.error('Erro ao carregar a última data processada.', error);
    return getToday();
  }
}

function saveLastRolloverDate(dateStr) {
  try {
    localStorage.setItem(APP_LAST_ROLLOVER_KEY, dateStr);
  } catch (error) {
    console.error('Erro ao salvar a última data processada.', error);
  }
}

function getTaskRecord(taskId, dateKey) {
  return store.registros.find(item => item.tarefaId === taskId && item.data === dateKey) || null;
}

function taskOccursOnDate(tarefa, dateKey) {
  if (dateKey < tarefa.startDate) return false;
  if (tarefa.endDate && dateKey > tarefa.endDate) return false;

  if (tarefa.recorrencia === 'diario') {
    const dias = tarefa.diasSemana?.length ? tarefa.diasSemana : [1, 2, 3, 4, 5, 6, 7];
    return dias.includes(getIsoWeekday(dateKey));
  }

  if (tarefa.recorrencia === 'unica') return tarefa.dataUnica === dateKey;
  if (tarefa.recorrencia === 'anual') {
    if (tarefa.dataAnual) return tarefa.dataAnual.slice(5) === dateKey.slice(5);
    if (tarefa.mesAnual) return tarefa.mesAnual.slice(5, 7) === dateKey.slice(5, 7);
  }
  return true;
}

function shouldAutoMarkMissed(tarefa, dateKey) {
  if (tarefa.recorrencia === 'diario') return taskOccursOnDate(tarefa, dateKey);
  if (tarefa.recorrencia === 'unica') return tarefa.dataUnica === dateKey;
  return false;
}

function processMissedTasksForDate(dateKey) {
  let changed = false;

  store.tarefas.forEach(tarefa => {
    if (!shouldAutoMarkMissed(tarefa, dateKey)) return;

    const progressKey = getTaskProgressKey(tarefa, dateKey);
    if (getTaskRecord(tarefa.id, progressKey)) return;

    store.registros.push({
      id: createId(),
        tarefaId: tarefa.id,
        data: progressKey,
        status: 'nao_feito',
        completedAt: null,
        duracaoMinutos: null,
      });
    changed = true;
  });

  if (changed) persistNow();
}

function processPendingRollovers() {
  let cursor = loadLastRolloverDate();
  const today = getToday();

  while (cursor < today) {
    processMissedTasksForDate(cursor);
    cursor = getNextDate(cursor);
  }

  saveLastRolloverDate(today);
}

function getMetaProgress(metaId, prazo, referenceDate = getToday()) {
  const meta = store.metas.find(item => item.id === metaId);
  if (!meta) return 0;

  const { start, end } = getRangeForPrazo(prazo, referenceDate);
  let total = 0;

  store.tarefas
    .filter(item => item.metaId === metaId)
    .forEach(tarefa => {
      store.registros
        .filter(registro => registro.tarefaId === tarefa.id && registro.status === 'feito' && registro.data >= start && registro.data <= end)
        .forEach(registro => {
          if (meta.unidade === 'vezes') {
            total += 1;
          } else if (registro.duracaoMinutos) {
            total += minutesToDecimalHours(registro.duracaoMinutos);
          } else if (tarefa.inicio && tarefa.fim) {
            total += minutesToDecimalHours(calcDurationMinutes(tarefa.inicio, tarefa.fim));
          }
        });
    });

  total += store.sessoes
    .filter(item => item.metaId === metaId && item.data >= start && item.data <= end)
    .reduce((sum, item) => sum + item.valor, 0);

  return total;
}

function getRecurrenceLabel(tarefa) {
  if (tarefa.recorrencia === 'semanal') {
    const dias = tarefa.diasSemana?.length ? tarefa.diasSemana : [];
    return dias.length ? `Semana: ${dias.map(dia => WEEKDAY_OPTIONS.find(item => item.value === dia)?.label).join(', ')}` : 'Semanal Flexível';
  }
  if (tarefa.recorrencia === 'mensal') {
    return tarefa.dataMensal ? `Mês: dia ${tarefa.dataMensal.slice(-2)}` : 'Mensal Flexível';
  }
  if (tarefa.recorrencia === 'anual') {
    if (tarefa.dataAnual) return `Anual: ${formatDateShort(tarefa.dataAnual)}`;
    if (tarefa.mesAnual) return `Anual: ${formatMonthLabel(tarefa.mesAnual)}`;
    return 'Anual FlexÃ­vel';
  }
  if (tarefa.recorrencia === 'unica') return 'Somente Nesta Data';

  const dias = tarefa.diasSemana?.length ? tarefa.diasSemana : [1, 2, 3, 4, 5, 6, 7];
  if (dias.length === 7) return 'Todos Os Dias';
  return dias.map(dia => WEEKDAY_OPTIONS.find(item => item.value === dia)?.label).join(', ');
}

function getTaskTypeLabel(tarefa) {
  if (tarefa.recorrencia === 'unica') return 'Desta Data';
  if (tarefa.recorrencia === 'semanal') return 'Semanal';
  if (tarefa.recorrencia === 'mensal') return 'Mensal';
  if (tarefa.recorrencia === 'anual') return 'Anual';
  return 'Diária';
}

function getTaskHighlightFlags(tarefa, dateKey) {
  if (tarefa.recorrencia === 'diario') {
    const dias = tarefa.diasSemana?.length ? tarefa.diasSemana : [1, 2, 3, 4, 5, 6, 7];
    const allDays = dias.length === 7;
    if (allDays) return [{ label: 'Todos os dias', active: true }];

    return dias.map(dia => ({
      label: WEEKDAY_OPTIONS.find(item => item.value === dia)?.label || '',
      active: dia === getIsoWeekday(dateKey),
    }));
  }

  if (tarefa.recorrencia === 'semanal') {
    const dias = tarefa.diasSemana?.length ? tarefa.diasSemana : [];
    return dias.map(dia => ({
      label: WEEKDAY_OPTIONS.find(item => item.value === dia)?.label || '',
      active: dia === getIsoWeekday(dateKey),
    }));
  }

  if (tarefa.recorrencia === 'mensal' && tarefa.dataMensal) {
    const currentDay = Number(dateKey.slice(-2));
    const monthlyDay = Number(tarefa.dataMensal.slice(-2));
    return [{ label: `Dia ${String(monthlyDay).padStart(2, '0')}`, active: currentDay === monthlyDay }];
  }

  if (tarefa.recorrencia === 'anual') {
    if (tarefa.dataAnual) return [{ label: formatDateShort(tarefa.dataAnual), active: tarefa.dataAnual.slice(5) === dateKey.slice(5) }];
    if (tarefa.mesAnual) return [{ label: formatMonthLabel(tarefa.mesAnual), active: tarefa.mesAnual.slice(5, 7) === dateKey.slice(5, 7) }];
  }

  if (tarefa.recorrencia === 'unica' && tarefa.dataUnica) {
    return [{ label: tarefa.dataUnica, active: true }];
  }

  return [];
}

function runSafely(context, action, anchor = document.activeElement) {
  try {
    action();
  } catch (error) {
    console.error(`Erro em ${context}.`, error);
    showActionFeedback('error', error.message || 'Ocorreu um erro na operação.', anchor);
  }
}

function validateTaskCanBeMarked(tarefa, dateKey) {
  if (tarefa.recorrencia === 'semanal' && tarefa.diasSemana?.length) {
    const allowed = tarefa.diasSemana.includes(getIsoWeekday(dateKey));
    if (!allowed) {
      throw new Error(`Essa tarefa só pode ser marcada nos dias: ${tarefa.diasSemana.map(dia => WEEKDAY_OPTIONS.find(item => item.value === dia)?.label).join(', ')}.`);
    }
  }

  if (tarefa.recorrencia === 'mensal' && tarefa.dataMensal) {
    const expectedDay = Number(tarefa.dataMensal.slice(-2));
    const currentDay = Number(dateKey.slice(-2));
    if (expectedDay !== currentDay) {
      throw new Error(`Essa tarefa só pode ser marcada no dia ${String(expectedDay).padStart(2, '0')} de cada mês.`);
    }
  }
  if (tarefa.recorrencia === 'anual') {
    if (tarefa.dataAnual && tarefa.dataAnual.slice(5) !== dateKey.slice(5)) {
      throw new Error(`Essa tarefa sÃ³ pode ser marcada em ${formatDateShort(tarefa.dataAnual).slice(0, 5)} de cada ano.`);
    }

    if (tarefa.mesAnual && tarefa.mesAnual.slice(5, 7) !== dateKey.slice(5, 7)) {
      throw new Error(`Essa tarefa sÃ³ pode ser marcada em ${formatMonthLabel(tarefa.mesAnual)}.`);
    }
  }
}

function playTaskStatusSweep(taskId, status, onComplete) {
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card) {
    onComplete();
    return;
  }

  const isDone = status === 'feito';
  const color = isDone ? '52, 211, 153' : '248, 113, 113';
  const sweep = document.createElement('div');
  sweep.className = `task-status-sweep ${isDone ? 'done' : 'missed'}`;
  Object.assign(sweep.style, {
    position: 'absolute',
    top: '4px',
    bottom: '4px',
    left: '-70%',
    width: '70%',
    zIndex: '50',
    borderRadius: '11px',
    pointerEvents: 'none',
    background: `linear-gradient(90deg, rgba(${color}, 0), rgba(${color}, 0.78), rgba(${color}, 0))`,
    boxShadow: `0 0 34px rgba(${color}, 0.42)`,
    opacity: '0',
  });

  card.appendChild(sweep);
  card.classList.add('task-status-animating');

  const washAnimation = card.animate([
    {
      backgroundColor: 'rgba(0, 0, 0, 0)',
      boxShadow: 'none',
      transform: 'translateX(0) scale(1)',
    },
    {
      backgroundColor: `rgba(${color}, 0.16)`,
      boxShadow: `inset 0 0 0 1px rgba(${color}, 0.34), 0 0 34px rgba(${color}, 0.24)`,
      transform: 'translateX(3px) scale(1.012)',
      offset: 0.35,
    },
    {
      backgroundColor: 'rgba(0, 0, 0, 0)',
      boxShadow: 'none',
      transform: 'translateX(0) scale(1)',
    },
  ], {
    duration: TASK_STATUS_ANIMATION_MS,
    easing: 'ease-in-out',
    fill: 'both',
  });

  const sweepAnimation = sweep.animate([
    { opacity: 0, transform: 'translateX(0) skewX(-12deg)' },
    { opacity: 1, transform: 'translateX(25%) skewX(-12deg)', offset: 0.14 },
    { opacity: 1, transform: 'translateX(190%) skewX(-12deg)', offset: 0.78 },
    { opacity: 0, transform: 'translateX(235%) skewX(-12deg)' },
  ], {
    duration: TASK_STATUS_ANIMATION_MS,
    easing: 'ease-in-out',
    fill: 'both',
  });

  Promise.allSettled([washAnimation.finished, sweepAnimation.finished]).then(() => {
    sweep.remove();
    card.classList.remove('task-status-animating');
    onComplete();
  });
}

/* Ações globais da rotina. */
function setStatus(taskId, status) {
  runSafely('setStatus', () => {
    const tarefa = store.tarefas.find(item => item.id === taskId);
    if (!tarefa) throw new Error('Tarefa não encontrada.');

    validateTaskCanBeMarked(tarefa, uiState.dataSelecionada);

    const currentRecord = getTaskRecord(tarefa.id, getTaskProgressKey(tarefa, uiState.dataSelecionada));
    const shouldAnimateStatus = currentRecord?.status !== status;

    if (shouldAnimateStatus) {
      playTaskStatusSweep(taskId, status, () => {
        dataService.setTaskStatus(taskId, status, uiState.dataSelecionada);
        renderCurrentPage();
      });

      return;
    }

    dataService.setTaskStatus(taskId, status, uiState.dataSelecionada);
    renderCurrentPage();
  });
}

function toggleDur(taskId) {
  const panel = document.getElementById(`dur-${taskId}`);
  if (panel) panel.classList.toggle('open');
}

function saveDur(taskId) {
  runSafely('saveDur', () => {
    const tarefa = store.tarefas.find(item => item.id === taskId);
    if (!tarefa) throw new Error('Tarefa não encontrada.');
    validateTaskCanBeMarked(tarefa, uiState.dataSelecionada);

    const input = document.getElementById(`durv-${taskId}`);
    const minutes = durationInputToMinutes(input.value);
    if (!minutes) throw new Error('Informe a duração em horas e minutos.');
    if (minutes > 1439) throw new Error('A duração máxima permitida é de 23h59.');

    dataService.saveTaskDuration(taskId, uiState.dataSelecionada, minutes);
    document.getElementById(`dur-${taskId}`).classList.remove('open');
    renderCurrentPage();
  });
}

function delTarefa(taskId) {
  if (!confirm('Confirma a exclusão desta tarefa?')) return;
  runSafely('delTarefa', () => {
    dataService.deleteTask(taskId);
    renderRotina();
  });
}

/* Controles do calendário. */
function prevMonth() {
  uiState.mesCalendario = new Date(uiState.mesCalendario.getFullYear(), uiState.mesCalendario.getMonth() - 1, 1);
  renderCalendar();
}

function nextMonth() {
  uiState.mesCalendario = new Date(uiState.mesCalendario.getFullYear(), uiState.mesCalendario.getMonth() + 1, 1);
  renderCalendar();
}

function toggleCalendar() {
  const panel = document.getElementById('calendar-panel');
  const button = document.getElementById('cal-toggle-btn');
  if (!panel || !button) return;
  panel.classList.toggle('open');
  button.classList.toggle('open');
}

function selectDate(dateValue) {
  uiState.dataSelecionada = dateValue;
  const panel = document.getElementById('calendar-panel');
  const button = document.getElementById('cal-toggle-btn');
  if (panel) panel.classList.remove('open');
  if (button) button.classList.remove('open');
  renderCurrentPage();
}

function updateSelectedDateLabel() {
  const target = document.getElementById('sel-date-label');
  if (!target) return;

  const date = new Date(`${uiState.dataSelecionada}T12:00:00`);
  const label = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  target.textContent = `${uiState.dataSelecionada === getToday() ? 'Hoje - ' : ''}${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function renderCalendar() {
  const label = document.getElementById('cal-month-label');
  const grid = document.getElementById('cal-grid');
  if (!label || !grid) return;

  const year = uiState.mesCalendario.getFullYear();
  const month = uiState.mesCalendario.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const offset = (firstDay.getDay() || 7) - 1;
  const todayKey = getToday();

  const monthLabel = uiState.mesCalendario.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  label.textContent = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}`;

  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div></div>');

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateKey === todayKey;
    const isSelected = dateKey === uiState.dataSelecionada;
    const hasDone = store.registros.some(item => item.status === 'feito' && (
      item.data === dateKey ||
      item.data === getWeekStart(dateKey) ||
      item.data === getMonthStart(dateKey)
    ));
    const hasMissed = store.registros.some(item => item.status === 'nao_feito' && (
      item.data === dateKey ||
      item.data === getWeekStart(dateKey) ||
      item.data === getMonthStart(dateKey)
    ));

    cells.push(`
      <div class="cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" onclick="selectDate('${dateKey}')">
        <span>${day}</span>
        <div class="cal-dots">
          ${hasDone ? '<div class="cal-dot g"></div>' : ''}
          ${hasMissed ? '<div class="cal-dot r"></div>' : ''}
        </div>
      </div>
    `);
  }

  grid.innerHTML = cells.join('');
}

/* Renderização da rotina e do formulário de tarefa. */
function renderRotina() {
  renderTaskMetaOptions();
  renderWeekdaySelector();
  onTaskTypeChange();
  syncRoutineUI();
  renderCalendar();
  renderTaskLists();
  updateSelectedDateLabel();
  syncSingleDateInput();
  bindTimeWheelInputs();
}

function syncRoutineUI() {
  const searchInput = document.getElementById('task-search');
  const formCard = document.getElementById('task-form-card');
  const submitButton = document.getElementById('task-submit-button');
  const closeButton = document.getElementById('task-close-form');
  const cancelButton = document.getElementById('task-cancel-edit');

  if (searchInput) searchInput.value = uiState.buscaCompartilhada;
  if (formCard) formCard.style.display = uiState.rotinaFormularioAberto ? '' : 'none';
  if (submitButton) submitButton.textContent = uiState.editandoTarefaId ? 'Salvar Alterações' : 'Salvar Tarefa';
  if (closeButton) closeButton.style.display = uiState.editandoTarefaId ? 'none' : '';
  if (cancelButton) cancelButton.style.display = uiState.editandoTarefaId ? '' : 'none';
  document.querySelectorAll('.filter-chip').forEach(button => {
    button.classList.toggle('active', button.getAttribute('onclick')?.includes(`'${uiState.rotinaFiltro}'`));
  });

  ['unica', 'diario', 'semanal', 'mensal', 'anual'].forEach(section => {
    const list = document.getElementById(`${section}-list`);
    const button = document.querySelector(`button[onclick="toggleSectionCollapse('${section}')"]`);
    if (list) {
      list.parentElement.classList.add('section-card');
      list.parentElement.classList.toggle('section-collapsed', uiState.secoesMinimizadas[section]);
    }
    if (button) {
      const arrow = button.querySelector('.section-arrow');
      if (arrow) arrow.textContent = uiState.secoesMinimizadas[section] ? '▸' : '▾';
      button.title = uiState.secoesMinimizadas[section] ? 'Expandir' : 'Minimizar';
    }
  });
}

function toggleTaskForm() {
  uiState.rotinaFormularioAberto = !uiState.rotinaFormularioAberto;
  if (!uiState.rotinaFormularioAberto) resetTaskForm();
  syncRoutineUI();
}

function closeTaskForm() {
  resetTaskForm();
  uiState.rotinaFormularioAberto = false;
  syncRoutineUI();
}

function toggleSectionCollapse(section) {
  uiState.secoesMinimizadas[section] = !uiState.secoesMinimizadas[section];
  syncRoutineUI();
}

function toggleTaskComment(taskId) {
  uiState.comentariosMinimizados[taskId] = !uiState.comentariosMinimizados[taskId];
  renderTaskLists();
}

function onTaskSearchInput() {
  const input = document.getElementById('task-search');
  uiState.buscaCompartilhada = input?.value?.trim().toLowerCase() || '';
  renderTaskLists();
}

function onMetaSearchInput() {
  const input = document.getElementById('meta-search');
  uiState.buscaCompartilhada = input?.value?.trim().toLowerCase() || '';
  renderMetas();
}

function setTaskFilter(filter) {
  uiState.rotinaFiltro = filter;
  renderTaskLists();
}

function resetTaskForm() {
  uiState.editandoTarefaId = null;
  document.getElementById('t-meta').value = '';
  document.getElementById('t-nome').value = '';
  document.getElementById('t-inicio').value = '';
  document.getElementById('t-fim').value = '';
  document.getElementById('t-comentario').value = '';
  document.getElementById('t-rec').value = 'diario';
  document.getElementById('t-data-unica').value = uiState.dataSelecionada;
  document.getElementById('t-data-mensal').value = uiState.dataSelecionada;
  document.getElementById('t-anual-modo').value = 'flexivel';
  document.getElementById('t-data-anual').value = uiState.dataSelecionada;
  document.getElementById('t-mes-anual').value = uiState.dataSelecionada.slice(0, 7);
  document.querySelectorAll('#weekday-selector input').forEach(input => {
    input.checked = true;
  });
  onAddMetaChange();
  onTaskTypeChange();
}

function cancelTaskEdit() {
  resetTaskForm();
  uiState.rotinaFormularioAberto = false;
  syncRoutineUI();
}

function startEditTask(taskId) {
  const tarefa = store.tarefas.find(item => item.id === taskId);
  if (!tarefa) return;

  uiState.editandoTarefaId = taskId;
  uiState.rotinaFormularioAberto = true;
  document.getElementById('t-meta').value = tarefa.metaId || '';
  document.getElementById('t-nome').value = tarefa.metaId ? '' : tarefa.nome;
  document.getElementById('t-rec').value = tarefa.recorrencia;
  document.getElementById('t-inicio').value = tarefa.inicio || '';
  document.getElementById('t-fim').value = tarefa.fim || '';
  document.getElementById('t-comentario').value = tarefa.comentario || '';
  document.getElementById('t-data-unica').value = tarefa.dataUnica || uiState.dataSelecionada;
  document.getElementById('t-data-mensal').value = tarefa.dataMensal || uiState.dataSelecionada;
  document.getElementById('t-anual-modo').value = tarefa.dataAnual ? 'dia' : (tarefa.mesAnual ? 'mes' : 'flexivel');
  document.getElementById('t-data-anual').value = tarefa.dataAnual || uiState.dataSelecionada;
  document.getElementById('t-mes-anual').value = tarefa.mesAnual || uiState.dataSelecionada.slice(0, 7);

  const selectedDays = tarefa.diasSemana?.length ? tarefa.diasSemana : [1, 2, 3, 4, 5, 6, 7];
  document.querySelectorAll('#weekday-selector input').forEach(input => {
    input.checked = selectedDays.includes(Number(input.value));
  });

  onAddMetaChange({ preserveName: true });
  onTaskTypeChange();
  syncRoutineUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderTaskMetaOptions() {
  const select = document.getElementById('t-meta');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">Sem Meta Vinculada</option>';

  store.categorias.forEach(categoria => {
    const metas = store.metas.filter(meta => meta.catId === categoria.id);
    if (!metas.length) return;

    const group = document.createElement('optgroup');
    group.label = categoria.nome;

    metas.forEach(meta => {
      const option = document.createElement('option');
      option.value = meta.id;
      option.textContent = meta.titulo;
      if (meta.id === currentValue) option.selected = true;
      group.appendChild(option);
    });

    select.appendChild(group);
  });
}

function renderWeekdaySelector() {
  const container = document.getElementById('weekday-selector');
  if (!container || container.dataset.ready === 'true') return;

  container.innerHTML = WEEKDAY_OPTIONS.map(item => `
    <label class="weekday-chip">
      <input type="checkbox" value="${item.value}" checked>
      <span>${item.label}</span>
    </label>
  `).join('');

  container.dataset.ready = 'true';
}

function syncSingleDateInput() {
  const input = document.getElementById('t-data-unica');
  if (input && !input.value) input.value = uiState.dataSelecionada;
  const monthlyInput = document.getElementById('t-data-mensal');
  if (monthlyInput && !monthlyInput.value) monthlyInput.value = uiState.dataSelecionada;
  const annualDateInput = document.getElementById('t-data-anual');
  if (annualDateInput && !annualDateInput.value) annualDateInput.value = uiState.dataSelecionada;
  const annualMonthInput = document.getElementById('t-mes-anual');
  if (annualMonthInput && !annualMonthInput.value) annualMonthInput.value = uiState.dataSelecionada.slice(0, 7);
}

function onTaskTypeChange() {
  const recurrence = document.getElementById('t-rec')?.value;
  const weekdayWrap = document.getElementById('weekday-wrap');
  const timeWrap = document.getElementById('time-wrap');
  const singleDateWrap = document.getElementById('single-date-wrap');
  const monthlyDateWrap = document.getElementById('monthly-date-wrap');
  const annualWrap = document.getElementById('annual-wrap');
  const annualMode = document.getElementById('t-anual-modo')?.value || 'flexivel';
  const annualDateInput = document.getElementById('t-data-anual');
  const annualMonthInput = document.getElementById('t-mes-anual');
  const helper = document.getElementById('task-type-help');
  const startInput = document.getElementById('t-inicio');
  const endInput = document.getElementById('t-fim');
  const monthlyDateInput = document.getElementById('t-data-mensal');

  if (!recurrence || !weekdayWrap || !timeWrap || !singleDateWrap || !monthlyDateWrap || !annualWrap || !annualDateInput || !annualMonthInput || !helper || !startInput || !endInput || !monthlyDateInput) return;

  weekdayWrap.style.display = recurrence === 'diario' || recurrence === 'semanal' ? '' : 'none';
  timeWrap.style.display = recurrence === 'diario' || recurrence === 'unica' ? '' : 'none';
  singleDateWrap.style.display = recurrence === 'unica' ? '' : 'none';
  monthlyDateWrap.style.display = recurrence === 'mensal' ? '' : 'none';
  annualWrap.style.display = recurrence === 'anual' ? '' : 'none';
  annualDateInput.style.display = recurrence === 'anual' && annualMode === 'dia' ? '' : 'none';
  annualMonthInput.style.display = recurrence === 'anual' && annualMode === 'mes' ? '' : 'none';

  if (recurrence === 'semanal' || recurrence === 'mensal' || recurrence === 'anual') {
    startInput.value = '';
    endInput.value = '';
  }

  if (recurrence === 'mensal' && !monthlyDateInput.value) {
    monthlyDateInput.value = uiState.dataSelecionada;
  }

  if (recurrence === 'anual' && !annualDateInput.value) annualDateInput.value = uiState.dataSelecionada;
  if (recurrence === 'anual' && !annualMonthInput.value) annualMonthInput.value = uiState.dataSelecionada.slice(0, 7);

  if (recurrence === 'diario') helper.textContent = 'A tarefa aparece somente nos dias da semana marcados abaixo.';
  if (recurrence === 'semanal') helper.textContent = 'Tarefa semanal: marque os dias de referência se quiser. Ela continua valendo para a semana inteira e reinicia toda segunda-feira.';
  if (recurrence === 'mensal') helper.textContent = 'Tarefa mensal: a data de referência é opcional. Se escolher uma data, esse dia fica destacado no mês.';
  if (recurrence === 'anual') helper.textContent = 'Tarefa anual: pode valer para o ano inteiro, para um mes especifico ou para um dia fixo do ano.';
  if (recurrence === 'unica') helper.textContent = 'Tarefa de uma data específica. Ela aparece somente no dia escolhido.';
}

function getSelectedWeekdays() {
  return Array.from(document.querySelectorAll('#weekday-selector input:checked'))
    .map(input => Number(input.value))
    .sort((a, b) => a - b);
}

function buildSectionProgress(sectionKey, tarefas, emptyWhenZero = false) {
  if (!tarefas.length && emptyWhenZero) return '';

  const feitas = tarefas.filter(item => getTaskRecord(item.id, getTaskProgressKey(item, uiState.dataSelecionada))?.status === 'feito').length;
  const percent = tarefas.length ? Math.round((feitas / tarefas.length) * 100) : 0;
  const progressKey = `section:${sectionKey}`;
  const initialPercent = uiState.progressoAnterior[progressKey] ?? percent;

  return `
    <div class="day-prog">
      <span class="small-muted">${feitas}/${tarefas.length}</span>
      <div class="day-prog-bar"><div class="day-prog-fill progress-fill-animated" data-progress-key="${progressKey}" data-percent="${percent}" data-start-percent="${initialPercent}" style="width:${initialPercent}%"></div></div>
      <span class="small-highlight progress-percent" data-progress-key="${progressKey}" data-percent="${percent}" data-start-percent="${initialPercent}">${initialPercent}%</span>
    </div>
  `;
}

function animateRoutineProgress() {
  document.querySelectorAll('.progress-percent').forEach(label => {
    const progressKey = label.dataset.progressKey;
    const target = Number(label.dataset.percent || 0);
    const start = Number(label.dataset.startPercent || target);
    const fill = document.querySelector(`.progress-fill-animated[data-progress-key="${progressKey}"]`);

    if (!progressKey || start === target) {
      label.textContent = `${target}%`;
      if (fill) fill.style.width = `${target}%`;
      if (progressKey) uiState.progressoAnterior[progressKey] = target;
      return;
    }

    const duration = PROGRESS_ANIMATION_MS;
    const startedAt = performance.now();
    if (fill) fill.classList.add('progress-animating');

    const tick = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const current = Math.round(start + ((target - start) * eased));
      label.textContent = `${current}%`;
      if (fill) fill.style.width = `${start + ((target - start) * eased)}%`;
      if (progress < 1) requestAnimationFrame(tick);
      else {
        if (fill) fill.classList.remove('progress-animating');
        uiState.progressoAnterior[progressKey] = target;
      }
    };

    requestAnimationFrame(tick);
  });
}

function getTaskStatusForDate(tarefa, dateKey) {
  const record = getTaskRecord(tarefa.id, getTaskProgressKey(tarefa, dateKey));
  if (record?.status === 'feito') return 'feita';
  if (record?.status === 'nao_feito') return 'nao_feita';
  return 'pendente';
}

function matchesTaskFilter(tarefa, dateKey) {
  if (uiState.rotinaFiltro === 'todas') return true;
  const filterStatus = {
    pendentes: 'pendente',
    feitas: 'feita',
    nao_feitas: 'nao_feita',
  };
  return getTaskStatusForDate(tarefa, dateKey) === filterStatus[uiState.rotinaFiltro];
}

function sortTasksByStatus(tarefas, dateKey) {
  const order = { pendente: 0, feita: 1, nao_feita: 2 };
  return [...tarefas].sort((a, b) => order[getTaskStatusForDate(a, dateKey)] - order[getTaskStatusForDate(b, dateKey)]);
}

function updateRoutineDaySummary(tarefasDoDia) {
  const summary = document.getElementById('routine-day-summary');
  if (!summary) return;

  const counts = tarefasDoDia.reduce((acc, tarefa) => {
    acc[getTaskStatusForDate(tarefa, uiState.dataSelecionada)] += 1;
    return acc;
  }, { pendente: 0, feita: 0, nao_feita: 0 });

  const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

  summary.innerHTML = `
    <span class="summary-pill pending">${pluralize(counts.pendente, 'Pendente', 'Pendentes')}</span>
    <span class="summary-pill done">${pluralize(counts.feita, 'Concluída', 'Concluídas')}</span>
    <span class="summary-pill missed">${pluralize(counts.nao_feita, 'Não concluída', 'Não concluídas')}</span>
  `;
}

function renderTaskLists() {
  const oneOffList = document.getElementById('unica-list');
  const diarioList = document.getElementById('diario-list');
  const semanalList = document.getElementById('semanal-list');
  const mensalList = document.getElementById('mensal-list');
  const anualList = document.getElementById('anual-list');
  if (!oneOffList || !diarioList || !semanalList || !mensalList || !anualList) return;

  const matchesSearch = tarefa => {
    if (!uiState.buscaCompartilhada) return true;
    const meta = tarefa.metaId ? store.metas.find(item => item.id === tarefa.metaId) : null;
    const categoria = meta ? store.categorias.find(item => item.id === meta.catId) : null;
    const haystack = [
      tarefa.nome,
      tarefa.comentario || '',
      getRecurrenceLabel(tarefa),
      meta?.titulo || '',
      categoria?.nome || '',
    ].join(' ').toLowerCase();
    return haystack.includes(uiState.buscaCompartilhada);
  };

  const occursToday = item => taskOccursOnDate(item, uiState.dataSelecionada);
  const visibleInList = item => occursToday(item) && matchesSearch(item) && matchesTaskFilter(item, uiState.dataSelecionada);
  const allDayTasks = store.tarefas.filter(occursToday);

  updateRoutineDaySummary(allDayTasks);

  const doDia = sortTasksByStatus(store.tarefas.filter(item => item.recorrencia === 'unica' && visibleInList(item)), uiState.dataSelecionada);
  const diarias = sortTasksByStatus(store.tarefas.filter(item => item.recorrencia === 'diario' && visibleInList(item)), uiState.dataSelecionada);
  const semanais = sortTasksByStatus(store.tarefas.filter(item => item.recorrencia === 'semanal' && visibleInList(item)), uiState.dataSelecionada);
  const mensais = sortTasksByStatus(store.tarefas.filter(item => item.recorrencia === 'mensal' && visibleInList(item)), uiState.dataSelecionada);
  const anuais = sortTasksByStatus(store.tarefas.filter(item => item.recorrencia === 'anual' && visibleInList(item)), uiState.dataSelecionada);

  oneOffList.innerHTML = buildSectionProgress('unica', doDia, true) + (
    doDia.length
      ? doDia.map(item => buildTaskItem(item, uiState.dataSelecionada)).join('')
      : '<div class="empty-state">Nenhuma Tarefa Desta Data.</div>'
  );

  diarioList.innerHTML = buildSectionProgress('diario', diarias, true) + (
    diarias.length
      ? diarias.map(item => buildTaskItem(item, uiState.dataSelecionada)).join('')
      : '<div class="empty-state">Nenhuma Tarefa Diária Neste Dia.</div>'
  );

  semanalList.innerHTML = buildSectionProgress('semanal', semanais, true) + (
    semanais.length
      ? semanais.map(item => buildTaskItem(item, uiState.dataSelecionada)).join('')
      : '<div class="empty-state">Nenhuma Tarefa Semanal.</div>'
  );

  mensalList.innerHTML = buildSectionProgress('mensal', mensais, true) + (
    mensais.length
      ? mensais.map(item => buildTaskItem(item, uiState.dataSelecionada)).join('')
      : '<div class="empty-state">Nenhuma Tarefa Mensal.</div>'
  );

  anualList.innerHTML = buildSectionProgress('anual', anuais, true) + (
    anuais.length
      ? anuais.map(item => buildTaskItem(item, uiState.dataSelecionada)).join('')
      : '<div class="empty-state">Nenhuma Tarefa Anual.</div>'
  );

  decorateTaskCards();
  animateRoutineProgress();
  syncRoutineUI();
}

function decorateTaskCards() {
  document.querySelectorAll('.task-item').forEach(card => {
    const taskId = card.dataset.taskId;
    if (!taskId) return;

    const tarefa = store.tarefas.find(item => item.id === taskId);
    if (!tarefa) return;

    const badge = card.querySelector('.task-meta-row .badge-purple');
    if (badge) badge.textContent = getTaskTypeLabel(tarefa);
  });
}

function buildTaskItem(tarefa, viewDate) {
  const progressKey = getTaskProgressKey(tarefa, viewDate);
  const registro = getTaskRecord(tarefa.id, progressKey);
  const meta = tarefa.metaId ? store.metas.find(item => item.id === tarefa.metaId) : null;
  const categoria = meta ? store.categorias.find(item => item.id === meta.catId) : null;
  const isDone = registro?.status === 'feito';
  const isMissed = registro?.status === 'nao_feito';
  const flags = getTaskHighlightFlags(tarefa, viewDate);

  const hasStartTime = Boolean(tarefa.inicio);
  const hasFixedTime = Boolean(tarefa.inicio && tarefa.fim);
  const timeLabel = hasFixedTime ? `${tarefa.inicio}-${tarefa.fim}` : (hasStartTime ? `Inicia ${tarefa.inicio}` : 'Sem Horário');
  const durationValue = registro?.duracaoMinutos || (hasFixedTime ? calcDurationMinutes(tarefa.inicio, tarefa.fim) : 0);
  const durationLabel = hasFixedTime ? `<span class="task-time-note">(${formatMinutes(durationValue)})</span>` : '';
  const completedLabel = isDone && registro?.completedAt
    ? `<span class="task-completed-at">finalizada ${escapeHtml(registro.completedAt)}</span>`
    : '';

  const metaBlock = meta
    ? (() => {
        const progress = getMetaProgress(meta.id, meta.prazo, viewDate);
        const percent = Math.min(100, Math.round((progress / meta.alvo) * 100));
        return `
          <div class="task-meta-row">
            <span class="badge badge-${categoria?.cor || 'blue'}">${escapeHtml(categoria?.nome || 'Categoria')} > ${escapeHtml(meta.titulo)}</span>
            <div class="task-meta-prog">
              <span class="tiny-muted">${progress.toFixed(1)}/${meta.alvo} ${meta.unidade}</span>
              <div class="task-prog-bar"><div class="task-prog-fill ${percent >= 100 ? 'complete' : ''}" style="width:${percent}%"></div></div>
              <span class="tiny-muted">${percent}%</span>
            </div>
          </div>
        `;
      })()
    : '<div class="task-meta-row"><span class="badge badge-habit">Hábito</span></div>';

  const isCommentCollapsed = Boolean(uiState.comentariosMinimizados[tarefa.id]);
  const commentBlock = tarefa.comentario
    ? `
      <div class="task-comment-wrap">
        <button type="button" class="comment-toggle" onclick="toggleTaskComment('${tarefa.id}')" title="${isCommentCollapsed ? 'Mostrar Comentario' : 'Ocultar Comentario'}">
          <span class="comment-arrow">${isCommentCollapsed ? '&#9656;' : '&#9662;'}</span>
        </button>
        ${isCommentCollapsed ? '<span class="task-comment-collapsed">Comentario oculto</span>' : `<div class="task-comment">${escapeHtml(tarefa.comentario)}</div>`}
      </div>
    `
    : '';

  const durationEditor = true
    ? `
      <div class="dur-area">
        <button type="button" class="icon-btn" onclick="toggleDur('${tarefa.id}')" title="Registrar Tempo">◷</button>
        ${registro?.duracaoMinutos ? `<span class="duration-chip">${formatMinutes(registro.duracaoMinutos)}</span>` : ''}
        <div id="dur-${tarefa.id}" class="dur-inline">
          <input type="time" id="durv-${tarefa.id}" value="${registro?.duracaoMinutos ? String(Math.floor(registro.duracaoMinutos / 60)).padStart(2, '0') + ':' + String(registro.duracaoMinutos % 60).padStart(2, '0') : ''}" class="dur-input-time">
          <button type="button" class="btn-sm" onclick="saveDur('${tarefa.id}')">Ok</button>
        </div>
      </div>
    `
    : '';

  return `
    <div class="task-item${isDone ? ' task-done' : ''}${isMissed ? ' task-not' : ''}" data-task-id="${tarefa.id}">
      <div class="task-status">
        <button type="button" class="status-btn check${isDone ? ' active' : ''}" onclick="setStatus('${tarefa.id}', 'feito')" title="Marcar Como Feito">✓</button>
        <button type="button" class="status-btn cross${isMissed ? ' active' : ''}" onclick="setStatus('${tarefa.id}', 'nao_feito')" title="Marcar Como Não Feito">✕</button>
      </div>
      <div class="task-body">
        <div>
          <span class="task-time${hasStartTime ? '' : ' notime'}">${timeLabel}</span>
          ${durationLabel}
          <span class="task-name${isDone ? ' done' : ''}${isMissed ? ' missed' : ''}">${escapeHtml(tarefa.nome)}</span>
          ${completedLabel}
        </div>
        <div class="task-meta-row">
          <span class="badge badge-purple">${getTaskTypeLabel(tarefa)}</span>
          ${flags.length ? `<div class="section-flags">${flags.map(flag => `<span class="section-flag${flag.active ? ' active' : ''}">${flag.label}</span>`).join('')}</div>` : ''}
        </div>
        ${metaBlock}
        ${commentBlock}
      </div>
      <div class="task-actions">
        <button type="button" class="icon-btn" onclick="startEditTask('${tarefa.id}')" title="Editar Tarefa">✎</button>
        ${durationEditor}
        <button type="button" class="del-btn" onclick="delTarefa('${tarefa.id}')">×</button>
      </div>
    </div>
  `;
}

function onAddMetaChange(options = {}) {
  const metaId = document.getElementById('t-meta').value;
  const nomeInput = document.getElementById('t-nome');
  const nomeLabel = document.getElementById('t-nome-label');
  if (!nomeInput || !nomeLabel) return;

  if (!metaId) {
    nomeInput.style.display = '';
    nomeLabel.style.display = 'none';
    if (!options.preserveName) nomeInput.value = '';
    return;
  }

  const meta = store.metas.find(item => item.id === metaId);
  nomeInput.style.display = 'none';
  nomeLabel.style.display = 'inline-block';
  nomeLabel.textContent = meta ? meta.titulo : '';
}

function addTarefa() {
  runSafely('addTarefa', () => {
    const recurrence = document.getElementById('t-rec').value;
    const metaId = document.getElementById('t-meta').value || null;
    const nome = metaId
      ? store.metas.find(item => item.id === metaId)?.titulo || ''
      : document.getElementById('t-nome').value.trim();

    if (!nome) throw new Error('Informe um nome para a tarefa ou selecione uma meta.');

    const inicio = document.getElementById('t-inicio').value || null;
    const fim = document.getElementById('t-fim').value || null;

    if (recurrence === 'diario' || recurrence === 'unica') {
      validateTimeRange(inicio, fim, 'Uma tarefa com horário');
    }

    const selectedWeekdays = getSelectedWeekdays();
    const annualMode = document.getElementById('t-anual-modo')?.value || 'flexivel';
    const annualDate = recurrence === 'anual' && annualMode === 'dia' ? (document.getElementById('t-data-anual').value || uiState.dataSelecionada) : null;
    const annualMonth = recurrence === 'anual' && annualMode === 'mes' ? (document.getElementById('t-mes-anual').value || uiState.dataSelecionada.slice(0, 7)) : null;
    const payload = {
      nome,
      metaId,
      recorrencia: recurrence,
      inicio: recurrence === 'semanal' || recurrence === 'mensal' || recurrence === 'anual' ? null : inicio,
      fim: recurrence === 'semanal' || recurrence === 'mensal' || recurrence === 'anual' ? null : fim,
      diasSemana: recurrence === 'diario' || recurrence === 'semanal' ? selectedWeekdays : [],
      dataUnica: recurrence === 'unica' ? (document.getElementById('t-data-unica').value || uiState.dataSelecionada) : null,
      dataMensal: recurrence === 'mensal' ? (document.getElementById('t-data-mensal').value || null) : null,
      dataAnual: recurrence === 'anual' ? annualDate : null,
      mesAnual: recurrence === 'anual' ? annualMonth : null,
      comentario: document.getElementById('t-comentario').value.trim(),
      startDate: getTaskStartDate({
        recorrencia: recurrence,
        diasSemana: recurrence === 'diario' || recurrence === 'semanal' ? selectedWeekdays : [],
        dataUnica: recurrence === 'unica' ? (document.getElementById('t-data-unica').value || uiState.dataSelecionada) : null,
        dataMensal: recurrence === 'mensal' ? (document.getElementById('t-data-mensal').value || null) : null,
        dataAnual: recurrence === 'anual' ? annualDate : null,
        mesAnual: recurrence === 'anual' ? annualMonth : null,
      }, uiState.dataSelecionada),
    };

    if (recurrence === 'unica' && !payload.dataUnica) {
      throw new Error('Escolha a data da tarefa única.');
    }

    if (recurrence === 'anual' && annualMode === 'dia' && !payload.dataAnual) {
      throw new Error('Escolha a data anual da tarefa.');
    }

    if (recurrence === 'anual' && annualMode === 'mes' && !payload.mesAnual) {
      throw new Error('Escolha o mes anual da tarefa.');
    }

    if (recurrence === 'diario' && !payload.diasSemana.length) {
      throw new Error('Selecione pelo menos um dia da semana para a tarefa diária.');
    }

    if (uiState.editandoTarefaId) {
      dataService.updateTask(uiState.editandoTarefaId, payload, uiState.dataSelecionada);
    } else {
      dataService.addTask(payload);
    }

    document.getElementById('t-meta').value = '';
    document.getElementById('t-nome').value = '';
    document.getElementById('t-inicio').value = '';
    document.getElementById('t-fim').value = '';
    document.getElementById('t-comentario').value = '';
    document.getElementById('t-data-unica').value = uiState.dataSelecionada;
    const monthlyDateInput = document.getElementById('t-data-mensal');
    if (monthlyDateInput) monthlyDateInput.value = uiState.dataSelecionada;
    document.getElementById('t-anual-modo').value = 'flexivel';
    document.getElementById('t-data-anual').value = uiState.dataSelecionada;
    document.getElementById('t-mes-anual').value = uiState.dataSelecionada.slice(0, 7);
    document.querySelectorAll('#weekday-selector input').forEach(input => {
      input.checked = true;
    });
    onAddMetaChange();
    onTaskTypeChange();
    uiState.editandoTarefaId = null;
    uiState.rotinaFormularioAberto = false;
    renderRotina();
    const apareceHoje = recurrence === 'diario' ? taskOccursOnDate(normalizeTask(payload), uiState.dataSelecionada) : true;
    const message = recurrence === 'diario' && !apareceHoje
      ? `Tarefa salva com sucesso. Ela aparecerá em: ${selectedWeekdays.map(dia => WEEKDAY_OPTIONS.find(item => item.value === dia)?.label).join(', ')}.`
      : 'Tarefa salva com sucesso.';
    showFeedback('success', message);
  });
}

/* Renderização e ações da página de metas. */
function renderMetas() {
  const categorySelect = document.getElementById('m-cat');
  const overview = document.getElementById('metas-overview');
  const categoryList = document.getElementById('cat-list');
  if (!categorySelect || !overview || !categoryList) return;

  renderCalendar();
  updateSelectedDateLabel();
  syncMetasUI();

  categorySelect.innerHTML = store.categorias.length
    ? store.categorias.map(item => `<option value="${item.id}">${escapeHtml(item.nome)}</option>`).join('')
    : '<option value="">Crie Uma Categoria Primeiro</option>';

  const visibleCategories = getVisibleCategoriesForMetas();
  const visibleMetas = visibleCategories.flatMap(categoria => getVisibleMetasForCategory(categoria));

  if (!store.metas.length) {
    overview.style.display = 'none';
  } else {
    const completed = visibleMetas.filter(item => getMetaProgress(item.id, item.prazo, uiState.dataSelecionada) >= item.alvo).length;
    overview.style.display = 'grid';
    overview.innerHTML = `
      <div class="metric"><div class="metric-label">Metas Visiveis</div><div class="metric-value">${visibleMetas.length}</div></div>
      <div class="metric"><div class="metric-label">Concluídas</div><div class="metric-value success">${completed}</div></div>
      <div class="metric"><div class="metric-label">Categorias</div><div class="metric-value metric-small">${visibleCategories.length}</div></div>
    `;
  }

  categoryList.innerHTML = visibleCategories.length
    ? visibleCategories.map(buildCategoryCard).join('')
    : `<div class="empty-state">${uiState.buscaCompartilhada ? 'Nenhum Resultado Encontrado.' : 'Nenhuma Categoria Ainda.'}</div>`;

  animateRoutineProgress();
}

function syncMetasUI() {
  const searchInput = document.getElementById('meta-search');
  const categoryForm = document.getElementById('category-form-card');
  const metaForm = document.getElementById('meta-form-card');
  const categoryButton = document.getElementById('cat-submit-button');
  const metaButton = document.getElementById('meta-submit-button');

  if (searchInput) searchInput.value = uiState.buscaCompartilhada;
  if (categoryForm) categoryForm.style.display = uiState.categoriaFormularioAberto ? '' : 'none';
  if (metaForm) metaForm.style.display = uiState.metaFormularioAberto ? '' : 'none';
  if (categoryButton) categoryButton.textContent = uiState.editandoCategoriaId ? 'Salvar Categoria' : 'Criar Categoria';
  if (metaButton) metaButton.textContent = uiState.editandoMetaId ? 'Salvar Alteracoes' : 'Salvar Meta';
}

function toggleCategoryForm() {
  uiState.categoriaFormularioAberto = !uiState.categoriaFormularioAberto;
  if (!uiState.categoriaFormularioAberto) resetCategoryForm();
  syncMetasUI();
}

function closeCategoryForm() {
  resetCategoryForm();
  uiState.categoriaFormularioAberto = false;
  syncMetasUI();
}

function toggleMetaForm() {
  uiState.metaFormularioAberto = !uiState.metaFormularioAberto;
  if (!uiState.metaFormularioAberto) resetMetaForm();
  syncMetasUI();
}

function closeMetaForm() {
  resetMetaForm();
  uiState.metaFormularioAberto = false;
  syncMetasUI();
}

function resetCategoryForm() {
  uiState.editandoCategoriaId = null;
  const nameInput = document.getElementById('cat-nome');
  const colorInput = document.getElementById('cat-cor');
  const commentInput = document.getElementById('cat-comentario');
  if (nameInput) nameInput.value = '';
  if (colorInput) colorInput.value = 'blue';
  if (commentInput) commentInput.value = '';
}

function resetMetaForm() {
  uiState.editandoMetaId = null;
  const titleInput = document.getElementById('m-titulo');
  const targetInput = document.getElementById('m-alvo');
  const unitInput = document.getElementById('m-unidade');
  const deadlineInput = document.getElementById('m-prazo');
  if (titleInput) titleInput.value = '';
  if (targetInput) targetInput.value = '';
  if (unitInput) unitInput.value = 'horas';
  if (deadlineInput) deadlineInput.value = 'mensal';
}

function startEditCategory(categoryId) {
  const categoria = store.categorias.find(item => item.id === categoryId);
  if (!categoria) return;
  uiState.editandoCategoriaId = categoryId;
  uiState.categoriaFormularioAberto = true;
  renderMetas();
  document.getElementById('cat-nome').value = categoria.nome || '';
  document.getElementById('cat-cor').value = categoria.cor || 'blue';
  document.getElementById('cat-comentario').value = categoria.comentario || '';
  syncMetasUI();
}

function startEditMeta(metaId) {
  const meta = store.metas.find(item => item.id === metaId);
  if (!meta) return;
  uiState.editandoMetaId = metaId;
  uiState.metaFormularioAberto = true;
  renderMetas();
  document.getElementById('m-cat').value = meta.catId || '';
  document.getElementById('m-titulo').value = meta.titulo || '';
  document.getElementById('m-alvo').value = meta.alvo || '';
  document.getElementById('m-unidade').value = meta.unidade === 'paginas' ? 'vezes' : (meta.unidade || 'horas');
  document.getElementById('m-prazo').value = meta.prazo || 'mensal';
  syncMetasUI();
}

function toggleCategoryCollapse(categoryId) {
  uiState.categoriasMinimizadas[categoryId] = !uiState.categoriasMinimizadas[categoryId];
  renderMetas();
}

function toggleCompletedTasks(metaId) {
  uiState.tarefasConcluidasExpandidas[metaId] = !uiState.tarefasConcluidasExpandidas[metaId];
  renderMetas();
}

function getVisibleCategoriesForMetas() {
  if (!uiState.buscaCompartilhada) return store.categorias;
  return store.categorias.filter(categoria => {
    const metas = store.metas.filter(meta => meta.catId === categoria.id);
    return matchesMetaSearch(categoria, null) || metas.some(meta => matchesMetaSearch(categoria, meta));
  });
}

function getVisibleMetasForCategory(categoria) {
  const metas = store.metas.filter(item => item.catId === categoria.id);
  if (!uiState.buscaCompartilhada || matchesMetaSearch(categoria, null)) return metas;
  return metas.filter(meta => matchesMetaSearch(categoria, meta));
}

function matchesMetaSearch(categoria, meta) {
  if (!uiState.buscaCompartilhada) return true;

  const linkedTasks = meta
    ? store.tarefas.filter(item => item.metaId === meta.id).map(item => item.nome)
    : [];
  const haystack = [
    categoria?.nome || '',
    categoria?.comentario || '',
    meta?.titulo || '',
    meta?.unidade || '',
    meta?.prazo || '',
    ...linkedTasks,
  ].join(' ').toLowerCase();

  return haystack.includes(uiState.buscaCompartilhada);
}

function buildCategoryCard(categoria) {
  const metas = getVisibleMetasForCategory(categoria);
  const isCollapsed = Boolean(uiState.categoriasMinimizadas[categoria.id]);
  const commentHtml = categoria.comentario
    ? `<div class="cat-comment">${escapeHtml(categoria.comentario)}</div>`
    : '';

  return `
    <div class="cat-card">
      <div class="cat-header">
        <div class="cat-left">
          <div class="cat-dot cat-dot-${categoria.cor}"></div>
          <button type="button" class="cat-toggle" onclick="toggleCategoryCollapse('${categoria.id}')" title="${isCollapsed ? 'Expandir' : 'Minimizar'}">
            <span class="section-arrow">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
            <span class="cat-nome">${escapeHtml(categoria.nome)}</span>
          </button>
          <span class="tiny-muted">${metas.length} ${metas.length === 1 ? 'Meta' : 'Metas'}</span>
        </div>
        <div class="cat-actions">
          <button type="button" class="icon-btn" onclick="startEditCategory('${categoria.id}')" title="Editar Categoria">✎</button>
          <button type="button" class="del-btn" onclick="delCategoria('${categoria.id}')">×</button>
        </div>
      </div>
      ${commentHtml}
      <div class="cat-body${isCollapsed ? ' collapsed' : ''}">
        ${metas.length ? metas.map(buildMetaItem).join('') : '<div class="empty-state">Nenhuma Meta.</div>'}
      </div>
    </div>
  `;
}

function buildMetaItem(meta) {
  const progress = getMetaProgress(meta.id, meta.prazo, uiState.dataSelecionada);
  const percent = Math.min(100, Math.round((progress / meta.alvo) * 100));
  const progressKey = `meta:${meta.id}`;
  const initialPercent = uiState.progressoAnterior[progressKey] ?? 0;
  const complete = percent >= 100;
  const isHistoryOpen = Boolean(uiState.tarefasConcluidasExpandidas[meta.id]);
  const linkedTasks = store.tarefas.filter(item => item.metaId === meta.id);
  const linkedHtml = buildCompletedTasksSummary(meta.id, linkedTasks, isHistoryOpen);

  return `
    <div class="meta-item">
      <div class="meta-header">
        <span class="meta-titulo">${escapeHtml(meta.titulo)}${complete ? ' ✓' : ''}</span>
        <div class="meta-stats">
          <span class="badge badge-${meta.prazo}">${meta.prazo}</span>
          <span class="small-muted">${progress.toFixed(1)} / ${meta.alvo} ${meta.unidade}</span>
          <button type="button" class="icon-btn" onclick="startEditMeta('${meta.id}')" title="Editar Meta">✎</button>
          <button type="button" class="del-btn" onclick="delMeta('${meta.id}')">×</button>
        </div>
      </div>
      <div class="meta-collapsible">
        <div class="prog-wrap">
          <div class="prog-bar"><div class="prog-fill progress-fill-animated${complete ? ' complete' : ''}" data-progress-key="${progressKey}" data-percent="${percent}" data-start-percent="${initialPercent}" style="width:${initialPercent}%"></div></div>
          <span class="prog-pct progress-percent" data-progress-key="${progressKey}" data-percent="${percent}" data-start-percent="${initialPercent}">${initialPercent}%</span>
        </div>
        ${linkedHtml}
        <div class="log-form" id="log-${meta.id}">
          <div class="form-row no-margin">
            <input type="number" id="logv-${meta.id}" placeholder="${meta.unidade}" step="0.5" min="0" class="log-input">
            <input type="date" id="logd-${meta.id}" value="${uiState.dataSelecionada}" class="log-date">
            <button type="button" class="btn btn-primary btn-inline" onclick="addLog('${meta.id}')">Registrar</button>
            <button type="button" class="btn btn-inline" onclick="toggleLogForm('${meta.id}')">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildCompletedTasksSummary(metaId, linkedTasks, isOpen) {
  if (!linkedTasks.length) return '';

  const completed = linkedTasks.flatMap(tarefa => store.registros
    .filter(registro => registro.tarefaId === tarefa.id && registro.status === 'feito')
    .map(registro => ({ tarefa, registro })))
    .sort((a, b) => `${b.registro.completedDate || b.registro.data} ${b.registro.completedAt || ''}`.localeCompare(`${a.registro.completedDate || a.registro.data} ${a.registro.completedAt || ''}`));

  const listHtml = completed.length
    ? `<div class="completed-task-list">
        ${completed.map(({ tarefa, registro }) => `
          <div class="completed-task-row">
            <div>
              <div class="completed-task-name">${escapeHtml(tarefa.nome)}</div>
              ${tarefa.comentario ? `<div class="completed-task-comment">${escapeHtml(tarefa.comentario)}</div>` : ''}
            </div>
            <div class="completed-task-date">
              ${formatDateShort(registro.completedDate || registro.data)}
              ${registro.completedAt ? `<span>${escapeHtml(registro.completedAt)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`
    : '<div class="empty-state">Nenhuma tarefa concluida vinculada a esta meta.</div>';

  return `
    <div class="linked-tasks">
      <button type="button" class="linked-tasks-toggle" onclick="toggleCompletedTasks('${metaId}')">
        <span class="section-arrow">${isOpen ? '&#9662;' : '&#9656;'}</span>
        <span>Tarefas concluidas (${completed.length})</span>
      </button>
      ${isOpen ? listHtml : ''}
    </div>
  `;
}

function toggleLogForm(metaId) {
  const panel = document.getElementById(`log-${metaId}`);
  if (panel) panel.classList.toggle('open');
}

function addLog(metaId) {
  runSafely('addLog', () => {
    const value = parseFloat(document.getElementById(`logv-${metaId}`).value);
    if (!value) throw new Error('Informe um valor para registrar no log da meta.');

    dataService.addMetaLog({
      metaId,
      valor: value,
      data: document.getElementById(`logd-${metaId}`).value || getToday(),
    });

    document.getElementById(`logv-${metaId}`).value = '';
    renderMetas();
    showFeedback('success', 'Registro da meta salvo com sucesso.');
  });
}

function delMeta(metaId) {
  if (!confirm('Confirma a exclusão desta meta?')) return;
  runSafely('delMeta', () => {
    dataService.deleteMeta(metaId);
    renderMetas();
    showFeedback('success', 'Meta excluída com sucesso.');
  });
}

function addMeta() {
  runSafely('addMeta', () => {
    const catId = document.getElementById('m-cat').value;
    const titulo = document.getElementById('m-titulo').value.trim();
    const alvo = parseFloat(document.getElementById('m-alvo').value);
    const unidade = document.getElementById('m-unidade').value;
    const prazo = document.getElementById('m-prazo').value;

    if (!store.categorias.length) throw new Error('Crie uma categoria primeiro antes de cadastrar uma meta.');
    if (!catId) throw new Error('Selecione uma categoria para a meta.');
    if (!titulo) throw new Error('Informe o título da meta.');
    if (!alvo) throw new Error('Informe um valor de meta válido.');

    if (uiState.editandoMetaId) {
      dataService.updateMeta(uiState.editandoMetaId, { catId, titulo, alvo, unidade, prazo });
    } else {
      dataService.addMeta({ catId, titulo, alvo, unidade, prazo });
    }

    document.getElementById('m-titulo').value = '';
    document.getElementById('m-alvo').value = '';
    uiState.editandoMetaId = null;
    uiState.metaFormularioAberto = false;
    renderMetas();
    showFeedback('success', 'Meta salva com sucesso.');
  });
}

function delCategoria(categoryId) {
  if (!confirm('Confirma a exclusão desta categoria e das metas vinculadas?')) return;
  runSafely('delCategoria', () => {
    dataService.deleteCategory(categoryId);
    renderMetas();
    renderRotina();
    showFeedback('success', 'Categoria excluída com sucesso.');
  });
}

function addCategoria() {
  runSafely('addCategoria', () => {
    const nome = document.getElementById('cat-nome').value.trim();
    if (!nome) throw new Error('Informe o nome da categoria.');

    const payload = {
      nome,
      cor: document.getElementById('cat-cor').value,
      comentario: document.getElementById('cat-comentario').value.trim(),
    };

    if (uiState.editandoCategoriaId) {
      dataService.updateCategory(uiState.editandoCategoriaId, payload);
    } else {
      dataService.addCategory(payload);
    }

    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-comentario').value = '';
    uiState.editandoCategoriaId = null;
    uiState.categoriaFormularioAberto = false;
    renderMetas();
    renderRotina();
    showFeedback('success', 'Categoria salva com sucesso.');
  });
}

/* Renderização e ações da página financeira. */
function renderFinanceiro() {
  const metrics = document.getElementById('fin-metrics');
  const list = document.getElementById('tx-list');
  if (!metrics || !list) return;

  const entradas = store.transacoes.filter(item => item.tipo === 'in').reduce((sum, item) => sum + item.val, 0);
  const saidas = store.transacoes.filter(item => item.tipo === 'out').reduce((sum, item) => sum + item.val, 0);
  const saldo = entradas - saidas;

  metrics.innerHTML = `
    <div class="metric"><div class="metric-label">Entradas</div><div class="metric-value success">R$ ${formatMoney(entradas)}</div></div>
    <div class="metric"><div class="metric-label">Saídas</div><div class="metric-value danger">R$ ${formatMoney(saidas)}</div></div>
    <div class="metric"><div class="metric-label">Saldo</div><div class="metric-value ${saldo >= 0 ? 'success' : 'danger'}">R$ ${formatMoney(saldo)}</div></div>
    <div class="metric"><div class="metric-label">Transações</div><div class="metric-value metric-small">${store.transacoes.length}</div></div>
  `;

  const items = [...store.transacoes].reverse();
  list.innerHTML = items.length
    ? items.map(item => `
        <div class="tx-row">
          <div>
            <div>${escapeHtml(item.desc)}</div>
            <div class="tx-cat">${escapeHtml(item.cat)}</div>
          </div>
          <div class="tx-actions">
            <span class="amount ${item.tipo}">${item.tipo === 'in' ? '+' : '-'} R$ ${formatMoney(item.val)}</span>
            <button type="button" class="del-btn" onclick="delTx('${item.id}')">×</button>
          </div>
        </div>
      `).join('')
    : '<div class="empty-state">Nenhuma Transação.</div>';
}

function delTx(transactionId) {
  if (!confirm('Confirma a exclusão desta transação?')) return;
  runSafely('delTx', () => {
    dataService.deleteTransaction(transactionId);
    renderFinanceiro();
    showFeedback('success', 'Transação excluída com sucesso.');
  });
}

function addTx() {
  runSafely('addTx', () => {
    const desc = document.getElementById('tx-desc').value.trim();
    const val = parseFloat(document.getElementById('tx-val').value);
    if (!desc) throw new Error('Informe a descrição da transação.');
    if (!val) throw new Error('Informe um valor válido para a transação.');

    dataService.addTransaction({
      tipo: document.getElementById('tx-tipo').value,
      desc,
      val,
      cat: document.getElementById('tx-cat').value.trim() || 'Outros',
    });

    document.getElementById('tx-desc').value = '';
    document.getElementById('tx-val').value = '';
    document.getElementById('tx-cat').value = '';
    renderFinanceiro();
    showFeedback('success', 'Transação salva com sucesso.');
  });
}

/* Carregamento das páginas por aba. */
async function loadPage(name) {
  if (uiState.cachePaginas[name]) return uiState.cachePaginas[name];

  try {
    const response = await fetch(`pages/${name}.html`);
    if (!response.ok) throw new Error(`Página não encontrada: ${name}`);
    const html = await response.text();
    uiState.cachePaginas[name] = html;
    return html;
  } catch (error) {
    console.error(`Erro ao carregar a página "${name}".`, error);
    throw error;
  }
}

async function switchTab(name, button) {
  if (uiState.paginaAtual === name) return;
  uiState.paginaAtual = name;

  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  if (button) button.classList.add('active');

  try {
    document.getElementById('page-content').innerHTML = await loadPage(name);
    renderCurrentPage();
  } catch (error) {
    document.getElementById('page-content').innerHTML =
      `<div class="empty-state error-state">Erro: ${error.message}</div>`;
  }
}

function renderCurrentPage() {
  if (uiState.paginaAtual === 'rotina') renderRotina();
  if (uiState.paginaAtual === 'metas') renderMetas();
  if (uiState.paginaAtual === 'financeiro') renderFinanceiro();
}

function checkDayChange() {
  const now = getToday();
  if (now === uiState.ultimoDiaRenderizado) return;
  processPendingRollovers();
  uiState.ultimoDiaRenderizado = now;
  uiState.dataSelecionada = now;
  renderCurrentPage();
}

function bindTimeWheelInputs() {
  document.querySelectorAll('input[type="time"]').forEach(input => {
    if (input.dataset.wheelBound === 'true') return;

    input.addEventListener('wheel', event => {
      if (document.activeElement !== input) return;
      event.preventDefault();
      const current = input.value || '00:00';
      let minutes = timeToMinutes(current) ?? 0;
      minutes += event.deltaY < 0 ? 1 : -1;

      if (minutes < 0) minutes = 1439;
      if (minutes > 1439) minutes = 0;

      const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mins = String(minutes % 60).padStart(2, '0');
      input.value = `${hours}:${mins}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { passive: false });

    input.dataset.wheelBound = 'true';
  });
}

async function bootstrap() {
  try {
    processPendingRollovers();
    updateSaveStatus('saved', 'Salvo Neste Navegador');
    const firstTab = document.querySelector('.tab');
    await switchTab('rotina', firstTab);
    bindTimeWheelInputs();
    document.addEventListener('focusin', bindTimeWheelInputs);
  } catch (error) {
    console.error('Erro ao iniciar a aplicação.', error);
    updateSaveStatus('error', 'Erro Ao Iniciar');
    showFeedback('error', 'Não foi possível iniciar a aplicação.', true);
  }
}

setInterval(checkDayChange, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushPersist();
    return;
  }
  checkDayChange();
});
window.addEventListener('pagehide', flushPersist);

bootstrap();

