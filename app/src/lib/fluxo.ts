import type { Tela } from './dados'

// O fluxo do hub: cada elo, de onde ele vem na teoria, com quem se liga e
// onde entra a escolha da pessoa. A tela Sistema desenha e explica este mapa;
// os números (parâmetros) e os textos da Constituição entram pelas chaves.

export type IdDoElo =
  | 'sistema'
  | 'areas'
  | 'habitos'
  | 'visao'
  | 'ciclo'
  | 'semana'
  | 'dia'
  | 'foco'
  | 'projetos'
  | 'tarefas'
  | 'captura'
  | 'notas'

export type Elo = {
  id: IdDoElo
  nome: string
  titulo: string
  faz: string
  bases: string[]
  ligacoes: { com: IdDoElo; como: string }[]
  voce: string
  parametros: string[]
  textos: string[]
  tela?: Tela
}

export const ELOS: Record<IdDoElo, Elo> = {
  sistema: {
    id: 'sistema',
    nome: 'Sistema',
    titulo: 'Sistema: a moldura',
    faz: 'Guarda as regras que valem em todas as escalas: os pilares, os limites em número e os processos. As outras telas executam o que está aqui, e o banco recusa o que passa de um limite.',
    bases: [
      'Shane Parrish: decidir as regras com calma, para não precisar decidir no calor do dia.',
      'Leveza: tudo mapeado, pouco comprometido.',
    ],
    ligacoes: [
      { com: 'areas', como: 'limita quantas áreas ficam em foco' },
      { com: 'ciclo', como: 'confere o plano do ciclo antes de ele começar' },
      { com: 'habitos', como: 'limita os hábitos em construção' },
      { com: 'dia', como: 'define os tamanhos do dia e os espaços de tarefa' },
      { com: 'projetos', como: 'limita os projetos ativos' },
    ],
    voce: 'Os números e os textos são seus. Mudar um texto é uma emenda e pede o motivo; o histórico fica guardado.',
    parametros: ['areas_em_foco_max', 'objetivos_por_area_max', 'projetos_ativos_max', 'habitos_essenciais_max'],
    textos: ['pilares', 'limites'],
  },
  areas: {
    id: 'areas',
    nome: 'Áreas',
    titulo: 'Áreas da vida',
    faz: 'Tudo no hub pertence a uma área. Cada área tem uma visão de longo prazo, um padrão mínimo e um modo no ciclo: foco, manutenção ou pausa.',
    bases: [
      'Ali Abdaal: a vida dividida em áreas, para nada importante ficar de fora.',
      'Cal Newport: estações; nem tudo fica em foco ao mesmo tempo.',
    ],
    ligacoes: [
      { com: 'visao', como: 'cada área guarda a sua visão' },
      { com: 'ciclo', como: 'o ciclo escolhe o modo de cada área' },
      { com: 'habitos', como: 'os hábitos de base sustentam o padrão mínimo' },
      { com: 'notas', como: 'é o A do PARA' },
      { com: 'projetos', como: 'todo projeto é de uma área' },
    ],
    voce: 'Quais áreas existem, o que é "está ok" em cada uma e qual entra em foco a cada ciclo.',
    parametros: ['areas_em_foco_max'],
    textos: [],
    tela: 'areas',
  },
  visao: {
    id: 'visao',
    nome: 'Visão',
    titulo: 'Visão de longo prazo',
    faz: 'O Norte: como cada área está daqui a alguns anos. É escrita antes de qualquer ciclo e fica no alto do Plano; o ciclo olha para ela para escolher o foco, a única coisa e o porquê de cada objetivo.',
    bases: ['Gary Keller: da visão de alguns anos até o agora, cada escala servindo à de cima.'],
    ligacoes: [
      { com: 'areas', como: 'é montada a partir delas' },
      { com: 'ciclo', como: 'dá o porquê dos objetivos' },
    ],
    voce: 'Você escreve a visão de cada área e relê no começo de cada ciclo.',
    parametros: [],
    textos: [],
    tela: 'plano',
  },
  ciclo: {
    id: 'ciclo',
    nome: 'Ciclo',
    titulo: 'Plano do ciclo',
    faz: 'Um período com poucas áreas em foco, uma única coisa e até dois objetivos por área em foco. O plano é guiado em seis passos e termina conferindo as regras do Sistema.',
    bases: [
      'Cal Newport: plano em escalas; o ciclo dá a direção, a semana e o dia executam.',
      'Gary Keller: a única coisa que torna o resto mais fácil ou desnecessário.',
      'Inteligência Pragmática (na leitura do hub): o objetivo passa por definir, planejar e executar.',
    ],
    ligacoes: [
      { com: 'visao', como: 'parte dela' },
      { com: 'areas', como: 'escolhe o modo de cada uma' },
      { com: 'projetos', como: 'cada objetivo vira um ou mais projetos' },
      { com: 'semana', como: 'a semana herda a única coisa' },
    ],
    voce: 'O tamanho do ciclo, a semana base (de onde saem as horas livres), as áreas em foco, o padrão mínimo das outras, a única coisa e os objetivos.',
    parametros: [
      'objetivos_por_area_max',
      'margem_capacidade',
      'horas_nivel_leve',
      'horas_nivel_moderado',
      'horas_nivel_intenso',
    ],
    textos: ['plano_em_escalas'],
    tela: 'plano',
  },
  semana: {
    id: 'semana',
    nome: 'Semana',
    titulo: 'Plano semanal',
    faz: 'Começa lembrando os objetivos do ciclo e monta a semana num quadro: Backlog, A fazer, Fazendo e Feito. O que sobra volta ao Backlog. A revisão de sexta fecha a semana e alimenta a seguinte.',
    bases: ['Cal Newport: o plano semanal como ponte entre o ciclo e o dia.'],
    ligacoes: [
      { com: 'ciclo', como: 'puxa os objetivos e a única coisa' },
      { com: 'tarefas', como: 'traz as tarefas para o quadro da semana' },
      { com: 'dia', como: 'cada dia sai da semana' },
    ],
    voce: 'A intenção da semana e a revisão de sexta.',
    parametros: ['margem_capacidade', 'fazendo_max'],
    textos: ['plano_em_escalas'],
    tela: 'plano',
  },
  dia: {
    id: 'dia',
    nome: 'Dia',
    titulo: 'Plano do dia',
    faz: 'O tamanho do dia, a única coisa de hoje, os espaços de tarefa e os rituais de início e de fim. Hoje também mostra os hábitos do dia.',
    bases: ['Gary Keller: a única coisa de hoje.', 'Cal Newport: o dia com começo e fim, e cada hora com um trabalho.'],
    ligacoes: [
      { com: 'semana', como: 'sai da semana' },
      { com: 'habitos', como: 'os hábitos aparecem em Hoje' },
      { com: 'foco', como: 'as sessões acontecem dentro do dia' },
    ],
    voce: 'Os tamanhos do dia e os rituais, do seu jeito.',
    parametros: ['espacos_extras_dia'],
    textos: ['tamanhos_do_dia', 'ritual_inicio', 'ritual_fim'],
    tela: 'hoje',
  },
  foco: {
    id: 'foco',
    nome: 'Foco',
    titulo: 'Sessões de foco',
    faz: 'O tempo de trabalho concentrado, registrado por área. O histórico mostra as horas de foco e estudo de cada semana.',
    bases: ['Cal Newport: trabalho profundo, em blocos protegidos.'],
    ligacoes: [
      { com: 'dia', como: 'acontecem dentro do dia' },
      { com: 'tarefas', como: 'cada sessão serve a uma entrega' },
      { com: 'areas', como: 'o histórico é por área' },
    ],
    voce: 'Como você conduz a sessão e como estuda vídeos e livros.',
    parametros: [],
    textos: ['sessao_de_foco', 'estudo_videos', 'estudo_livros'],
    tela: 'hoje',
  },
  habitos: {
    id: 'habitos',
    nome: 'Hábitos',
    titulo: 'Hábitos',
    faz: 'Três camadas. Em construção: os poucos hábitos que você está adotando agora. Padrão mínimo: o que segura as áreas fora do foco. Acompanhamento: o que vale registrar quando der, sem pendência nem cobrança. Um hábito em construção que vira rotina passa para acompanhamento e abre a vaga.',
    bases: [
      'James Clear: hábitos pequenos, com versão mínima; acompanhar só o que importa, e do jeito mais fácil.',
      'Gary Keller: um hábito de cada vez, até ele ficar automático.',
    ],
    ligacoes: [
      { com: 'areas', como: 'sustentam o padrão mínimo' },
      { com: 'dia', como: 'são marcados em Hoje' },
    ],
    voce: 'Quais hábitos, o peso e a meta de cada um.',
    parametros: ['habitos_essenciais_max'],
    textos: ['pesos_dos_habitos'],
    tela: 'habitos',
  },
  projetos: {
    id: 'projetos',
    nome: 'Projetos',
    titulo: 'Projetos',
    faz: 'Um resultado com fim, de uma área. Os projetos ficam num quadro: Algum dia, Ativos e Concluídos. O limite de ativos vale por frente: os pessoais juntos e cada cliente do trabalho separado. Projeto ativo sem tarefa na semana fica marcado: falta a próxima ação.',
    bases: ['Tiago Forte: o P do PARA; projeto tem fim, área não.'],
    ligacoes: [
      { com: 'ciclo', como: 'serve a um objetivo do ciclo' },
      { com: 'tarefas', como: 'se divide em tarefas' },
      { com: 'notas', como: 'reúne as notas do projeto' },
    ],
    voce: 'O que vira projeto e como se sabe que acabou.',
    parametros: ['projetos_ativos_max', 'projetos_por_cliente_max'],
    textos: [],
    tela: 'tarefas',
  },
  tarefas: {
    id: 'tarefas',
    nome: 'Tarefas',
    titulo: 'Tarefas',
    faz: 'O que chega pela captura fica em Entrada até ser decidido. Decidida, a tarefa ganha área ou projeto e vai para a semana e para o dia.',
    bases: ['David Allen: decidir a próxima ação antes de fazer.'],
    ligacoes: [
      { com: 'captura', como: 'chegam pela entrada' },
      { com: 'projetos', como: 'pertencem a um projeto ou a uma área' },
      { com: 'semana', como: 'são escolhidas para a semana' },
      { com: 'foco', como: 'são o que a sessão entrega' },
      { com: 'notas', como: 'o projeto junta as duas' },
    ],
    voce: 'Quantos espaços de tarefa o dia tem.',
    parametros: ['espacos_extras_dia'],
    textos: [],
    tela: 'tarefas',
  },
  captura: {
    id: 'captura',
    nome: 'Captura',
    titulo: 'Captura',
    faz: 'Um lugar só para tirar da cabeça o que aparece. Nada é decidido na hora: vira tarefa ou nota depois.',
    bases: ['David Allen: a mente é para ter ideias, não para guardá-las.'],
    ligacoes: [
      { com: 'tarefas', como: 'entra como tarefa em Entrada' },
      { com: 'notas', como: 'ou como nota' },
    ],
    voce: 'Quando e como você esvazia a entrada.',
    parametros: [],
    textos: ['captura'],
    tela: 'hoje',
  },
  notas: {
    id: 'notas',
    nome: 'Notas',
    titulo: 'Notas',
    faz: 'Cada nota fica em projeto, área, recurso ou arquivo, conforme o que está ligado a ela.',
    bases: ['Tiago Forte: PARA, organizar pelo uso e não pelo assunto.'],
    ligacoes: [
      { com: 'areas', como: 'é o A do PARA' },
      { com: 'projetos', como: 'é o P do PARA' },
      { com: 'captura', como: 'chegam pela captura' },
    ],
    voce: 'O que vale guardar.',
    parametros: [],
    textos: [],
    tela: 'notas',
  },
}

