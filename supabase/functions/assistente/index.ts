// O assistente, nível 1: a revisão da semana (docs/05-assistente.md).
//
// 1. Confere o login e que a conta é membro do hub.
// 2. Lê o contexto com a permissão de quem pediu (contexto_do_assistente).
// 3. Pede a revisão ao modelo, com saída em formato fixo.
// 4. Confere a resposta e grava em revisao e proposta.
//
// A chave da API fica só aqui, nos segredos do Supabase (ANTHROPIC_API_KEY).
// O assistente não muda nada no hub: só grava a revisão e as propostas.

import {
  Anthropic,
  MODELO,
  PALAVRAS_VETADAS,
  REGRAS,
  autenticar,
  clienteDaApi,
  conferirProposta,
  erro,
  erroDaApi,
  preflight,
  resposta,
  texto,
  type Catalogo,
  type Proposta,
  type SupabaseClient,
} from "../_compartilhado/base.ts";

const REVISOES_POR_DIA = 5;

// Estável de propósito: nada que muda a cada pedido entra aqui, para o cache valer.
const SISTEMA = `Você é o assistente de um hub pessoal de organização e produtividade. Toda semana você lê o que a pessoa decidiu (a Constituição, as áreas em foco, o ciclo, os objetivos, os pesos dos hábitos) e o que ela fez (hábitos, sessões de foco, tarefas, projetos, notas), e responde a uma pergunta: o que foi decidido bate com o que está sendo feito?

${REGRAS}

Sobre esta revisão:
- No máximo 3 observações. Cada uma cita, no campo "evidencia", o dado em que se apoia, com os números como aparecem nos dados.
- No máximo 3 propostas, usando os tipos acima. Zero propostas é uma resposta válida. Veja "propostas_anteriores".
- Ideias de mudança na Constituição vão para "para_o_ciclo".
- "leitura" tem de duas a três frases sobre a semana como um todo. Se os dados forem poucos (começo de uso, semana vazia), diga isso com simplicidade e não invente padrões.`;

const PEDIDO =
  "Faça a revisão da semana descrita em semana_revista, usando o restante dos dados como contexto. " +
  "Se a semana ainda não terminou, considere só os dias até hoje.";

const TIPOS_DA_REVISAO = ["peso_do_habito", "meta_do_habito", "nivel_do_objetivo", "estado_do_projeto", "modo_da_area", "livre"];

// Esquema da resposta. Sem campos opcionais: o "vazio" é "" ou 0.
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["leitura", "observacoes", "propostas", "para_o_ciclo"],
  properties: {
    leitura: { type: "string" },
    observacoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "texto", "evidencia"],
        properties: {
          area: { type: "string" },
          texto: { type: "string" },
          evidencia: { type: "string" },
        },
      },
    },
    propostas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "alvo_id", "valor", "texto", "motivo"],
        properties: {
          tipo: { type: "string", enum: TIPOS_DA_REVISAO },
          alvo_id: { type: "integer" },
          valor: { type: "string" },
          texto: { type: "string" },
          motivo: { type: "string" },
        },
      },
    },
    para_o_ciclo: { type: "array", items: { type: "string" } },
  },
};

type Contexto = {
  semana: string;
  revisoes_hoje: number;
  constituicao: { titulo: string; corpo: string }[];
  dados: { catalogo: Catalogo } & Record<string, unknown>;
};

type Observacao = { area: string; texto: string; evidencia: string };

// Toda observação precisa se apoiar nos dados: cada número citado na
// evidência tem de aparecer no contexto enviado.
function numerosExistem(evidencia: string, contextoTexto: string): boolean {
  const numeros = evidencia.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numeros.every((n) => contextoTexto.includes(n) || contextoTexto.includes(n.replace(",", ".")));
}

// O que não passa na conferência é descartado, não corrigido.
export function conferir(bruto: unknown, ctx: Contexto) {
  const r = (bruto ?? {}) as Record<string, unknown>;
  const contextoTexto = JSON.stringify(ctx.dados);
  const descartes: string[] = [];

  const observacoes: Observacao[] = [];
  for (const o of Array.isArray(r.observacoes) ? r.observacoes : []) {
    const item = { area: texto(o?.area), texto: texto(o?.texto), evidencia: texto(o?.evidencia) };
    if (!item.texto || !item.evidencia) descartes.push("observação sem texto ou sem evidência");
    else if (PALAVRAS_VETADAS.test(item.texto)) descartes.push("observação com palavra vetada");
    else if (!numerosExistem(item.evidencia, contextoTexto)) descartes.push("observação com número que não está nos dados");
    else observacoes.push(item);
  }

  const propostas: Proposta[] = [];
  for (const p of Array.isArray(r.propostas) ? r.propostas : []) {
    const item = conferirProposta(p, ctx.dados.catalogo);
    if (typeof item === "string") descartes.push(item);
    else propostas.push(item);
  }

  const paraOCiclo = (Array.isArray(r.para_o_ciclo) ? r.para_o_ciclo : [])
    .map(texto)
    .filter((t: string) => t && !PALAVRAS_VETADAS.test(t));

  if (observacoes.length > 3) descartes.push(`${observacoes.length - 3} observações além do limite`);
  if (propostas.length > 3) descartes.push(`${propostas.length - 3} propostas além do limite`);

  return {
    leitura: texto(r.leitura),
    observacoes: observacoes.slice(0, 3),
    propostas: propostas.slice(0, 3),
    paraOCiclo: paraOCiclo.slice(0, 3),
    descartes,
  };
}

