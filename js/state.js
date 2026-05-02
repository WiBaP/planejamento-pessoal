let store = storageGateway.loadState();

const uiState = {
  paginaAtual: null,
  cachePaginas: {},
  dataSelecionada: getToday(),
  mesCalendario: new Date(),
  ultimoDiaRenderizado: getToday(),
  saveTimer: null,
  feedbackTimer: null,
  feedbackBackdropAtivo: false,
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

function showFeedback(type, message, keepVisible = false, lockBackdrop = type === 'success') {
  const banner = document.getElementById('feedback-banner');
  const text = document.getElementById('feedback-text');
  if (!banner || !text) return;

  uiState.feedbackBackdropAtivo = Boolean(lockBackdrop);
  syncFormBackdrop();

  banner.className = `banner show ${type}`;
  text.textContent = message;

  if (uiState.feedbackTimer) clearTimeout(uiState.feedbackTimer);
  if (keepVisible) return;

  uiState.feedbackTimer = setTimeout(() => {
    banner.className = 'banner';
    text.textContent = '';
    uiState.feedbackBackdropAtivo = false;
    syncFormBackdrop();
    uiState.feedbackTimer = null;
  }, 2000);
}

function showActionFeedback(type, message, anchor = document.activeElement, keepVisible = false) {
  const anchorElement = anchor instanceof Element ? anchor : null;
  const target = anchorElement?.closest('.form-row, .task-item, .meta-item, .market-row, .routine-toolbar-actions, .card');
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

function setFormOpen(formEl, open) {
  if (!formEl) return;
  if (open) {
    formEl.style.display = '';
    requestAnimationFrame(() => {
      if (formEl.style.display !== 'none') formEl.classList.add('is-open');
      syncFormBackdrop();
    });
  } else {
    formEl.classList.remove('is-open');
    formEl.style.display = 'none';
  }
  syncFormBackdrop();
}

function hasOpenForm() {
  return Boolean(
    document.querySelector('.task-form-card.is-open') ||
    uiState.rotinaFormularioAberto ||
    uiState.categoriaFormularioAberto ||
    uiState.metaFormularioAberto
  );
}

function syncFormBackdrop() {
  const backdrop = document.getElementById('form-backdrop');
  if (!backdrop) return;
  const anyOpen = hasOpenForm() || uiState.feedbackBackdropAtivo;
  backdrop.classList.toggle('is-active', anyOpen);
  document.body.classList.toggle('has-form-open', anyOpen);
}

function closeAllForms() {
  document.querySelectorAll('.task-form-card.is-open').forEach(form => {
    form.classList.remove('is-open');
    form.style.display = 'none';
  });
  uiState.rotinaFormularioAberto = false;
  uiState.categoriaFormularioAberto = false;
  uiState.metaFormularioAberto = false;
  uiState.editandoTarefaId = null;
  uiState.editandoCategoriaId = null;
  uiState.editandoMetaId = null;
  syncFormBackdrop();
}

function onBackdropClick() {
  if (!hasOpenForm()) return;
  closeAllForms();
  if (uiState.paginaAtual === 'rotina' && typeof renderRotina === 'function') renderRotina();
  if (uiState.paginaAtual === 'metas' && typeof renderMetas === 'function') renderMetas();
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && hasOpenForm()) {
    onBackdropClick();
  }
});
