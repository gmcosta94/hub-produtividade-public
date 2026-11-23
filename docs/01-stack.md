# Stack — proposta

Escrito e confirmado em 16/11/2026.

## Recomendação

A mesma base do hub financeiro, para reaproveitar o que já está instalado e o que o Gabriel já sabe manter.

| Camada | Escolha | Por quê |
|---|---|---|
| Banco, login, acesso por linha | **Supabase** (Postgres), num projeto próprio | Mesma ferramenta do hub financeiro. Ver "Projeto Supabase" abaixo. |
| Regras de negócio | **SQL no Postgres**: views e funções em migrations | É a parte que o Gabriel lê e mantém. Metas semanais, horas de foco e limites da Constituição ficam em SQL. O assistente lê as mesmas views. |
| Migrations | **Supabase CLI**, arquivos `.sql` numerados em `supabase/migrations/` | SQL puro, versionado, sem ORM. |
| App | **React + TypeScript + Vite**, como PWA | Site estático. Instala no iPhone pela tela de início. |
| Textos (Constituição, estratégias) | **Markdown** guardado no banco; edição em caixa de texto simples, leitura renderizada | Resolve a limitação de formatação do Notes sem trazer um editor pesado na fase 1. |
| Hospedagem do app | **Cloudflare Pages** | Gratuito, publica a cada push. |
| Assistente | **Claude Code** lendo as views `v_revisao_*` | Sem chave de API nem código de servidor na fase 1. |
| Backup | Script de `pg_dump`, como no hub financeiro | Salva em `dados/backups/`, fora do git. |

## Projeto Supabase

O plano gratuito permite dois projetos ativos. O hub financeiro já usa um.

**Decidido em 16/11/2026: projeto próprio para este hub** (o segundo do plano gratuito).

O banco local usa portas próprias (55321 para a API, 55322 para o Postgres), para rodar ao mesmo tempo que o do hub financeiro (54321 e 54322).

Alternativa descartada: usar o mesmo projeto do hub financeiro, num schema separado. Facilitaria a integração da fase 7, mas dois repositórios passariam a dividir o mesmo histórico de migrations, e um `supabase db push` de um lado acusaria as migrations do outro como desconhecidas.

Consequência a saber: o casa-em-dia seria um terceiro projeto. Quando ele precisar de banco, as opções são pagar o plano, juntar o casa-em-dia a um dos dois projetos ou juntar os três num repositório só. Essa decisão não trava a fase 1.

## Fora da fase 1

- **Funcionamento sem internet.** O app exige conexão. Se isso atrapalhar o registro no celular, entra como item próprio.
- **Atalho do iOS para registrar.** O registro pelo celular começa pelo PWA.
- **Leitura da agenda.** Entra com os blocos de tempo, na fase 4.
- **Assistente dentro do app.** Só depois de a revisão pelo Claude Code se sustentar.

## Custo

Supabase e Cloudflare Pages gratuitos. Total previsto: R$ 0 por mês.

## Riscos

1. **Pausa por inatividade**: o plano gratuito pausa projetos sem uso por 7 dias. Com registro diário não ocorre.
2. **Sem backup automático no plano gratuito.** O script de backup entra na fase 0.
3. **Dados sensíveis** (saúde, família, religião) num banco hospedado. Mitigação: acesso por linha em todas as tabelas, um usuário só, e nenhum dado pessoal em arquivos versionados.
