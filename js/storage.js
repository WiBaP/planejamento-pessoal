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
