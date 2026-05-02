function getMarketItems() {
  return Array.isArray(store.mercadoItens) ? store.mercadoItens : [];
}

function getMarketQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function sortMarketItems(items) {
  return [...items].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function renderMarketList(items) {
  if (!items.length) return '<div class="empty-state">Nenhum item nesta lista.</div>';

  return sortMarketItems(items).map(item => {
    const isMissing = item.status === 'faltando';

    return `
      <div class="market-row ${isMissing ? 'market-row-missing' : 'market-row-ok'}">
        <div class="market-status-actions">
          <button type="button" class="status-btn check${!isMissing ? ' active' : ''}" onclick="setMarketItemStatus('${item.id}', 'ok')" title="Tenho em casa">&#10003;</button>
          <button type="button" class="status-btn cross${isMissing ? ' active' : ''}" onclick="setMarketItemStatus('${item.id}', 'faltando')" title="Precisa comprar">X</button>
        </div>
        <div class="market-item-main">
          <div class="market-item-name">${escapeHtml(item.nome)}</div>
          <div class="market-item-status ${isMissing ? 'missing' : 'ok'}">${isMissing ? 'Faltando' : 'Em casa'}</div>
        </div>
        <div class="market-item-actions">
          <label class="market-quantity-label">
            Qtd
            <input type="number" min="1" step="1" value="${getMarketQuantity(item.quantidade)}" onchange="updateMarketItemQuantity('${item.id}', this.value)">
          </label>
          <button type="button" class="del-btn" onclick="deleteMarketItem('${item.id}')">×</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderMercado() {
  const metrics = document.getElementById('market-metrics');
  const missingList = document.getElementById('market-missing-list');
  const okList = document.getElementById('market-ok-list');
  if (!metrics || !missingList || !okList) return;

  const items = getMarketItems();
  const missing = items.filter(item => item.status === 'faltando');
  const ok = items.filter(item => item.status !== 'faltando');
  const missingQuantity = missing.reduce((sum, item) => sum + getMarketQuantity(item.quantidade), 0);

  metrics.innerHTML = `
    <div class="metric"><div class="metric-label">Faltando</div><div class="metric-value danger">${missing.length}</div></div>
    <div class="metric"><div class="metric-label">Em Casa</div><div class="metric-value success">${ok.length}</div></div>
    <div class="metric"><div class="metric-label">Qtd Para Comprar</div><div class="metric-value ${missingQuantity ? 'danger' : 'success'}">${missingQuantity}</div></div>
    <div class="metric"><div class="metric-label">Total Na Lista</div><div class="metric-value metric-small">${items.length}</div></div>
  `;

  missingList.innerHTML = renderMarketList(missing);
  okList.innerHTML = renderMarketList(ok);
}

function addMarketItem() {
  runSafely('addMarketItem', () => {
    const nameInput = document.getElementById('market-item-name');
    const quantityInput = document.getElementById('market-item-quantity');
    const name = nameInput.value.trim();
    const quantity = getMarketQuantity(quantityInput.value);

    if (!name) throw new Error('Informe o nome do item.');

    dataService.addMarketItem({
      nome: name,
      quantidade: quantity,
      status: 'ok',
    });

    nameInput.value = '';
    quantityInput.value = '1';
    renderMercado();
    showFeedback('success', 'Item adicionado na lista de mercado.');
  });
}

function setMarketItemStatus(itemId, status) {
  runSafely('setMarketItemStatus', () => {
    dataService.updateMarketItemStatus(itemId, status);
    renderMercado();
  });
}

function updateMarketItemQuantity(itemId, quantity) {
  runSafely('updateMarketItemQuantity', () => {
    dataService.updateMarketItemQuantity(itemId, getMarketQuantity(quantity));
    renderMercado();
  });
}

function deleteMarketItem(itemId) {
  if (!confirm('Confirma a exclusão deste item da lista?')) return;
  runSafely('deleteMarketItem', () => {
    dataService.deleteMarketItem(itemId);
    renderMercado();
    showFeedback('success', 'Item removido da lista.');
  });
}
