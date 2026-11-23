import type { ReactNode } from 'react'

// Leitor de Markdown enxuto para os textos da Constituição e das estratégias.
// Cobre o que esses textos usam: títulos (##), parágrafos, listas, listas
// numeradas, listas de marcação (- [ ]), tabelas simples e **negrito**.
// As marcações de uma lista de marcação não são guardadas: valem só enquanto
// a tela está aberta.

type Bloco =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'lista'; ordenada: boolean; itens: { texto: string; marcavel: boolean; nivel: number }[] }
  | { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] }

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function emBlocos(fonte: string): Bloco[] {
  const blocos: Bloco[] = []
  const linhas = fonte.split('\n')
  let i = 0
  while (i < linhas.length) {
    const linha = linhas[i]
    if (linha.trim() === '') {
      i++
      continue
    }
    const titulo = /^#{1,6}\s+(.*)$/.exec(linha)
    if (titulo) {
      blocos.push({ tipo: 'titulo', texto: titulo[1] })
      i++
      continue
    }
    if (linha.trim().startsWith('|')) {
      const tabela: string[][] = []
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        tabela.push(celulas(linhas[i]))
        i++
      }
      // a segunda linha (|---|---|) só separa o cabeçalho
      const corpo = tabela.slice(1).filter((l) => !l.every((c) => /^:?-+:?$/.test(c)))
      blocos.push({ tipo: 'tabela', cabecalho: tabela[0], linhas: corpo })
      continue
    }
    const item = /^(\s*)(-|\d+\.)\s+(.*)$/
    if (item.test(linha)) {
      const primeiro = item.exec(linha)!
      const ordenada = primeiro[2] !== '-'
      const itens: { texto: string; marcavel: boolean; nivel: number }[] = []
      while (i < linhas.length && item.test(linhas[i])) {
        const m = item.exec(linhas[i])!
        const marcacao = /^\[[ xX]\]\s+(.*)$/.exec(m[3])
        itens.push({
          texto: marcacao ? marcacao[1] : m[3],
          marcavel: marcacao !== null,
          nivel: m[1].length >= 2 ? 1 : 0,
        })
        i++
      }
      blocos.push({ tipo: 'lista', ordenada, itens })
      continue
    }
    const paragrafo: string[] = []
    while (
      i < linhas.length &&
      linhas[i].trim() !== '' &&
      !/^#{1,6}\s/.test(linhas[i]) &&
      !item.test(linhas[i]) &&
      !linhas[i].trim().startsWith('|')
    ) {
      paragrafo.push(linhas[i].trim())
      i++
    }
    blocos.push({ tipo: 'paragrafo', texto: paragrafo.join(' ') })
  }
  return blocos
}

function comNegrito(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/).map((parte, i) =>
    parte.startsWith('**') && parte.endsWith('**') ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte,
  )
}

export function Texto({ fonte }: { fonte: string }) {
  return (
    <div className="texto">
      {emBlocos(fonte).map((b, i) => {
        if (b.tipo === 'titulo') return <h3 key={i}>{comNegrito(b.texto)}</h3>
        if (b.tipo === 'paragrafo') return <p key={i}>{comNegrito(b.texto)}</p>
        if (b.tipo === 'tabela') {
          return (
            <div key={i} className="rolagem">
              <table>
                <thead>
                  <tr>
                    {b.cabecalho.map((c, j) => (
                      <th key={j}>{comNegrito(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.linhas.map((l, j) => (
                    <tr key={j}>
                      {l.map((c, k) => (
                        <td key={k}>{comNegrito(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        const Lista = b.ordenada ? 'ol' : 'ul'
        const marcavel = b.itens.some((it) => it.marcavel)
        return (
          <Lista key={i} className={marcavel ? 'marcacao' : undefined}>
            {b.itens.map((it, j) => (
              <li key={j} className={it.nivel > 0 ? 'recuado' : undefined}>
                {it.marcavel ? (
                  <label>
                    <input type="checkbox" />
                    <span>{comNegrito(it.texto)}</span>
                  </label>
                ) : (
                  comNegrito(it.texto)
                )}
              </li>
            ))}
          </Lista>
        )
      })}
    </div>
  )
}
