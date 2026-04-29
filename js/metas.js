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
      <div class="metric"><div class="metric-label">Metas Visíveis</div><div class="metric-value">${visibleMetas.length}</div></div>
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
  if (metaButton) metaButton.textContent = uiState.editandoMetaId ? 'Salvar Alterações' : 'Salvar Meta';
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
    : '<div class="empty-state">Nenhuma tarefa concluída vinculada a esta meta.</div>';

  return `
    <div class="linked-tasks">
      <button type="button" class="linked-tasks-toggle" onclick="toggleCompletedTasks('${metaId}')">
        <span class="section-arrow">${isOpen ? '&#9662;' : '&#9656;'}</span>
        <span>Tarefas concluídas (${completed.length})</span>
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
