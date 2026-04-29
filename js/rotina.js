function validateTaskCanBeMarked(tarefa, dateKey) {
  if (tarefa.recorrencia === 'semanal' && tarefa.diasSemana.length) {
    const allowed = tarefa.diasSemana.includes(getIsoWeekday(dateKey));
    if (!allowed) {
      throw new Error(`Essa tarefa sÃ³ pode ser marcada nos dias: ${tarefa.diasSemana.map(dia => WEEKDAY_OPTIONS.find(item => item.value === dia).label).join(', ')}.`);
    }
  }

  if (tarefa.recorrencia === 'mensal' && tarefa.dataMensal) {
    const expectedDay = Number(tarefa.dataMensal.slice(-2));
    const currentDay = Number(dateKey.slice(-2));
    if (expectedDay !== currentDay) {
      throw new Error(`Essa tarefa sÃ³ pode ser marcada no dia ${String(expectedDay).padStart(2, '0')} de cada mÃªs.`);
    }
  }
  if (tarefa.recorrencia === 'anual') {
    if (tarefa.dataAnual && tarefa.dataAnual.slice(5) !== dateKey.slice(5)) {
      throw new Error(`Essa tarefa sÃƒÂ³ pode ser marcada em ${formatDateShort(tarefa.dataAnual).slice(0, 5)} de cada ano.`);
    }

    if (tarefa.mesAnual && tarefa.mesAnual.slice(5, 7) !== dateKey.slice(5, 7)) {
      throw new Error(`Essa tarefa sÃƒÂ³ pode ser marcada em ${formatMonthLabel(tarefa.mesAnual)}.`);
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

/* AÃ§Ãµes globais da rotina. */
function setStatus(taskId, status) {
  runSafely('setStatus', () => {
    const tarefa = store.tarefas.find(item => item.id === taskId);
    if (!tarefa) throw new Error('Tarefa nÃ£o encontrada.');

    validateTaskCanBeMarked(tarefa, uiState.dataSelecionada);

    const currentRecord = getTaskRecord(tarefa.id, getTaskProgressKey(tarefa, uiState.dataSelecionada));
    const shouldAnimateStatus = currentRecord.status !== status;

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
    if (!tarefa) throw new Error('Tarefa nÃ£o encontrada.');
    validateTaskCanBeMarked(tarefa, uiState.dataSelecionada);

    const input = document.getElementById(`durv-${taskId}`);
    const minutes = durationInputToMinutes(input.value);
    if (!minutes) throw new Error('Informe a duraÃ§Ã£o em horas e minutos.');
    if (minutes > 1439) throw new Error('A duraÃ§Ã£o mÃ¡xima permitida Ã© de 23h59.');

    dataService.saveTaskDuration(taskId, uiState.dataSelecionada, minutes);
    document.getElementById(`dur-${taskId}`).classList.remove('open');
    renderCurrentPage();
  });
}

function delTarefa(taskId) {
  if (!confirm('Confirma a exclusÃ£o desta tarefa')) return;
  runSafely('delTarefa', () => {
    dataService.deleteTask(taskId);
    renderRotina();
  });
}

/* Controles do calendÃ¡rio. */
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

/* RenderizaÃ§Ã£o da rotina e do formulÃ¡rio de tarefa. */
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
    button.classList.toggle('active', button.getAttribute('onclick').includes(`'${uiState.rotinaFiltro}'`));
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
      if (arrow) arrow.textContent = uiState.secoesMinimizadas[section] ? '?' : '?';
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
  uiState.buscaCompartilhada = input.value.trim().toLowerCase() || '';
  renderTaskLists();
}

function onMetaSearchInput() {
  const input = document.getElementById('meta-search');
  uiState.buscaCompartilhada = input.value.trim().toLowerCase() || '';
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
  const recurrence = document.getElementById('t-rec').value;
  const weekdayWrap = document.getElementById('weekday-wrap');
  const timeWrap = document.getElementById('time-wrap');
  const singleDateWrap = document.getElementById('single-date-wrap');
  const monthlyDateWrap = document.getElementById('monthly-date-wrap');
  const annualWrap = document.getElementById('annual-wrap');
  const annualMode = document.getElementById('t-anual-modo').value || 'flexivel';
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
  if (recurrence === 'semanal') helper.textContent = 'Tarefa semanal: marque os dias de referÃªncia se quiser. Ela continua valendo para a semana inteira e reinicia toda segunda-feira.';
  if (recurrence === 'mensal') helper.textContent = 'Tarefa mensal: a data de referÃªncia Ã© opcional. Se escolher uma data, esse dia fica destacado no mÃªs.';
  if (recurrence === 'anual') helper.textContent = 'Tarefa anual: pode valer para o ano inteiro, para um mes especifico ou para um dia fixo do ano.';
  if (recurrence === 'unica') helper.textContent = 'Tarefa de uma data especÃ­fica. Ela aparece somente no dia escolhido.';
}

function getSelectedWeekdays() {
  return Array.from(document.querySelectorAll('#weekday-selector input:checked'))
    .map(input => Number(input.value))
    .sort((a, b) => a - b);
}

function buildSectionProgress(sectionKey, tarefas, emptyWhenZero = false) {
  if (!tarefas.length && emptyWhenZero) return '';

  const feitas = tarefas.filter(item => getTaskRecord(item.id, getTaskProgressKey(item, uiState.dataSelecionada)).status === 'feito').length;
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
  if (record.status === 'feito') return 'feita';
  if (record.status === 'nao_feito') return 'nao_feita';
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
      meta.titulo || '',
      categoria.nome || '',
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
      : '<div class="empty-state">Nenhuma Tarefa DiÃ¡ria Neste Dia.</div>'
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
    : '<div class="task-meta-row"><span class="badge badge-habit">H?bito</span></div>';

  const isCommentCollapsed = Boolean(uiState.comentariosMinimizados[tarefa.id]);
  const commentBlock = tarefa.comentario
    ? `
      <div class="task-comment-wrap">
        <button type="button" class="comment-toggle" onclick="toggleTaskComment('${tarefa.id}')" title="${isCommentCollapsed ? 'Mostrar Coment?rio' : 'Ocultar Coment?rio'}">
          <span class="comment-arrow">${isCommentCollapsed ? '&#9656;' : '&#9662;'}</span>
        </button>
        ${isCommentCollapsed ? '<span class="task-comment-collapsed">Coment?rio oculto</span>' : `<div class="task-comment">${escapeHtml(tarefa.comentario)}</div>`}
      </div>
    `
    : '';

  const durationEditor = `
    <div class="dur-area">
      <button type="button" class="icon-btn" onclick="toggleDur('${tarefa.id}')" title="Registrar Tempo">?</button>
      ${registro?.duracaoMinutos ? `<span class="duration-chip">${formatMinutes(registro.duracaoMinutos)}</span>` : ''}
      <div id="dur-${tarefa.id}" class="dur-inline">
        <input type="time" id="durv-${tarefa.id}" value="${registro?.duracaoMinutos ? String(Math.floor(registro.duracaoMinutos / 60)).padStart(2, '0') + ':' + String(registro.duracaoMinutos % 60).padStart(2, '0') : ''}" class="dur-input-time">
        <button type="button" class="btn-sm" onclick="saveDur('${tarefa.id}')">Ok</button>
      </div>
    </div>
  `;

  return `
    <div class="task-item${isDone ? ' task-done' : ''}${isMissed ? ' task-not' : ''}" data-task-id="${tarefa.id}">
      <div class="task-status">
        <button type="button" class="status-btn check${isDone ? ' active' : ''}" onclick="setStatus('${tarefa.id}', 'feito')" title="Marcar Como Feito">?</button>
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
        <button type="button" class="icon-btn" onclick="startEditTask('${tarefa.id}')" title="Editar Tarefa">?</button>
        ${durationEditor}
        <button type="button" class="del-btn" onclick="delTarefa('${tarefa.id}')">?</button>
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
      validateTimeRange(inicio, fim, 'Uma tarefa com hor?rio');
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
      throw new Error('Escolha a data da tarefa ?nica.');
    }

    if (recurrence === 'anual' && annualMode === 'dia' && !payload.dataAnual) {
      throw new Error('Escolha a data anual da tarefa.');
    }

    if (recurrence === 'anual' && annualMode === 'mes' && !payload.mesAnual) {
      throw new Error('Escolha o m?s anual da tarefa.');
    }

    if (recurrence === 'diario' && !payload.diasSemana.length) {
      throw new Error('Selecione pelo menos um dia da semana para a tarefa di?ria.');
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
      ? `Tarefa salva com sucesso. Ela aparecer? em: ${selectedWeekdays.map(dia => WEEKDAY_OPTIONS.find(item => item.value === dia)?.label).join(', ')}.`
      : 'Tarefa salva com sucesso.';
    showFeedback('success', message);
  });
}