// O desenho: três colunas (áreas, escalas do plano, execução) dentro da moldura.
const COLUNA = { esquerda: 12, centro: 132, direita: 252 }
const LINHA = [44, 112, 180, 248, 316]
export const CAIXA = { largura: 96, altura: 40 }
export const TAMANHO_DO_MAPA = { largura: 360, altura: 372 }

export const POSICAO: Record<Exclude<IdDoElo, 'sistema'>, { x: number; y: number }> = {
  areas: { x: COLUNA.esquerda, y: LINHA[0] },
  habitos: { x: COLUNA.esquerda, y: LINHA[2] },
  visao: { x: COLUNA.centro, y: LINHA[0] },
  ciclo: { x: COLUNA.centro, y: LINHA[1] },
  semana: { x: COLUNA.centro, y: LINHA[2] },
  dia: { x: COLUNA.centro, y: LINHA[3] },
  foco: { x: COLUNA.centro, y: LINHA[4] },
  projetos: { x: COLUNA.direita, y: LINHA[1] },
  tarefas: { x: COLUNA.direita, y: LINHA[2] },
  captura: { x: COLUNA.direita, y: LINHA[3] },
  notas: { x: COLUNA.direita, y: LINHA[4] },
}

const meio = (id: Exclude<IdDoElo, 'sistema'>) => POSICAO[id].x + CAIXA.largura / 2
const topo = (id: Exclude<IdDoElo, 'sistema'>) => POSICAO[id].y
const base = (id: Exclude<IdDoElo, 'sistema'>) => POSICAO[id].y + CAIXA.altura
const centroY = (id: Exclude<IdDoElo, 'sistema'>) => POSICAO[id].y + CAIXA.altura / 2
const esquerda = (id: Exclude<IdDoElo, 'sistema'>) => POSICAO[id].x
const direita = (id: Exclude<IdDoElo, 'sistema'>) => POSICAO[id].x + CAIXA.largura

