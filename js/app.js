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
  closeAllForms();
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
