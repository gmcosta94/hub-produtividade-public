-- Seed: estrutura fixa do hub (briefing, seções 3 e 8).
-- Só nomes e estrutura. Nenhum conteúdo pessoal: hábitos, métricas e textos
-- da Constituição vêm de dados/conteudo/ (fora do git).

-- Áreas ----------------------------------------------------------------------
-- Todas começam em manutenção; o modo de cada uma é ajustado no painel.
insert into area (nome, tipo, modo, ordem) values
  ('Carreira',  'vida',    'manutencao', 1),
  ('Estudos',   'vida',    'manutencao', 2),
  ('Saúde',     'vida',    'manutencao', 3),
  ('Finanças',  'vida',    'manutencao', 4),
  ('Família',   'vida',    'manutencao', 5),
  ('Religião',  'vida',    'manutencao', 6),
  ('Lazer',     'vida',    'manutencao', 7),
  ('Sistema',   'sistema', null,         99);

-- Parâmetros -----------------------------------------------------------------
-- Pontos de partida propostos no projeto; ajustáveis nas revisões.
insert into parametro (chave, valor, unidade, descricao) values
  ('areas_em_foco_max',       2,   'áreas',   'Máximo de áreas em foco num ciclo'),
  ('espacos_extras_dia',      2,   'itens',   'Espaços para tarefas no dia, além do destaque'),
  ('margem_capacidade',       0.7, 'fração',  'Parte das horas livres da semana que pode ser planejada'),
  ('foco_duracao_minima_min', 60,  'minutos', 'Duração mínima de uma sessão de foco');
