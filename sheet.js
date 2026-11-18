// Lê uma folha do Google Sheets pelo nome. O pedido é feito com uma etiqueta <script>,
// que funciona em qualquer navegador sem configuração do lado do Google.

export function lerFolha(id, nome, esperaMs = 12000) {
  return new Promise((resolve, reject) => {
    const cb = "__folha_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    let feito = false;
    const fim = (erro, dados) => {
      if (feito) return;
      feito = true;
      clearTimeout(relogio);
      window[cb] = () => {};
      s.remove();
      if (erro) reject(erro); else resolve(dados);
    };
    const relogio = setTimeout(() => fim(new Error("sem-resposta")), esperaMs);
    window[cb] = (dados) => fim(null, dados);
    s.onerror = () => fim(new Error("sem-acesso"));
    s.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:json;responseHandler:${cb}&headers=1&sheet=${encodeURIComponent(nome)}`;
    document.head.appendChild(s);
  });
}
