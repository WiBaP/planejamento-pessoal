function createInitialState() {
  return {
    categorias: [],
    metas: [],
    tarefas: [],
    registros: [],
    sessoes: [],
    mercadoItens: [],
  };
}

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

function normalizeMarketItem(raw) {
  const quantidade = Number(raw?.quantidade || 1);

  return {
    id: raw?.id || createId(),
    nome: raw?.nome || '',
    quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1,
    status: raw?.status === 'faltando' ? 'faltando' : 'ok',
    criadoEm: raw?.criadoEm || getToday(),
  };
}

function normalizeState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;

  base.categorias = Array.isArray(raw.categorias) ? raw.categorias : [];
  base.metas = Array.isArray(raw.metas)
    ? raw.metas.map(meta => {
        let unidade = meta?.unidade;
        if (unidade === 'paginas') unidade = 'vezes';
        if (unidade === 'min') unidade = 'horas';
        return { ...meta, unidade };
      })
    : [];
  base.tarefas = Array.isArray(raw.tarefas) ? raw.tarefas.map(normalizeTask) : [];
  base.registros = Array.isArray(raw.registros) ? raw.registros : [];
  base.sessoes = Array.isArray(raw.sessoes) ? raw.sessoes : [];
  base.mercadoItens = Array.isArray(raw.mercadoItens) ? raw.mercadoItens.map(normalizeMarketItem) : [];
  return base;
}

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