// tipo: desce = o plano desce de escala; sobe = revisão; liga = ligação de dados.
export type Seta = { de: IdDoElo; para: IdDoElo; tipo: 'desce' | 'sobe' | 'liga'; d: string }

const descer = (de: 'visao' | 'ciclo' | 'semana' | 'dia', para: 'ciclo' | 'semana' | 'dia' | 'foco'): Seta[] => [
  { de, para, tipo: 'desce', d: `M${meio(de) - 14} ${base(de)} L${meio(de) - 14} ${topo(para) - 3}` },
  { de: para, para: de, tipo: 'sobe', d: `M${meio(de) + 14} ${topo(para)} L${meio(de) + 14} ${base(de) + 3}` },
]

export const SETAS: Seta[] = [
  {
    de: 'areas',
    para: 'visao',
    tipo: 'liga',
    d: `M${direita('areas')} ${centroY('areas')} L${esquerda('visao') - 3} ${centroY('visao')}`,
  },
  {
    de: 'areas',
    para: 'ciclo',
    tipo: 'liga',
    d: `M${meio('areas') + 24} ${base('areas')} L${meio('areas') + 24} ${centroY('ciclo')} L${esquerda('ciclo') - 3} ${centroY('ciclo')}`,
  },
  {
    de: 'areas',
    para: 'habitos',
    tipo: 'liga',
    d: `M${meio('areas') - 20} ${base('areas')} L${meio('areas') - 20} ${topo('habitos') - 3}`,
  },
  {
    de: 'habitos',
    para: 'dia',
    tipo: 'liga',
    d: `M${meio('habitos')} ${base('habitos')} L${meio('habitos')} ${centroY('dia')} L${esquerda('dia') - 3} ${centroY('dia')}`,
  },
  ...descer('visao', 'ciclo'),
  ...descer('ciclo', 'semana'),
  ...descer('semana', 'dia'),
  ...descer('dia', 'foco'),
  {
    de: 'ciclo',
    para: 'projetos',
    tipo: 'liga',
    d: `M${direita('ciclo')} ${centroY('ciclo')} L${esquerda('projetos') - 3} ${centroY('projetos')}`,
  },
  {
    de: 'projetos',
    para: 'tarefas',
    tipo: 'liga',
    d: `M${meio('projetos')} ${base('projetos')} L${meio('projetos')} ${topo('tarefas') - 3}`,
  },
  {
    de: 'tarefas',
    para: 'semana',
    tipo: 'liga',
    d: `M${esquerda('tarefas')} ${centroY('tarefas')} L${direita('semana') + 3} ${centroY('semana')}`,
  },
  {
    de: 'captura',
    para: 'tarefas',
    tipo: 'liga',
    d: `M${meio('captura')} ${topo('captura')} L${meio('captura')} ${base('tarefas') + 3}`,
  },
  {
    de: 'captura',
    para: 'notas',
    tipo: 'liga',
    d: `M${meio('captura')} ${base('captura')} L${meio('captura')} ${topo('notas') - 3}`,
  },
]
