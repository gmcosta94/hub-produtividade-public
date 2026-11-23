// O assistente, nível 2: a conversa (docs/05-assistente.md).
//
// A pessoa pergunta; o modelo decide o que ler no hub, por ferramentas de
// leitura, e responde. A única escrita possível é registrar uma proposta, que
// só muda o hub quando a pessoa aceita.
//
// O histórico vai e volta exatamente como a API devolveu (só cresce), para os
// blocos de raciocínio continuarem válidos entre um turno e outro.

import {
  Anthropic,
  MODELO,
  REGRAS,
  autenticar,
  clienteDaApi,
  conferirProposta,
  constituicao,
  erro,
  erroDaApi,
  preflight,
  resposta,
  texto,
  type Catalogo,
  type SupabaseClient,
} from "../_compartilhado/base.ts";

type Mensagem = Anthropic.Beta.BetaMessageParam;
type Ferramenta = Anthropic.Beta.BetaTool;

const PERGUNTAS_POR_DIA = 40;
const RODADAS_MAX = 6;          // chamadas ao modelo por pergunta
const TEMPO_MAX_MS = 100_000;   // depois disso, a próxima rodada tem de responder
const PROPOSTAS_POR_RESPOSTA = 3;
const TEXTO_MAX = 12_000;       // tamanho máximo do que uma leitura devolve

const SISTEMA = `Você é o assistente de um hub pessoal de organização e produtividade e conversa com a pessoa que o usa. O hub tem áreas da vida (cada uma em foco, manutenção ou pausa), hábitos com pesos, um ciclo com objetivos, a semana, sessões de foco e de estudo, tarefas, projetos, notas e a Constituição (as regras do próprio sistema).

Seu papel é pensar junto: ajudar a ver o que está acontecendo, o que pesa e o que pode sair. Você não é um gerador de metas.

${REGRAS}

Sobre a conversa:
- Leia antes de afirmar. Use as ferramentas para buscar o que a pergunta pede; não responda de memória sobre números nem sobre o conteúdo de notas.
- Leia só o necessário. Uma ou duas leituras costumam bastar.
- Quando uma mudança fizer sentido, registre com a ferramenta "propor" (no máximo 3 por resposta) e diga na resposta o que propôs. A pessoa aceita ou recusa no app. Você não muda nada sozinho.
- Ideias de mudança na Constituição: proponha com tipo "livre" e diga que ficam para a revisão do ciclo.
- Respostas curtas: até umas 150 palavras, salvo se a pessoa pedir mais. Pode usar Markdown simples (listas e **negrito**); não use tabelas.
- Diga de onde vêm os números ("nas últimas 4 semanas, Exercício físico contou 2, 3, 1 e 2 dias").
- Se os dados não bastam para responder, diga isso.`;

const inteiro = (descricao: string) => ({ type: "integer", description: descricao });
const cadeia = (descricao: string) => ({ type: "string", description: descricao });

function ferramenta(name: string, description: string, properties: Record<string, unknown>): Ferramenta {
  return {
    name,
    description,
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    },
  } as Ferramenta;
}

