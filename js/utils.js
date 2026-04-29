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

/* Estrutura principal dos dados. Esta Ã© a base que depois pode ser migrada para banco. */
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
    throw new Error(`${contextLabel} nÃ£o pode terminar no dia seguinte. Ajuste o horÃ¡rio final para antes de 00:00.`);
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
    console.error('Erro ao carregar a Ãºltima data processada.', error);
    return getToday();
  }
}

function saveLastRolloverDate(dateStr) {
  try {
    localStorage.setItem(APP_LAST_ROLLOVER_KEY, dateStr);
  } catch (error) {
    console.error('Erro ao salvar a Ãºltima data processada.', error);
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
    return 'Anual Flexível';
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
