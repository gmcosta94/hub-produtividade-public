import { registerSW } from 'virtual:pwa-register'

const MEIA_HORA = 30 * 60 * 1000

/**
 * Mantém o app na versão publicada, sem precisar fechar e abrir de novo
 * (o app do Dock e a aba que fica aberta dias seguidos).
 *
 * Procura versão nova ao abrir, a cada meia hora e sempre que a janela volta a ficar
 * visível. Achando, recarrega sozinho, mas só quando nada está sendo editado (nenhuma
 * folha aberta e nenhum campo em foco), para não perder um texto pela metade:
 * enquanto houver, tenta de novo a cada poucos segundos. Mesmo mecanismo do hub financeiro.
 */
export function manterAtualizado() {
  let pendente = false

  const atualizar = registerSW({
    immediate: true,
    onNeedRefresh() {
      pendente = true
      tentar()
    },
    onRegisteredSW(_url, registro) {
      if (!registro) return
      const procurar = () => {
        if (navigator.onLine) registro.update().catch(() => {})
      }
      setInterval(procurar, MEIA_HORA)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') procurar()
      })
    },
  })

  function editando() {
    const foco = document.activeElement?.tagName
    return !!document.querySelector('.fundo-folha') || foco === 'INPUT' || foco === 'SELECT' || foco === 'TEXTAREA'
  }

  function tentar() {
    if (!pendente) return
    if (editando()) {
      setTimeout(tentar, 3000)
      return
    }
    void atualizar(true)
  }
}
