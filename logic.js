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
  mimica_1: 100,
  mimica_2: 80,
  mimica_3: 60,
  mimica_restantes: 40,
  mimica_atores_max: 150,
  mimica_mult_medio: 1.5,
  mimica_mult_dificil: 2,
  tempo_mimica: 60,
  perguntas_por_mimica: 5,
};

export function lerConfig(tab) {
  const cfg = { ...CFG_PADRAO, pista_mimica: false, extras: [] };
  if (!tab || !tab.ok) return cfg;
  for (const l of tab.linhas) {
    const k = norm(l.c.chave).replace(/\s+/g, "_");
    const v = l.c.valor;
    if (!k || v == null || v === "") continue;
    if (k.startsWith("regra_extra")) { cfg.extras.push(v); continue; }
    if (k === "pista_mimica") { cfg[k] = ["sim", "s", "true", "1", "yes"].includes(norm(v)); continue; }
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
  const m = cfg.mim;
  if (m) {
    r.push(`${m.cada === 1 ? "Depois de cada pergunta" : `A cada ${m.cada} perguntas`} há uma ronda de mímica: uma equipa representa e as outras escrevem no telemóvel o que acham que é.`);
    r.push(`Na mímica, a primeira equipa a adivinhar ganha ${m.pts[0]} pontos e as seguintes ${m.pts[1]}, ${m.pts[2]} e ${m.pts[3]}. Quem representa ganha até ${m.atores}, conforme o número de equipas que acertarem.`);
    r.push(`Quem representa não pode falar, fazer sons nem escrever.${m.pista ? " A meio do tempo aparece uma letra de ajuda." : ""}`);
  }
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

// ---------- Mímica ----------

const ARTIGOS = /^(o|a|os|as|um|uma|uns|umas)\s+/;

// Deixa só letras e números, sem acentos, maiúsculas, pontuação nem artigo no início.
export function limpaPalpite(texto) {
  return norm(texto).replace(/[^a-z0-9]+/g, " ").trim().replace(ARTIGOS, "");
}

// Verdadeiro se as duas palavras diferem, no máximo, numa letra (trocada, a mais, a menos ou fora do sítio).
function quaseIgual(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Diz se um palpite acerta no desafio: a resposta ou uma das alternativas.
// Em respostas com 6 ou mais letras perdoa-se um erro de escrita.
export function acerta(palpite, desafio) {
  const g = limpaPalpite(palpite).replace(/ /g, "");
  if (!g) return false;
  return [desafio.r, ...(desafio.alt || [])].some((x) => {
    const a = limpaPalpite(x).replace(/ /g, "");
    return !!a && (g === a || (a.length >= 6 && quaseIgual(g, a)));
  });
}

const arrumada = (resposta) => Array.from(String(resposta).replace(/\s+/g, " ").trim());
const eLetra = (ch) => /[\p{L}\p{N}]/u.test(ch);

// O desenho da resposta para o ecrã: um traço por letra, espaços e pontuação à vista.
export function forma(resposta) {
  return arrumada(resposta).map((ch) => (eLetra(ch) ? "_" : ch)).join("");
}

// Revela uma letra ao acaso. Se só faltar uma letra, não revela nada.
export function comPista(formaAtual, resposta, rng = Math.random) {
  const letras = arrumada(resposta);
  const f = Array.from(formaAtual);
  const livres = f.map((c, i) => (c === "_" ? i : -1)).filter((i) => i >= 0);
  if (livres.length < 2) return formaAtual;
  const i = livres[Math.floor(rng() * livres.length)];
  f[i] = letras[i].toUpperCase();
  return f.join("");
}

export function validarMimicas(tab) {
  const boas = [];
  const erros = [];
  for (const l of tab.linhas) {
    const c = l.c;
    if ([c.tema, c.categoria, c.resposta, c.alternativas].every((v) => !v)) continue;
    const erro = (msg) => erros.push({ linha: l.n, msg });
    if (!c.resposta) { erro("falta a resposta" + DICA_NUMERO); continue; }
    if (!limpaPalpite(c.resposta)) { erro("a resposta tem de ter letras ou números"); continue; }
    const dif = parseInt(c.dificuldade, 10);
    if (![1, 2, 3].includes(dif)) { erro("a dificuldade tem de ser 1, 2 ou 3"); continue; }
    boas.push({
      linha: l.n,
      tema: c.tema || "Geral",
      cat: c.categoria || "Mímica",
      dif,
      r: c.resposta.replace(/\s+/g, " ").trim().slice(0, 40),
      alt: String(c.alternativas || "").split(";").map((x) => x.trim()).filter(Boolean).slice(0, 10),
      bonus: norm(c.bonus) === "2x",
    });
  }
  return { boas, erros };
}

// Pontos de uma ronda de mímica. ordem = equipas que adivinharam, da primeira à última;
// outros = equipas que podiam adivinhar. pos = lugar em que adivinhou (0 = não adivinhou).
export function pontuarMimica({ ordem, outros, ator, equipas, pts = [100, 80, 60, 40], atores = 150, multDif = 1, multBonus = 1 }) {
  const res = {};
  for (const id of Object.keys(equipas || {})) res[id] = { g: 0, t: 0, pos: 0 };
  const certos = ordem.filter((id, i) => res[id] && id !== ator && ordem.indexOf(id) === i);
  certos.forEach((id, i) => {
    res[id] = { g: Math.round(pts[Math.min(i, pts.length - 1)] * multDif) * multBonus, t: 0, pos: i + 1 };
  });
  if (res[ator]) {
    const de = Math.max(certos.length, outros.filter((id) => id !== ator).length);
    const parte = de ? certos.length / de : 0;
    res[ator] = { g: Math.round(atores * parte * multDif) * multBonus, t: 0, pos: 0, ator: true, n: certos.length, de };
  }
  return res;
}