const FERRAMENTAS: Ferramenta[] = [
  ferramenta("ler_semana", "A semana inteira: o que foi decidido (limites, áreas, ciclo, intenção) ao lado do que foi feito (hábitos, foco, tarefas, projetos, notas mexidas, emendas).", {
    semana: cadeia('Uma data AAAA-MM-DD de qualquer dia da semana desejada, ou "" para a semana atual.'),
  }),
  ferramenta("ler_area", "Uma área da vida: modo, padrão mínimo, estratégias, hábitos com as últimas 4 semanas, objetivos do ciclo, projetos e notas.", {
    area_id: inteiro("O id da área, do catálogo."),
  }),
  ferramenta("ler_habito", "Os registros dia a dia de um hábito num período.", {
    habito_id: inteiro("O id do hábito, do catálogo."),
    dias: inteiro("Quantos dias para trás, de 1 a 120."),
  }),
  ferramenta("ler_foco", "Sessões de foco e de estudo num período, com escopo e revisão de cada uma, e os totais por semana.", {
    dias: inteiro("Quantos dias para trás, de 1 a 120."),
  }),
  ferramenta("ler_projeto", "Um projeto: resultado esperado, objetivo que serve, tarefas e notas.", {
    projeto_id: inteiro("O id do projeto, do catálogo."),
  }),
  ferramenta("buscar_notas", "Busca notas pelo título ou pelo texto. Devolve até 15, com um trecho de cada.", {
    termo: cadeia("A palavra ou expressão a buscar."),
  }),
  ferramenta("ler_nota", "O texto inteiro de uma nota.", {
    nota_id: inteiro("O id da nota, de buscar_notas, ler_area ou ler_projeto."),
  }),
  ferramenta("ler_sistema", "Um texto da Constituição e o histórico de emendas dele.", {
    chave: cadeia('A chave do texto (do catálogo, em "textos_do_sistema") ou o título exato.'),
  }),
  ferramenta("ler_revisoes", "As últimas revisões da semana feitas pelo assistente e o que a pessoa decidiu sobre as propostas.", {}),
  ferramenta("propor", "Registra uma proposta de mudança para a pessoa aceitar ou recusar no app.", {
    tipo: { type: "string", enum: ["peso_do_habito", "meta_do_habito", "nivel_do_objetivo", "estado_do_projeto", "modo_da_area", "livre"] },
    alvo_id: inteiro("O id do item, do catálogo; 0 para livre."),
    valor: cadeia('O valor novo; "" para livre.'),
    texto: cadeia("A mudança, numa frase."),
    motivo: cadeia("Por quê, apoiado nos dados."),
  }),
];

type Leitura = { nome: string; resumo: string; saida: string; erro: boolean };

const limitar = (s: string) =>
  s.length <= TEXTO_MAX ? s : `${s.slice(0, TEXTO_MAX)}\n[cortado: o resultado tinha ${s.length} caracteres]`;

async function rpc(supabase: SupabaseClient, funcao: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc(funcao, args);
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Nada encontrado com esse id ou chave.");
  return limitar(JSON.stringify(data));
}

