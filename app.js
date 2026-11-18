// Quiz & Mímica, fase 1: sala, entrada por QR, perguntas, relógio, pontos e classificação.

import * as net from "./net.js";
import { lerFolha } from "./sheet.js";
import * as L from "./logic.js";
import { qrSvg } from "./qr.js";
import { NOME_DO_JOGO } from "./config.js";

const app = document.getElementById("app");
const aviso = document.getElementById("aviso");
const params = new URLSearchParams(location.search);
const SALA = (params.get("sala") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
const pedida = params.get("v");
const VISTA = pedida === "criar" ? "criar"
  : SALA.length === 4 ? (pedida === "host" || pedida === "ecra" ? pedida : "equipa")
  : "inicio";
const BASE = location.origin + location.pathname;
const LETRAS = ["A", "B", "C", "D"];
const DIFS = { 1: "Fácil", 2: "Média", 3: "Difícil" };

// undefined = ainda a carregar; null = não existe.
const S = {
  uid: null, meta: undefined, estado: undefined, equipas: undefined, priv: undefined,
  respostas: null, respKey: null, minha: null,
  ui: { criar: { passo: "folha" } },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const caminho = (p) => `rooms/${SALA}/${p}`;
const souAnfitriao = () => !!S.meta && S.meta.hostUid === S.uid;
const limita = (v, min, max) => Math.max(min, Math.min(max, v));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function guarda(k, v) { try { localStorage.setItem("qm_" + k, v); } catch { /* sem armazenamento */ } }
function lembra(k) { try { return localStorage.getItem("qm_" + k) || ""; } catch { return ""; } }

// ---------- Desenho ----------

let marcado = false;
let ultimo = null;

function pintar() {
  if (marcado) return;
  marcado = true;
  setTimeout(() => { marcado = false; desenhar(); }, 0);
}

function desenhar() {
  const html = VISTAS[VISTA]();
  if (html === ultimo) { tique(); return; }
  // Guarda o que a pessoa já escreveu, para não se perder ao redesenhar.
  const ativo = document.activeElement && document.activeElement.id;
  const escrito = {};
  app.querySelectorAll("input[id], textarea[id]").forEach((el) => {
    escrito[el.id] = el.type === "checkbox" ? { c: el.checked } : { v: el.value };
  });
  app.innerHTML = html;
  ultimo = html;
  for (const [id, g] of Object.entries(escrito)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if ("c" in g) el.checked = g.c; else el.value = g.v;
  }
  if (ativo) { const el = document.getElementById(ativo); if (el) el.focus(); }
  if (VISTA === "criar") atualizarDisponiveis();
  tique();
}

function mostraAviso(texto) {
  aviso.textContent = texto || "";
  aviso.hidden = !texto;
}

function falha(e) {
  console.error(e);
  mostraAviso("Não deu para gravar. Verifica a ligação à internet e tenta outra vez.");
  setTimeout(() => { if (ligado) mostraAviso(""); }, 5000);
}

const espera = (texto = "A ligar ao jogo…") => `<main class="centro"><p class="espera">${esc(texto)}</p></main>`;

function mensagem(titulo, texto, botao = `<a class="btn" href="${esc(BASE)}">Voltar ao início</a>`) {
  return `<main class="centro"><div class="grinalda"></div><h1 class="titulo">${esc(titulo)}</h1><p class="nota">${esc(texto)}</p>${botao}</main>`;
}

const semSala = () => mensagem("Sala não encontrada", `Não existe nenhum jogo com o código ${SALA}. Confirma as quatro letras no ecrã principal.`);

function etiquetas(e) {
  return `<p class="etiquetas"><span class="etq forte">Pergunta ${e.qNum} de ${e.total}</span><span class="etq">${esc(e.q.tema)}</span><span class="etq">${DIFS[e.q.dif]}</span><span class="etq">${e.q.pts} pontos</span></p>`;
}

const relogio = () => `<div class="tempo"><div class="trilho"><div class="barra" data-barra></div></div><b class="seg" data-seg></b></div>`;

function listaPontos(scores, destaque) {
  const linhas = L.emOrdem(scores).map((s) => {
    let mov = "";
    if (s.ant && s.ant > s.pos) mov = `<span class="mov sobe" title="Subiu ${s.ant - s.pos}">▲ ${s.ant - s.pos}</span>`;
    else if (s.ant && s.ant < s.pos) mov = `<span class="mov desce" title="Desceu ${s.pos - s.ant}">▼ ${s.pos - s.ant}</span>`;
    return `<li class="${s.id === destaque ? "eu" : ""}"><span class="pos">${s.pos}.º</span><span class="nome">${esc(s.nome)}</span>${mov}${s.g ? `<span class="ganho">+${s.g}</span>` : ""}<span class="pts">${s.pts}</span></li>`;
  });
  return linhas.length ? `<ol class="placar">${linhas.join("")}</ol>` : `<p class="nota">Ainda não há pontos.</p>`;
}

function listaRegras(cfg) {
  return `<ul class="regras">${L.regras(cfg).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
}

const VISTAS = {};

// ---------- Início ----------

VISTAS.inicio = () => {
  const ult = lembra("sala");
  return `<main class="centro">
    <div class="grinalda"></div>
    <h1 class="logo">${esc(NOME_DO_JOGO)}</h1>
    <form class="cartao" data-form="entrar">
      <label for="cod">Código da sala</label>
      <input id="cod" class="campo-codigo" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" required>
      <button class="btn">Entrar na sala</button>
    </form>
    <p><a class="btn sec" href="${esc(BASE)}?v=criar">Criar um jogo</a></p>
    ${ult ? `<p class="nota"><a href="${esc(BASE)}?sala=${esc(ult)}&v=host">Voltar a controlar o jogo ${esc(ult)}</a></p>` : ""}
  </main>`;
};

// ---------- Criar um jogo (anfitrião) ----------

VISTAS.criar = () => {
  const c = S.ui.criar;
  let corpo = `<form class="cartao" data-form="folha">
      <label for="url">Endereço da folha de perguntas</label>
      <input id="url" type="text" inputmode="url" value="${esc(lembra("folha"))}" placeholder="https://docs.google.com/spreadsheets/d/…" required>
      <p class="ajuda">Cola o endereço que aparece na barra do navegador quando abres a folha no Google Sheets.</p>
      <button class="btn" ${c.aCarregar ? "disabled" : ""}>${c.aCarregar ? "A ler a folha…" : (c.passo === "opcoes" ? "Ler a folha outra vez" : "Ler as perguntas")}</button>
      ${c.erro ? `<p class="erro" role="alert">${esc(c.erro)}</p>` : ""}
    </form>`;
  if (c.passo === "opcoes") {
    const temas = {};
    c.perguntas.forEach((q) => { temas[q.tema] = (temas[q.tema] || 0) + 1; });
    const nomes = Object.keys(temas).sort((a, b) => a.localeCompare(b, "pt"));
    corpo += `<section class="cartao">
      <h2>${plural(c.perguntas.length, "pergunta pronta", "perguntas prontas")} a usar</h2>
      ${c.erros.length ? `<details class="problemas"><summary>${plural(c.erros.length, "linha fica de fora", "linhas ficam de fora")} até ${c.erros.length === 1 ? "ser corrigida" : "serem corrigidas"}</summary><ul>${c.erros.map((e) => `<li>Linha ${e.linha}: ${esc(e.msg)}</li>`).join("")}</ul></details>` : ""}
    </section>`;
    if (c.perguntas.length) {
      corpo += `<form class="cartao" data-form="criar">
        <fieldset><legend>Temas</legend><div class="caixas">
          ${nomes.map((t, i) => `<label class="caixa"><input type="checkbox" id="t_${i}" data-tema="${esc(t)}" checked> ${esc(t)} <span class="conta">${temas[t]}</span></label>`).join("")}
        </div></fieldset>
        <fieldset><legend>Dificuldade</legend><div class="caixas">
          ${[1, 2, 3].map((d) => `<label class="caixa"><input type="checkbox" id="d_${d}" data-dif="${d}" checked> ${DIFS[d]} <span class="conta">${c.cfg["pontos_" + ["facil", "medio", "dificil"][d - 1]]} pts</span></label>`).join("")}
        </div></fieldset>
        <div class="linha-campos">
          <div><label for="n">Número de perguntas</label><input id="n" type="number" min="1" value="${Math.min(10, c.perguntas.length)}" inputmode="numeric"><p class="ajuda" id="disp"></p></div>
          <div><label for="tempo">Segundos por pergunta</label><input id="tempo" type="number" min="5" max="300" value="${c.cfg.tempo_pergunta}" inputmode="numeric"></div>
          <div><label for="placar">Mostrar a classificação a cada</label><input id="placar" type="number" min="1" max="50" value="1" inputmode="numeric"><p class="ajuda">perguntas</p></div>
        </div>
        <label for="extra">Regras da casa</label>
        <textarea id="extra" rows="3" placeholder="Opcional. Uma regra por linha, para aparecer no ecrã das regras.">${esc(lembra("extra"))}</textarea>
        ${c.erroCriar ? `<p class="erro" role="alert">${esc(c.erroCriar)}</p>` : ""}
        <button class="btn" ${c.aCriar ? "disabled" : ""}>${c.aCriar ? "A criar a sala…" : "Criar a sala"}</button>
      </form>`;
    }
  }
  return `<main class="coluna"><h1 class="titulo">Criar um jogo</h1>${corpo}<p class="nota"><a href="${esc(BASE)}">Voltar ao início</a></p></main>`;
};

function escolhasCriar() {
  const temas = [...app.querySelectorAll("input[data-tema]:checked")].map((i) => i.dataset.tema);
  const difs = [...app.querySelectorAll("input[data-dif]:checked")].map((i) => Number(i.dataset.dif));
  return { temas, difs };
}

function atualizarDisponiveis() {
  const el = document.getElementById("disp");
  const c = S.ui.criar;
  if (!el || !c.perguntas) return;
  const n = L.filtrar(c.perguntas, escolhasCriar()).length;
  el.textContent = n ? `Há ${n} com estes temas e dificuldades.` : "Não há perguntas com estes temas e dificuldades.";
  const campo = document.getElementById("n");
  if (campo) campo.max = Math.max(1, n);
}

const FORMS = {};
const ACOES = {};

FORMS.entrar = (form) => {
  const cod = form.querySelector("#cod").value.toUpperCase().replace(/[^A-Z]/g, "");
  if (cod.length === 4) location.href = `${BASE}?sala=${cod}`;
};

FORMS.folha = async (form) => {
  const c = S.ui.criar;
  const url = form.querySelector("#url").value;
  const r = L.idDaFolha(url);
  if (r.erro) {
    c.erro = r.erro === "publicado"
      ? "Esse é o link de publicação. Cola antes o endereço normal da folha, o que aparece na barra do navegador quando a abres."
      : "Isso não parece o endereço de uma folha do Google Sheets.";
    return pintar();
  }
  c.erro = ""; c.aCarregar = true; pintar();
  try {
    const [perg, conf] = await Promise.all([lerFolha(r.id, "Perguntas"), lerFolha(r.id, "Config").catch(() => null)]);
    const tab = L.tabelaGviz(perg, ["pergunta", "certa"]);
    if (!tab.ok) throw new Error("sem-folha");
    const v = L.validarPerguntas(tab);
    let tabCfg = null;
    try { tabCfg = conf && L.tabelaGviz(conf, ["chave", "valor"]); } catch { /* usa os valores normais */ }
    c.cfg = L.lerConfig(tabCfg);
    c.perguntas = v.boas;
    c.erros = v.erros;
    c.passo = "opcoes";
    guarda("folha", url);
  } catch (e) {
    c.erro = e.message === "sem-folha"
      ? 'Não encontrei a folha "Perguntas" com as colunas "pergunta" e "certa". Confirma os nomes das folhas e a primeira linha.'
      : 'Não consegui ler a folha. Abre-a no Google Sheets, carrega em Partilhar e escolhe "Qualquer pessoa com o link". Depois tenta outra vez.';
  }
  c.aCarregar = false;
  pintar();
};

FORMS.criar = async (form) => {
  const c = S.ui.criar;
  const escolhas = escolhasCriar();
  const disp = L.filtrar(c.perguntas, escolhas).length;
  if (!disp) { c.erroCriar = "Com esses temas e dificuldades não há perguntas. Escolhe mais opções."; return pintar(); }
  const num = (id, pad) => parseInt(form.querySelector("#" + id).value, 10) || pad;
  const n = limita(num("n", 10), 1, disp);
  const tempo = limita(num("tempo", 20), 5, 300);
  const placar = limita(num("placar", 1), 1, 50);
  const texto = form.querySelector("#extra").value;
  const extras = [...c.cfg.extras, ...texto.split("\n").map((s) => s.trim()).filter(Boolean)].slice(0, 8);
  guarda("extra", texto);
  c.erroCriar = ""; c.aCriar = true; pintar();
  try {
    const deck = L.fazerBaralho(c.perguntas, { ...escolhas, n });
    let codigo = "";
    for (let i = 0; i < 8; i++) {
      codigo = L.novoCodigo();
      if ((await net.read(`rooms/${codigo}/meta`)) == null) break;
    }
    const cfg = {
      total: deck.length, tempo, placar,
      pts: [c.cfg.pontos_facil, c.cfg.pontos_medio, c.cfg.pontos_dificil],
      difs: [...new Set(deck.map((q) => q.dif))].sort(),
      extras,
    };
    await net.put(`rooms/${codigo}/meta`, { hostUid: S.uid, at: net.ts() });
    await net.put(`rooms/${codigo}/private`, { deck });
    await net.put(`rooms/${codigo}/state`, { phase: "lobby", total: deck.length, cfg });
    guarda("sala", codigo);
    location.href = `${BASE}?sala=${codigo}&v=host`;
  } catch (e) {
    console.error(e);
    c.aCriar = false;
    c.erroCriar = "Não consegui criar a sala. Verifica a ligação à internet e tenta outra vez.";
    pintar();
  }
};

// ---------- Anfitrião ----------

function painelEquipas() {
  const e = S.estado;
  const eq = S.equipas || {};
  const ids = Object.keys(eq).sort((a, b) => {
    const pa = e.scores && e.scores[a] ? e.scores[a].pos : 999;
    const pb = e.scores && e.scores[b] ? e.scores[b].pos : 999;
    return pa - pb || (eq[a].at || 0) - (eq[b].at || 0);
  });
  if (!ids.length) return `<section class="cartao"><h2>Equipas</h2><p class="nota-escura">Ainda ninguém entrou.</p></section>`;
  const linhas = ids.map((id) => {
    let sinal = "";
    if (e.phase === "question") {
      sinal = S.respostas && S.respostas[id] ? `<span class="sinal ok">respondeu</span>` : `<span class="sinal">a pensar</span>`;
    } else if (e.phase === "reveal") {
      const r = e.reveal && e.reveal.res && e.reveal.res[id];
      sinal = !r ? "" : r.ok ? `<span class="sinal ok">certo, +${r.g}</span>` : r.c >= 0 ? `<span class="sinal mal">errado</span>` : `<span class="sinal">sem resposta</span>`;
    }
    const pts = e.scores && e.scores[id] ? e.scores[id].pts : 0;
    return `<li><span class="nome">${esc(eq[id].nome)}</span>${sinal}<span class="pts">${pts}</span>
      <button class="mini" data-act="ajustar" data-id="${esc(id)}">Pontos</button>
      <button class="mini" data-act="remover" data-id="${esc(id)}">Remover</button></li>`;
  });
  return `<section class="cartao"><h2>${plural(ids.length, "equipa", "equipas")}</h2><ul class="lista-equipas">${linhas.join("")}</ul></section>`;
}

VISTAS.host = () => {
  if (S.meta === undefined || S.estado === undefined) return espera();
  if (S.meta === null) return semSala();
  if (!souAnfitriao()) return mensagem("Este jogo é de outro dispositivo", "Só o telemóvel ou computador que criou a sala a pode controlar. Abre este link nesse dispositivo.");
  if (!S.estado || S.priv === undefined) return espera();
  if (!S.priv || !S.priv.deck) return mensagem("Faltam os dados do jogo", "Não foi possível recuperar as perguntas desta sala. Cria um jogo novo.", `<a class="btn" href="${esc(BASE)}?v=criar">Criar um jogo</a>`);
  const e = S.estado;
  const nEq = Object.keys(S.equipas || {}).length;
  const linkEquipas = `${BASE}?sala=${SALA}`;
  let corpo = "", botoes = "";

  if (e.phase === "lobby") {
    corpo = `<section class="cartao"><h1>À espera das equipas</h1>
      <p>Abre o ecrã principal na televisão ou no projetor. As equipas entram pelo código QR que lá aparece, ou por este link:</p>
      <p class="link"><span>${esc(linkEquipas)}</span><button class="mini" data-act="copiar">Copiar o link</button></p></section>`;
    botoes = `<button class="btn" data-act="regras">Mostrar as regras</button>`;
  } else if (e.phase === "rules") {
    corpo = `<section class="cartao"><h1>Regras no ecrã</h1><p>Toda a gente está a ver isto. Lê em voz alta se quiseres.</p>${listaRegras(e.cfg)}</section>`;
    botoes = `<button class="btn" data-act="comecar" ${nEq ? "" : "disabled"}>Começar o jogo</button>${nEq ? "" : `<p class="nota">Falta entrar pelo menos uma equipa.</p>`}`;
  } else if (e.phase === "question" || e.phase === "reveal") {
    const q = S.priv.deck[e.qNum - 1];
    const nResp = Object.keys(S.respostas || {}).length;
    corpo = `<section class="cartao">${etiquetas(e)}<h1 class="pergunta-host">${esc(e.q.texto)}</h1>
      <ol class="opcoes-host">${e.q.opcoes.map((o, i) => `<li class="${i === q.correta ? "certa" : ""}"><b>${LETRAS[i]}</b> ${esc(o)}${i === q.correta ? ` <span class="sinal ok">certa</span>` : ""}</li>`).join("")}</ol>
      ${e.phase === "question" ? `${relogio()}<p>Responderam ${nResp} de ${plural(nEq, "equipa", "equipas")}.</p>` : `<p>A resposta já está no ecrã.</p>`}</section>`;
    if (e.phase === "question") {
      botoes = `<button class="btn" data-act="revelar">Mostrar a resposta já</button><button class="btn sec" data-act="saltar">Saltar esta pergunta</button>`;
    } else {
      const ultima = e.qNum >= e.total;
      const rotulo = ultima ? "Ver o pódio" : e.qNum % e.cfg.placar === 0 ? "Mostrar a classificação" : "Pergunta seguinte";
      botoes = `<button class="btn" data-act="seguinte">${rotulo}</button>`;
    }
  } else if (e.phase === "scoreboard") {
    corpo = `<section class="cartao"><h1>Classificação no ecrã</h1><p>Feitas ${e.qNum} de ${plural(e.total, "pergunta", "perguntas")}.</p></section>`;
    botoes = `<button class="btn" data-act="seguinte">Pergunta seguinte</button>`;
  } else {
    corpo = `<section class="cartao"><h1>O jogo acabou</h1><p>O pódio está no ecrã principal.</p></section>`;
    botoes = `<a class="btn" href="${esc(BASE)}?v=criar">Criar outro jogo</a>`;
  }
  const meio = ["question", "reveal", "scoreboard"].includes(e.phase);
  return `<main class="coluna">
    <header class="topo"><p class="sala">Sala <b>${SALA}</b></p><a class="btn sec peq" target="_blank" rel="noopener" href="${esc(BASE)}?sala=${SALA}&v=ecra">Abrir o ecrã principal</a></header>
    ${corpo}
    <div class="acoes">${botoes}</div>
    ${painelEquipas()}
    ${meio ? `<p class="nota"><button class="ligacao" data-act="terminar">Terminar o jogo agora</button></p>` : ""}
  </main>`;
};

function tabela(hist, adj, ganhos) {
  const eq = S.equipas || {};
  return L.classificacao(L.totais(hist, adj, eq), eq, S.estado && S.estado.scores, ganhos);
}

async function proximaPergunta(i) {
  const deck = S.priv.deck;
  if (i >= deck.length) return net.patch(caminho("state"), { phase: "final", scores: tabela(S.priv.hist, S.priv.adj) });
  const q = deck[i];
  const cfg = S.estado.cfg;
  return net.patch(caminho("state"), {
    phase: "question",
    qNum: i + 1,
    qKey: "q" + i,
    q: { tema: q.tema, dif: q.dif, tipo: q.tipo, texto: q.texto, opcoes: q.opcoes, bonus: !!q.bonus, pts: L.pontos(q.dif, cfg.pts) },
    startedAt: net.ts(),
    duracao: q.tempo || cfg.tempo,
    answered: null,
    reveal: null,
  });
}

let aRevelar = false;
async function revelar() {
  const e = S.estado;
  if (aRevelar || !e || e.phase !== "question" || !S.priv || !souAnfitriao()) return;
  if (S.respKey !== e.qKey) return; // as respostas desta pergunta ainda não chegaram
  aRevelar = true;
  try {
    const q = S.priv.deck[e.qNum - 1];
    const res = L.pontuar({ correta: q.correta, pts: e.q.pts, respostas: S.respostas, equipas: S.equipas, inicio: e.startedAt, duracao: e.duracao });
    await net.put(caminho("private/hist/" + e.qKey), res);
    const hist = { ...(S.priv.hist || {}), [e.qKey]: res };
    const curto = {};
    for (const [id, r] of Object.entries(res)) curto[id] = { c: r.c, ok: r.ok, g: r.g };
    await net.patch(caminho("state"), { phase: "reveal", reveal: { correta: q.correta, res: curto }, scores: tabela(hist, S.priv.adj, res) });
  } finally {
    aRevelar = false;
  }
}

function aoResponder() {
  const e = S.estado;
  if (!e || e.phase !== "question" || S.respKey !== e.qKey) return;
  const ids = Object.keys(S.respostas || {});
  if (ids.length !== Object.keys(e.answered || {}).length) {
    const m = {};
    ids.forEach((id) => { m[id] = true; });
    net.put(caminho("state/answered"), ids.length ? m : null).catch(console.error);
  }
  const eq = Object.keys(S.equipas || {});
  if (eq.length && eq.every((id) => S.respostas[id])) setTimeout(() => revelar().catch(falha), 700);
}

ACOES.copiar = async () => {
  try { await navigator.clipboard.writeText(`${BASE}?sala=${SALA}`); mostraAviso("Link copiado."); }
  catch { mostraAviso("Não deu para copiar. Seleciona o link e copia à mão."); }
  setTimeout(() => { if (ligado) mostraAviso(""); }, 2500);
};
ACOES.regras = () => net.patch(caminho("state"), { phase: "rules" });
ACOES.comecar = () => proximaPergunta(0);
ACOES.revelar = () => revelar();
ACOES.saltar = () => {
  if (!confirm("Saltar esta pergunta? Ninguém ganha pontos com ela.")) return;
  return proximaPergunta(S.estado.qNum);
};
ACOES.seguinte = () => {
  const e = S.estado;
  if (e.phase === "reveal" && e.qNum < e.total && e.qNum % e.cfg.placar === 0) return net.patch(caminho("state"), { phase: "scoreboard" });
  if (e.phase === "reveal" || e.phase === "scoreboard") return proximaPergunta(e.qNum);
};
ACOES.terminar = () => {
  if (!confirm("Terminar o jogo agora e mostrar o pódio?")) return;
  return net.patch(caminho("state"), { phase: "final", scores: tabela(S.priv.hist, S.priv.adj) });
};
ACOES.ajustar = async ({ id }) => {
  const eq = S.equipas && S.equipas[id];
  if (!eq) return;
  const txt = prompt(`Pontos a somar ou a tirar à equipa ${eq.nome} (por exemplo 50 ou -50):`, "");
  const d = parseInt(txt, 10);
  if (!Number.isFinite(d) || d === 0) return;
  const adj = { ...(S.priv.adj || {}), [id]: ((S.priv.adj && S.priv.adj[id]) || 0) + d };
  await net.put(caminho("private/adj/" + id), adj[id]);
  await net.patch(caminho("state"), { scores: tabela(S.priv.hist, adj) });
};
ACOES.remover = async ({ id }) => {
  const eq = S.equipas && S.equipas[id];
  if (!eq || !confirm(`Remover a equipa ${eq.nome} do jogo?`)) return;
  await net.del(caminho("teams/" + id));
  const resto = { ...(S.equipas || {}) };
  delete resto[id];
  S.equipas = resto;
  if (S.estado.scores) await net.patch(caminho("state"), { scores: tabela(S.priv.hist, S.priv.adj) });
};

// ---------- Ecrã principal ----------

VISTAS.ecra = () => {
  if (S.meta === undefined || S.estado === undefined) return espera();
  if (S.meta === null || !S.estado) return semSala();
  const e = S.estado;
  const eq = S.equipas || {};
  const nEq = Object.keys(eq).length;

  if (e.phase === "lobby") {
    const link = `${BASE}?sala=${SALA}`;
    const nomes = Object.values(eq).sort((a, b) => (a.at || 0) - (b.at || 0));
    return `<div class="grinalda"></div><main class="e-lobby">
      <div class="e-entrar">
        <h1 class="logo">${esc(NOME_DO_JOGO)}</h1>
        <p class="passo">Aponta a câmara do telemóvel ao código. Só é preciso um telemóvel por equipa.</p>
        <p class="passo">Ou abre <b>${esc(link.replace(/^https?:\/\//, "").replace(/\?.*$/, ""))}</b> e escreve</p>
        <p class="codigo">${SALA}</p>
      </div>
      <div class="qr">${qrSvg(link)}</div>
      <section class="e-equipas"><h2>${nEq ? plural(nEq, "equipa na sala", "equipas na sala") : "À espera da primeira equipa"}</h2>
        <ul>${nomes.map((t) => `<li>${esc(t.nome)}</li>`).join("")}</ul></section>
    </main>`;
  }
  if (e.phase === "rules") {
    return `<div class="grinalda"></div><main class="e-regras"><h1 class="titulo">Regras</h1>${listaRegras(e.cfg)}</main>`;
  }
  if (e.phase === "question" || e.phase === "reveal") {
    const rev = e.phase === "reveal" ? e.reveal || {} : null;
    const ops = e.q.opcoes.map((o, i) => {
      const cls = rev ? (i === rev.correta ? "certa" : "apagada") : "";
      return `<li class="op op${i} ${cls}"><span class="letra">${LETRAS[i]}</span><span class="txt">${esc(o)}</span></li>`;
    });
    let pe;
    if (rev) {
      const certos = Object.entries(rev.res || {}).filter(([, r]) => r.ok).map(([id]) => (eq[id] ? eq[id].nome : "")).filter(Boolean);
      pe = `<p class="e-pe">${certos.length ? `Acertaram: ${certos.map(esc).join(", ")}` : "Desta vez ninguém acertou."}</p>`;
    } else {
      const fim = S.ui.fim;
      pe = `${relogio()}<p class="e-pe">${fim ? "Acabou o tempo!" : `${Object.keys(e.answered || {}).length} de ${plural(nEq, "equipa já respondeu", "equipas já responderam")}`}</p>`;
    }
    return `<main class="e-pergunta">${etiquetas(e)}<h1 class="pergunta">${esc(e.q.texto)}</h1>
      <ol class="opcoes ${e.q.opcoes.length <= 2 ? "duas" : ""}">${ops.join("")}</ol>${pe}</main>`;
  }
  if (e.phase === "scoreboard") {
    return `<div class="grinalda"></div><main class="e-placar"><h1 class="titulo">Classificação</h1>${listaPontos(e.scores)}</main>`;
  }
  const ordem = L.emOrdem(e.scores);
  const degrau = (s, lugar) => (s ? `<div class="degrau d${lugar}"><p class="d-nome">${esc(s.nome)}</p><p class="d-pts">${s.pts} pontos</p><div class="d-bloco">${lugar}.º</div></div>` : "");
  const restantes = ordem.slice(3);
  return `<div class="grinalda"></div><main class="e-final"><h1 class="titulo">Pódio</h1>
    <div class="podio">${degrau(ordem[1], 2)}${degrau(ordem[0], 1)}${degrau(ordem[2], 3)}</div>
    ${restantes.length ? `<ol class="placar resto" start="4">${restantes.map((s) => `<li><span class="pos">${s.pos}.º</span><span class="nome">${esc(s.nome)}</span><span class="pts">${s.pts}</span></li>`).join("")}</ol>` : ""}
  </main>`;
};

// ---------- Equipa (telemóvel do capitão) ----------

VISTAS.equipa = () => {
  if (S.meta === undefined || S.estado === undefined || S.equipas === undefined) return espera();
  if (S.meta === null || !S.estado) return semSala();
  const e = S.estado;
  const eu = S.equipas[S.uid];
  if (!eu) {
    if (e.phase === "final") return mensagem("Este jogo já acabou", "Pede ao anfitrião o código do próximo jogo.");
    return `<main class="centro"><div class="grinalda"></div><h1 class="logo peq">${esc(NOME_DO_JOGO)}</h1>
      <form class="cartao" data-form="juntar">
        <label for="nome">Nome da equipa</label>
        <input id="nome" maxlength="24" autocomplete="off" required placeholder="Os Imbatíveis">
        <p class="ajuda">Este telemóvel fica a ser o da equipa. É nele que se responde.</p>
        ${S.ui.erroNome ? `<p class="erro" role="alert">${esc(S.ui.erroNome)}</p>` : ""}
        <button class="btn">Entrar na sala ${SALA}</button>
      </form></main>`;
  }
  const meu = e.scores && e.scores[S.uid];
  const rodape = `<footer class="q-rodape"><span class="nome">${esc(eu.nome)}</span><span class="pts">${meu ? meu.pts : 0} pontos</span></footer>`;
  let corpo;

  if (e.phase === "lobby") {
    corpo = `<h1 class="titulo">Estão dentro!</h1><p class="nota">Juntem a equipa à volta deste telemóvel. O jogo começa quando o anfitrião quiser.</p>`;
  } else if (e.phase === "rules") {
    corpo = `<h1 class="titulo">Regras</h1>${listaRegras(e.cfg)}`;
  } else if (e.phase === "question") {
    const minha = S.minha && S.minha.key === e.qKey ? S.minha : null;
    if (minha) {
      corpo = `${etiquetas(e)}<h1 class="titulo">Resposta enviada</h1><p class="escolha op${minha.c}"><span class="letra">${LETRAS[minha.c]}</span><span class="txt">${esc(e.q.opcoes[minha.c])}</span></p><p class="nota">Agora é esperar pelos outros.</p>`;
    } else if (S.ui.fim || S.ui.tarde === e.qKey) {
      corpo = `${etiquetas(e)}<h1 class="titulo">Acabou o tempo</h1><p class="nota">Desta vez ficou sem resposta.</p>`;
    } else {
      corpo = `${etiquetas(e)}<p class="q-pergunta">${esc(e.q.texto)}</p>${relogio()}
        <div class="q-opcoes">${e.q.opcoes.map((o, i) => `<button class="op op${i}" data-act="responder" data-i="${i}"><span class="letra">${LETRAS[i]}</span><span class="txt">${esc(o)}</span></button>`).join("")}</div>`;
    }
  } else if (e.phase === "reveal") {
    const r = e.reveal && e.reveal.res && e.reveal.res[S.uid];
    const certa = e.reveal ? e.q.opcoes[e.reveal.correta] : "";
    if (!r) corpo = `<h1 class="titulo">Entraram a meio</h1><p class="nota">Contam a partir da próxima pergunta.</p>`;
    else if (r.ok) corpo = `<h1 class="titulo bom">Certo!</h1><p class="grande">+${r.g} pontos</p>`;
    else corpo = `<h1 class="titulo mau">${r.c >= 0 ? "Errado" : "Sem resposta"}</h1><p class="nota">A resposta certa era:</p><p class="grande">${esc(certa)}</p>`;
  } else if (e.phase === "scoreboard") {
    corpo = `<h1 class="titulo">${meu ? `${meu.pos}.º lugar` : "Classificação"}</h1>${listaPontos(e.scores, S.uid)}`;
  } else {
    corpo = `<h1 class="titulo">${meu ? `Ficaram em ${meu.pos}.º lugar` : "Fim do jogo"}</h1>${meu && meu.pos === 1 ? `<p class="grande">Parabéns, campeões!</p>` : ""}${listaPontos(e.scores, S.uid)}`;
  }
  return `<main class="q-ecra">${corpo}</main>${rodape}`;
};

FORMS.juntar = async (form) => {
  const nome = form.querySelector("#nome").value.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!nome) return;
  const repetido = Object.values(S.equipas || {}).some((t) => L.norm(t.nome) === L.norm(nome));
  if (repetido) { S.ui.erroNome = "Já há uma equipa com esse nome. Escolham outro."; return pintar(); }
  S.ui.erroNome = "";
  try {
    await net.put(caminho("teams/" + S.uid), { nome, at: net.ts() });
  } catch (e) {
    console.error(e);
    S.ui.erroNome = "Não deu para entrar. Verifica a ligação à internet e tenta outra vez.";
    pintar();
  }
};

ACOES.responder = async ({ i }) => {
  const e = S.estado;
  if (!e || e.phase !== "question" || (S.minha && S.minha.key === e.qKey)) return;
  const k = e.qKey;
  S.minha = { key: k, c: Number(i), pendente: true };
  pintar();
  try {
    await net.put(caminho(`answers/${k}/${S.uid}`), { c: Number(i), at: net.ts() });
    if (S.minha && S.minha.key === k) S.minha.pendente = false;
  } catch {
    if (S.minha && S.minha.key === k) S.minha = null;
    S.ui.tarde = k;
    pintar();
  }
};

// ---------- Relógio ----------

function tique() {
  const e = S.estado;
  if (!e || e.phase !== "question" || !e.startedAt) return;
  const total = e.duracao * 1000;
  const resta = limita(e.startedAt + total - net.now(), 0, total);
  document.querySelectorAll("[data-seg]").forEach((el) => { el.textContent = Math.ceil(resta / 1000); });
  document.querySelectorAll("[data-barra]").forEach((el) => {
    el.style.transform = `scaleX(${resta / total})`;
    el.classList.toggle("pouco", resta <= 5000);
  });
  const fim = resta <= 0;
  if (fim !== !!S.ui.fim) { S.ui.fim = fim; pintar(); }
  if (VISTA === "host" && net.now() >= e.startedAt + total + 400) revelar().catch(console.error);
}

// ---------- Ligações ----------

let ligado = true;
let cancelaResp = null;
let chaveResp = null;

function aoEstado() {
  const e = S.estado;
  const k = (e && e.phase !== "lobby" && e.phase !== "rules" && e.qKey) || null;
  if (VISTA === "host" && !souAnfitriao()) return;
  if (VISTA !== "host" && VISTA !== "equipa") return;
  if (k === chaveResp) return;
  if (cancelaResp) cancelaResp();
  cancelaResp = null;
  chaveResp = k;
  S.respostas = null; S.respKey = null; S.minha = null;
  if (!k) return;
  if (VISTA === "host") {
    cancelaResp = net.watch(caminho("answers/" + k), (v) => {
      if (chaveResp !== k) return;
      S.respostas = v || {}; S.respKey = k;
      aoResponder();
      pintar();
    });
  } else {
    cancelaResp = net.watch(caminho(`answers/${k}/${S.uid}`), (v) => {
      if (chaveResp !== k) return;
      if (v && typeof v.c === "number") S.minha = { key: k, c: v.c };
      pintar();
    });
  }
}

async function manterAcordado() {
  if (!("wakeLock" in navigator)) return;
  const pede = async () => { try { await navigator.wakeLock.request("screen"); } catch { /* o navegador recusou */ } };
  await pede();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pede(); });
}

app.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-act]");
  if (!b || b.disabled) return;
  ev.preventDefault();
  const f = ACOES[b.dataset.act];
  if (f) Promise.resolve().then(() => f(b.dataset)).catch(falha);
});
app.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = FORMS[ev.target.dataset.form];
  if (f) Promise.resolve().then(() => f(ev.target)).catch(falha);
});
app.addEventListener("change", () => { if (VISTA === "criar") atualizarDisponiveis(); });
app.addEventListener("input", (ev) => {
  if (ev.target.id === "cod") ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z]/g, "");
});

async function arrancar() {
  document.title = NOME_DO_JOGO;
  document.body.className = "v-" + VISTA;
  if (VISTA === "inicio") { desenhar(); }
  try {
    S.uid = await net.init();
  } catch (e) {
    console.error(e);
    app.innerHTML = mensagem("Sem ligação ao jogo", "Não foi possível ligar ao servidor. Verifica a internet e recarrega a página.", "");
    return;
  }
  let temporizador = null;
  net.onConn((c) => {
    ligado = c;
    clearTimeout(temporizador);
    if (c) mostraAviso("");
    else temporizador = setTimeout(() => { if (!ligado) mostraAviso("Sem ligação à internet. A tentar ligar outra vez…"); }, 3000);
  });
  if (VISTA === "inicio" || VISTA === "criar") { desenhar(); return; }

  let privLigado = false;
  net.watch(caminho("meta"), (v) => {
    S.meta = v;
    if (VISTA === "host" && souAnfitriao() && !privLigado) {
      privLigado = true;
      net.watch(caminho("private"), (p) => { S.priv = p; pintar(); });
    }
    aoEstado();
    pintar();
  });
  net.watch(caminho("state"), (v) => { S.estado = v; aoEstado(); pintar(); });
  net.watch(caminho("teams"), (v) => { S.equipas = v || {}; if (VISTA === "host") aoResponder(); pintar(); });
  setInterval(tique, 200);
  manterAcordado();
}

arrancar();