async function gravar(
  supabase: SupabaseClient,
  ctx: Contexto,
  revisao: ReturnType<typeof conferir>,
  mensagem: Anthropic.Beta.BetaMessage,
) {
  const { data, error } = await supabase
    .from("revisao")
    .insert({
      semana: ctx.semana,
      leitura: revisao.leitura,
      observacoes: revisao.observacoes,
      contexto: ctx.dados,
      modelo: mensagem.model,
      tokens_entrada: mensagem.usage.input_tokens,
      tokens_saida: mensagem.usage.output_tokens,
      tokens_cache: mensagem.usage.cache_read_input_tokens ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`gravar revisão: ${error?.message}`);

  const linhas = [
    ...revisao.propostas.map((p) => ({
      revisao_id: data.id,
      tipo: p.tipo,
      alvo_id: p.alvo_id || null,
      valor: p.tipo === "livre" ? null : p.valor,
      texto: p.texto,
      motivo: p.motivo || null,
    })),
    ...revisao.paraOCiclo.map((t) => ({ revisao_id: data.id, tipo: "para_o_ciclo", texto: t })),
  ];
  if (linhas.length > 0) {
    const { error: e2 } = await supabase.from("proposta").insert(linhas);
    if (e2) throw new Error(`gravar propostas: ${e2.message}`);
  }
  return data.id as number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return erro(405, "Use POST.");

  const supabase = await autenticar(req);
  if (supabase instanceof Response) return supabase;

  const pedido = await req.json().catch(() => ({}));
  const semana = typeof pedido?.semana === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pedido.semana) ? pedido.semana : null;

  const { data: ctx, error: erroDeContexto } = await supabase.rpc("contexto_do_assistente", { p_semana: semana });
  if (erroDeContexto || !ctx) {
    console.error("contexto", erroDeContexto);
    return erro(500, "Não foi possível ler o hub.");
  }
  const contexto = ctx as Contexto;
  if (contexto.revisoes_hoje >= REVISOES_POR_DIA) {
    return erro(429, `Já foram feitas ${REVISOES_POR_DIA} revisões hoje. O limite evita gasto à toa; tente amanhã.`);
  }

  const anthropic = clienteDaApi();
  if (anthropic instanceof Response) return anthropic;

  const constituicao = contexto.constituicao.map((t) => `## ${t.titulo}\n\n${t.corpo}`).join("\n\n");

  let mensagem: Anthropic.Beta.BetaMessage;
  try {
    mensagem = await anthropic.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA } },
      system: [
        { type: "text", text: SISTEMA },
        { type: "text", text: `# A Constituição do hub\n\n${constituicao}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: JSON.stringify(contexto.dados) },
            { type: "text", text: PEDIDO },
          ],
        },
      ],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
  } catch (e) {
    return erroDaApi(e);
  }

  if (mensagem.stop_reason === "refusal") {
    console.error("recusa", mensagem.stop_details);
    return erro(502, "O modelo recusou fazer esta revisão.");
  }
  if (mensagem.stop_reason === "max_tokens") return erro(502, "A resposta veio cortada. Tente de novo.");

  const textoDaResposta = mensagem.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  let bruto: unknown;
  try {
    bruto = JSON.parse(textoDaResposta);
  } catch {
    return erro(502, "A resposta veio num formato inesperado. Tente de novo.");
  }

  const revisao = conferir(bruto, contexto);
  if (!revisao.leitura) return erro(502, "A resposta veio sem a leitura da semana. Tente de novo.");
  if (revisao.descartes.length > 0) console.log("descartes", revisao.descartes);

  try {
    const id = await gravar(supabase, contexto, revisao, mensagem);
    return resposta(200, { id, descartes: revisao.descartes.length });
  } catch (e) {
    console.error(e);
    return erro(500, "A revisão foi feita, mas não foi possível gravá-la.");
  }
});