// Executa uma ferramenta. Erros voltam para o modelo como resultado de erro.
async function executar(
  supabase: SupabaseClient,
  catalogo: Catalogo,
  conversaId: number,
  propostas: { feitas: number },
  bloco: Anthropic.Beta.BetaToolUseBlock,
): Promise<Leitura> {
  const e = (bloco.input ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isInteger(v) ? (v as number) : 0);
  // Nome do item, para mostrar na tela o que foi lido.
  const nome = (lista: { id: number; nome?: string; titulo?: string }[] | null, id: number) => {
    const item = (lista ?? []).find((x) => x.id === id);
    return item?.nome ?? item?.titulo ?? `#${id}`;
  };
  const cat = catalogo as Catalogo & Record<string, { id: number; nome?: string }[] | null>;
  const dias = (v: unknown) => Math.min(Math.max(num(v) || 28, 1), 120);
  try {
    switch (bloco.name) {
      case "ler_semana": {
        const semana = /^\d{4}-\d{2}-\d{2}$/.test(texto(e.semana)) ? texto(e.semana) : null;
        return { nome: bloco.name, resumo: semana ? `semana de ${semana}` : "esta semana", saida: await rpc(supabase, "revisao_da_semana", { p_semana: semana }), erro: false };
      }
      case "ler_area":
        return { nome: bloco.name, resumo: `área ${nome(cat.areas, num(e.area_id))}`, saida: await rpc(supabase, "assistente_area", { p_area_id: num(e.area_id) }), erro: false };
      case "ler_habito":
        return { nome: bloco.name, resumo: `${nome(cat.habitos, num(e.habito_id))}, ${dias(e.dias)} dias`, saida: await rpc(supabase, "assistente_habito", { p_habito_id: num(e.habito_id), p_dias: dias(e.dias) }), erro: false };
      case "ler_foco":
        return { nome: bloco.name, resumo: `sessões de foco, ${dias(e.dias)} dias`, saida: await rpc(supabase, "assistente_foco", { p_dias: dias(e.dias) }), erro: false };
      case "ler_projeto":
        return { nome: bloco.name, resumo: `projeto ${nome(cat.projetos, num(e.projeto_id))}`, saida: await rpc(supabase, "assistente_projeto", { p_projeto_id: num(e.projeto_id) }), erro: false };
      case "buscar_notas":
        return { nome: bloco.name, resumo: `notas com "${texto(e.termo)}"`, saida: await rpc(supabase, "assistente_buscar_notas", { p_termo: texto(e.termo) }), erro: false };
      case "ler_nota":
        return { nome: bloco.name, resumo: "uma nota", saida: await rpc(supabase, "assistente_nota", { p_nota_id: num(e.nota_id) }), erro: false };
      case "ler_sistema":
        return { nome: bloco.name, resumo: `Sistema: ${texto(e.chave)}`, saida: await rpc(supabase, "assistente_sistema", { p_chave: texto(e.chave) }), erro: false };
      case "ler_revisoes": {
        const { data, error } = await supabase
          .from("revisao")
          .select("semana, leitura, observacoes, proposta(texto, estado, motivo_da_recusa)")
          .order("criado_em", { ascending: false })
          .limit(4);
        if (error) throw new Error(error.message);
        return { nome: bloco.name, resumo: "revisões anteriores", saida: limitar(JSON.stringify(data)), erro: false };
      }
      case "propor": {
        if (propostas.feitas >= PROPOSTAS_POR_RESPOSTA) throw new Error(`Já há ${PROPOSTAS_POR_RESPOSTA} propostas nesta resposta.`);
        const item = conferirProposta(e, catalogo);
        if (typeof item === "string") throw new Error(`Proposta não registrada: ${item}.`);
        const { error } = await supabase.from("proposta").insert({
          conversa_id: conversaId,
          tipo: item.tipo,
          alvo_id: item.alvo_id || null,
          valor: item.tipo === "livre" ? null : item.valor,
          texto: item.texto,
          motivo: item.motivo || null,
        });
        if (error) throw new Error(error.message);
        propostas.feitas++;
        return { nome: bloco.name, resumo: "proposta", saida: "Proposta registrada. A pessoa decide no app.", erro: false };
      }
      default:
        throw new Error(`Ferramenta desconhecida: ${bloco.name}.`);
    }
  } catch (x) {
    return { nome: bloco.name, resumo: bloco.name, saida: x instanceof Error ? x.message : String(x), erro: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return erro(405, "Use POST.");

  const supabase = await autenticar(req);
  if (supabase instanceof Response) return supabase;

  const pedido = await req.json().catch(() => ({}));
  const pergunta = texto(pedido?.texto);
  if (!pergunta) return erro(400, "Escreva uma pergunta.");
  if (pergunta.length > 4000) return erro(400, "A pergunta é longa demais. Tente resumir.");

  const { data: hoje } = await supabase.rpc("perguntas_de_hoje");
  if ((hoje ?? 0) >= PERGUNTAS_POR_DIA) {
    return erro(429, `Já foram ${PERGUNTAS_POR_DIA} perguntas hoje. O limite evita gasto à toa; continue amanhã.`);
  }

  const anthropic = clienteDaApi();
  if (anthropic instanceof Response) return anthropic;

  // A conversa: uma existente, ou uma nova com o catálogo no primeiro turno.
  let conversaId = Number.isInteger(pedido?.conversa_id) ? (pedido.conversa_id as number) : null;
  let historico: Mensagem[] = [];
  const nova = conversaId === null;
  const { data: catalogo, error: erroDoCatalogo } = await supabase.rpc("assistente_catalogo");
  if (erroDoCatalogo || !catalogo) return erro(500, "Não foi possível ler o hub.");

  if (nova) {
    const { data, error } = await supabase
      .from("conversa")
      .insert({ titulo: pergunta.length > 70 ? `${pergunta.slice(0, 67)}…` : pergunta })
      .select("id")
      .single();
    if (error || !data) return erro(500, "Não foi possível abrir a conversa.");
    conversaId = data.id as number;
  } else {
    const { data, error } = await supabase.from("conversa").select("historico").eq("id", conversaId).maybeSingle();
    if (error || !data) return erro(404, "Conversa não encontrada.");
    historico = data.historico as Mensagem[];
  }

  const novas: Mensagem[] = [
    {
      role: "user",
      content: nova
        ? [
            { type: "text", text: `Catálogo do hub (os ids servem para as ferramentas):\n${JSON.stringify(catalogo)}` },
            { type: "text", text: pergunta },
          ]
        : [
            { type: "text", text: `Hoje é ${(catalogo as { hoje: string }).hoje}.` },
            { type: "text", text: pergunta },
          ],
    },
  ];

  const sistema = [
    { type: "text", text: SISTEMA },
    { type: "text", text: `# A Constituição do hub\n\n${await constituicao(supabase)}`, cache_control: { type: "ephemeral" } },
  ];

  const desfazer = async () => {
    if (nova) await supabase.from("conversa").delete().eq("id", conversaId);
    else await supabase.from("proposta").delete().eq("conversa_id", conversaId).gte("criado_em", inicioIso);
  };
  const inicio = Date.now();
  const inicioIso = new Date(inicio).toISOString();
  const leituras: string[] = [];
  const propostas = { feitas: 0 };
  let final: Anthropic.Beta.BetaMessage | null = null;

  for (let rodada = 1; rodada <= RODADAS_MAX; rodada++) {
    const ultima = rodada === RODADAS_MAX || Date.now() - inicio > TEMPO_MAX_MS;
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await anthropic.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: sistema,
        tools: FERRAMENTAS,
        tool_choice: ultima ? { type: "none" } : { type: "auto" },
        messages: [...historico, ...novas],
      } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
    } catch (e) {
      await desfazer();
      return erroDaApi(e);
    }

    if (msg.stop_reason === "refusal") {
      console.error("recusa", msg.stop_details);
      await desfazer();
      return erro(502, "O modelo recusou responder a esta pergunta.");
    }
    if (msg.stop_reason === "max_tokens") {
      await desfazer();
      return erro(502, "A resposta veio cortada. Tente perguntar de outro jeito.");
    }

    // O conteúdo volta exatamente como veio, raciocínio incluído.
    novas.push({ role: "assistant", content: msg.content } as unknown as Mensagem);
    if (msg.stop_reason !== "tool_use") {
      final = msg;
      break;
    }

    const pedidos = msg.content.filter((b) => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlock[];
    const resultados = await Promise.all(
      pedidos.map((b) => executar(supabase, catalogo as Catalogo, conversaId!, propostas, b)),
    );
    resultados.forEach((r) => !r.erro && r.nome !== "propor" && leituras.push(r.resumo));
    novas.push({
      role: "user",
      content: pedidos.map((b, i) => ({
        type: "tool_result",
        tool_use_id: b.id,
        content: resultados[i].saida,
        is_error: resultados[i].erro,
      })),
    });
  }

  if (!final) {
    await desfazer();
    return erro(502, "O assistente não chegou a uma resposta. Tente perguntar de outro jeito.");
  }

  const textoFinal = final.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
  if (!textoFinal) {
    await desfazer();
    return erro(502, "A resposta veio vazia. Tente de novo.");
  }

  const { error: e1 } = await supabase
    .from("conversa")
    .update({ historico: [...historico, ...novas] })
    .eq("id", conversaId);
  const { error: e2 } = await supabase.from("mensagem").insert([
    { conversa_id: conversaId, papel: "usuario", texto: pergunta },
    { conversa_id: conversaId, papel: "assistente", texto: textoFinal, leituras },
  ]);
  if (e1 || e2) {
    console.error("gravar", e1, e2);
    return erro(500, "A resposta veio, mas não foi possível gravá-la.");
  }

  return resposta(200, { conversa_id: conversaId, propostas: propostas.feitas });
});
