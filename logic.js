// Regras do jogo sem ecrã nem rede: ler a folha, validar, baralhar, pontuar.

export const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function novoCodigo(rng = Math.random) {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALFABETO[Math.floor(rng() * ALFABETO.length)];
  return s;
}

export function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// Aceita o endereço normal da folha (o da barra do navegador) ou só o identificador.
export function idDaFolha(url) {
  const s = String(url || "").trim();
  if (/\/spreadsheets\/d\/e\//.test(s)) return { erro: "publicado" };
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return { id: m[1] };
  if (/^[a-zA-Z0-9_-]{30,}$/.test(s)) return { id: s };
  return { erro: "invalido" };
}

// Converte a resposta do Google numa tabela simples: cabeçalhos normalizados e linhas.
export function tabelaGviz(resp, obrigatorias = []) {
  if (!resp || resp.status === "error" || !resp.table) throw new Error("gviz");
  const texto = (cel) => {
    if (!cel || cel.v == null) return "";
    if (typeof cel.v === "number") return String(cel.f != null ? cel.f : cel.v).trim();
    return String(cel.v).trim();
  };
  let cab = (resp.table.cols || []).map((c) => norm(c.label));
  let linhas = resp.table.rows || [];
  let primeira = 2;
  if (!obrigatorias.every((k) => cab.includes(k)) && linhas.length) {
    const tentativa = (linhas[0].c || []).map((c) => norm(texto(c)));
    if (obrigatorias.every((k) => tentativa.includes(k))) {
      cab = tentativa;
      linhas = linhas.slice(1);
    }
  }
  const ok = obrigatorias.every((k) => cab.includes(k));
  return {
    ok,
    cab,
    linhas: linhas.map((r, i) => {
      const c = {};
      (r.c || []).forEach((cel, j) => { if (cab[j]) c[cab[j]] = texto(cel); });
      return { n: i + primeira, c };
    }),
  };
}

export const CFG_PADRAO = {
  pontos_facil: 100,
  pontos_medio: 150,
  pontos_dificil: 200,
  tempo_pergunta: 20,
  bonus_velocidade_max: 50,
  multiplicador_bonus: 2,
  joker_certo: 2,
  joker_errado: -50,
  tempo_joker: 8,
};

export function lerConfig(tab) {
  const cfg = { ...CFG_PADRAO, extras: [] };
  if (!tab || !tab.ok) return cfg;
  for (const l of tab.linhas) {
    const k = norm(l.c.chave).replace(/\s+/g, "_");
    const v = l.c.valor;
    if (!k || v == null || v === "") continue;
    if (k.startsWith("regra_extra")) { cfg.extras.push(v); continue; }
    const num = Number(String(v).replace(",", "."));
    if (!Number.isFinite(num) || !(k in CFG_PADRAO)) continue;
    if (k === "joker_errado") cfg[k] = -Math.abs(num);
    else if (num > 0 || (k === "bonus_velocidade_max" && num === 0)) cfg[k] = num;
  }
  return cfg;
}

const SIM = ["verdadeiro", "v", "true", "sim", "verdade"];
const NAO = ["falso", "f", "false", "nao", "mentira"];
const DICA_NUMERO = " (se for um número, formata a célula como Texto simples)";

export function validarPerguntas(tab) {
  const boas = [];
  const erros = [];
  for (const l of tab.linhas) {
    const c = l.c;
    if ([c.tema, c.pergunta, c.certa, c.errada1, c.errada2, c.errada3].every((v) => !v)) continue;
    const erro = (msg) => erros.push({ linha: l.n, msg });
    if (!c.pergunta) { erro("falta o texto da pergunta"); continue; }
    const dif = parseInt(c.dificuldade, 10);
    if (![1, 2, 3].includes(dif)) { erro("a dificuldade tem de ser 1, 2 ou 3"); continue; }
    let erradas = [c.errada1, c.errada2, c.errada3].filter(Boolean);
    const certaN = norm(c.certa);
    let tipo = norm(c.tipo).toUpperCase();
    if (!tipo) tipo = erradas.length === 0 && (SIM.includes(certaN) || NAO.includes(certaN)) ? "VF" : "EM";
    if (tipo !== "EM" && tipo !== "VF") { erro("o tipo tem de ser EM ou VF"); continue; }
    if (!c.certa) { erro("falta a resposta certa" + DICA_NUMERO); continue; }
    let certa = c.certa;
    if (tipo === "VF") {
      const v = SIM.includes(certaN);
      if (!v && !NAO.includes(certaN)) { erro("numa pergunta VF a resposta certa tem de ser Verdadeiro ou Falso"); continue; }
      certa = v ? "Verdadeiro" : "Falso";
      erradas = [v ? "Falso" : "Verdadeiro"];
    } else {
      if (!erradas.length) { erro("faltam as respostas erradas" + DICA_NUMERO); continue; }
      const todas = [certa, ...erradas].map(norm);
      if (new Set(todas).size !== todas.length) { erro("há respostas repetidas"); continue; }
    }
    let tempo = 0;
    if (c.tempo) {
      tempo = Number(String(c.tempo).replace(",", "."));
      if (!Number.isFinite(tempo) || tempo < 5 || tempo > 300) { erro("o tempo tem de ser um número entre 5 e 300 segundos"); continue; }
      tempo = Math.round(tempo);
    }
    let media = null;
    if (c.media) {
      media = mediaDe(c.media);
      if (!media) { erro("o link em media tem de acabar em .jpg, .png, .gif, .webp, .mp3, .m4a, .ogg ou .wav"); continue; }
    }
    boas.push({
      media,
      linha: l.n,
      tema: c.tema || "Geral",
      dif,
      tipo,
      texto: c.pergunta,
      certa,
      erradas,
      bonus: norm(c.bonus) === "2x",
      tempo,
    });
  }
  return { boas, erros };
}

// Diz se um link é de imagem ou de som, pela terminação do ficheiro.
export function mediaDe(link) {
  const u = String(link || "").trim();
  const fim = u.split(/[?#]/)[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(fim)) return { t: "img", u };
  if (/\.(mp3|m4a|aac|ogg|oga|wav)$/.test(fim)) return { t: "aud", u };
  return null;
}

export function baralhar(lista, rng = Math.random) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function filtrar(perguntas, { temas, difs }) {
  return perguntas.filter((q) => temas.includes(q.tema) && difs.includes(q.dif));
}

// Escolhe as perguntas do jogo e baralha as opções de cada uma.
export function fazerBaralho(perguntas, opts, rng = Math.random) {
  return baralhar(filtrar(perguntas, opts), rng).slice(0, opts.n).map((q) => {
    let opcoes, correta;
    if (q.tipo === "VF") {
      opcoes = ["Verdadeiro", "Falso"];
      correta = q.certa === "Verdadeiro" ? 0 : 1;
    } else {
      opcoes = baralhar([q.certa, ...q.erradas], rng);
      correta = opcoes.indexOf(q.certa);
    }
    return { tema: q.tema, dif: q.dif, tipo: q.tipo, texto: q.texto, opcoes, correta, bonus: !!q.bonus, tempo: q.tempo || 0, media: q.media || null };
  });
}

export function pontos(dif, pts) {
  return pts[dif - 1] || 0;
}

// Resultado de uma pergunta para cada equipa. As horas vêm do servidor.
// g = pontos ganhos (ou perdidos), v = parte da rapidez, x = multiplicador, j = jogou o joker.
export function pontuar({ correta, pts, respostas, equipas, inicio, duracao, folga = 1500, velMax = 0, mult = 1, jokers = {}, jokerCerto = 2, jokerErrado = -50 }) {
  const res = {};
  const limite = duracao * 1000;
  for (const id of Object.keys(equipas || {})) {
    const r = respostas && respostas[id];
    let c = -1, ok = false, t = limite;
    if (r && typeof r.c === "number") {
      const dt = (r.at || 0) - inicio;
      if (dt <= limite + folga) {
        c = r.c;
        ok = c === correta;
        t = Math.max(0, Math.min(dt, limite));
      }
    }
    const j = !!jokers[id];
    let v = 0, x = 1, g = 0;
    if (ok) {
      v = Math.round(velMax * (1 - t / limite));
      x = mult * (j ? jokerCerto : 1);
      g = (pts + v) * x;
    } else if (j) {
      g = jokerErrado;
    }
    res[id] = { c, ok, g, t, j, v, x };
  }
  return res;
}

// Soma tudo desde o início. Recalcular do zero evita contar uma pergunta duas vezes.
export function totais(hist, adj, equipas) {
  const tot = {};
  for (const id of Object.keys(equipas || {})) tot[id] = { pts: 0, t: 0 };
  for (const k of Object.keys(hist || {})) {
    for (const [id, r] of Object.entries(hist[k] || {})) {
      if (!tot[id]) continue;
      tot[id].pts += r.g || 0;
      tot[id].t += r.t || 0;
    }
  }
  for (const [id, v] of Object.entries(adj || {})) if (tot[id]) tot[id].pts += v || 0;
  return tot;
}

export function classificacao(tot, equipas, anterior, ganhos) {
  const lista = Object.keys(tot).map((id) => ({ id, nome: equipas[id].nome, pts: tot[id].pts, t: tot[id].t }));
  lista.sort((a, b) => b.pts - a.pts || a.t - b.t || a.nome.localeCompare(b.nome, "pt"));
  const out = {};
  lista.forEach((e, i) => {
    out[e.id] = {
      nome: e.nome,
      pts: e.pts,
      pos: i + 1,
      ant: (anterior && anterior[e.id] && anterior[e.id].pos) || 0,
      g: (ganhos && ganhos[e.id] && ganhos[e.id].g) || 0,
    };
  });
  return out;
}

export function emOrdem(scores) {
  return Object.entries(scores || {}).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.pos - b.pos);
}

const NOMES_DIF = ["fáceis", "médias", "difíceis"];

// As regras mostradas antes da primeira pergunta, escritas a partir das definições do jogo.
export function regras(cfg) {
  const r = [];
  r.push(`O jogo tem ${cfg.total} ${cfg.total === 1 ? "pergunta" : "perguntas"}, com ${cfg.tempo} segundos para responder a cada uma.`);
  r.push("Cada equipa responde num só telemóvel. Discutam baixinho e escolham juntos.");
  r.push("Só conta a primeira resposta. Depois de enviada, já não se pode mudar.");
  const difs = (cfg.difs || [1, 2, 3]).slice().sort();
  if (difs.length === 1) {
    r.push(`Cada resposta certa vale ${cfg.pts[difs[0] - 1]} pontos.`);
  } else {
    const partes = difs.map((d) => `${cfg.pts[d - 1]} nas ${NOMES_DIF[d - 1]}`);
    const ultima = partes.pop();
    r.push(`Uma resposta certa vale ${partes.join(", ").replace(" nas ", " pontos nas perguntas ")} e ${ultima}.`);
  }
  r.push("Resposta errada ou fora de tempo vale 0 pontos.");
  if (cfg.vel) r.push(`Quem acerta mais depressa ganha até ${cfg.vel} pontos extra.`);
  if (cfg.tem2x) r.push("Algumas perguntas valem a dobrar. O ecrã avisa antes.");
  if (cfg.joker) r.push(`Cada equipa tem um joker para o jogo inteiro. Joga-se antes de ver a pergunta: se acertarem, os pontos contam a dobrar; se errarem, perdem ${Math.abs(cfg.joker.errado)} pontos.`);
  r.push(cfg.placar === 1 ? "A classificação aparece depois de cada pergunta." : `A classificação aparece a cada ${cfg.placar} perguntas.`);
  r.push("Em caso de empate, fica à frente a equipa que respondeu mais depressa.");
  for (const e of cfg.extras || []) if (e) r.push(e);
  return r;
}

// ---------- Sorteio de equipas ----------

export const NOMES_EQUIPA = [
  "Sardinhas", "Pastéis de Nata", "Galos de Barcelos", "Francesinhas", "Bifanas", "Tremoços", "Bolas de Berlim",
  "Caracóis", "Manjericos", "Bacalhaus", "Alheiras", "Azulejos", "Cravos", "Ovos Moles",
];

export function lerNomes(texto) {
  return String(texto || "").split(/[\n,;]+/).map((s) => s.replace(/\s+/g, " ").trim().slice(0, 24)).filter(Boolean);
}

// Baralha as pessoas e distribui-as como cartas, para as equipas ficarem equilibradas.
export function sortear(pessoas, k, rng = Math.random) {
  const grupos = Array.from({ length: k }, () => []);
  baralhar(pessoas, rng).forEach((p, i) => grupos[i % k].push(p));
  return grupos;
}
