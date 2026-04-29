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
