// Quiz & Mímica, fases 1 e 2: sala, entrada por QR, sorteio de equipas, perguntas, relógio, pontos e classificação.

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
  jogadores: undefined, hostExtra: false,
  respostas: null, respKey: null, minha: null,
  ui: { criar: { passo: "folha" } },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const caminho = (p) => `rooms/${SALA}/${p}`;
const souAnfitriao = () => !!S.meta && (S.meta.hostUid === S.uid || S.hostExtra);
const modo = () => (S.estado && S.estado.cfg && S.estado.cfg.modo) || "livre";
const minhaEquipa = () => Object.keys(S.equipas || {}).find((id) => S.equipas[id].cap === S.uid) || null;
const porOrdem = (eq) => Object.keys(eq || {}).sort((a, b) => (eq[a].ord ?? 99) - (eq[b].ord ?? 99) || (eq[a].at || 0) - (eq[b].at || 0));
const membros = (t) => (t && t.m) || [];
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
    escrito[el.id] = el.type === "checkbox" || el.type === "radio" ? { c: el.checked } : { v: el.value };
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
        <fieldset><legend>Como se formam as equipas</legend><div class="pilha">
          <label class="modo-op"><input type="radio" name="modo" id="m_scan" value="scan" checked> <span><b>Sorteio com os telemóveis.</b> Cada jogador lê o código QR e escreve o nome.</span></label>
          <label class="modo-op"><input type="radio" name="modo" id="m_lista" value="lista"> <span><b>Sorteio com uma lista.</b> Escreves tu os nomes de toda a gente.</span></label>
          <label class="modo-op"><input type="radio" name="modo" id="m_livre" value="livre"> <span><b>Sem sorteio.</b> Cada equipa entra com um telemóvel e escolhe o nome.</span></label>
        </div></fieldset>
        <div><label for="pin">PIN do anfitrião</label><input id="pin" type="text" inputmode="numeric" maxlength="6" value="${esc(c.pin)}" autocomplete="off">
          <p class="ajuda">Com este PIN podes controlar o jogo noutro telemóvel ou computador.</p></div>
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
    c.pin = c.pin || String(Math.floor(1000 + Math.random() * 9000));
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
  const escolhido = form.querySelector("input[name=modo]:checked");
  const modoEquipas = escolhido ? escolhido.value : "scan";
  const digitos = form.querySelector("#pin").value.replace(/\D/g, "");
  const pin = digitos.length >= 4 ? digitos.slice(0, 6) : c.pin;
  c.erroCriar = ""; c.aCriar = true; pintar();
  try {
    const deck = L.fazerBaralho(c.perguntas, { ...escolhas, n });
    let codigo = "";
    for (let i = 0; i < 8; i++) {
      codigo = L.novoCodigo();
      if ((await net.read(`rooms/${codigo}/meta`)) == null) break;
    }
    const cfg = {
      total: deck.length, tempo, placar, modo: modoEquipas,
      pts: [c.cfg.pontos_facil, c.cfg.pontos_medio, c.cfg.pontos_dificil],
      difs: [...new Set(deck.map((q) => q.dif))].sort(),
      extras,
    };
    await net.put(`rooms/${codigo}/meta`, { hostUid: S.uid, at: net.ts() });
    await net.put(`rooms/${codigo}/private`, { deck, pin });
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
    const tel = eq[id].cap ? "" : `<span class="sinal mal">sem telemóvel</span>`;
    const trocar = eq[id].cap ? `<button class="mini" data-act="libertar" data-id="${esc(id)}">Trocar de telemóvel</button>` : "";
    return `<li><span class="nome">${esc(eq[id].nome)}</span>${tel}${sinal}<span class="pts">${pts}</span>
      <button class="mini" data-act="ajustar" data-id="${esc(id)}">Pontos</button>${trocar}
      <button class="mini" data-act="remover" data-id="${esc(id)}">Remover</button></li>`;
  });
  return `<section class="cartao"><h2>${plural(ids.length, "equipa", "equipas")}</h2><ul class="lista-equipas">${linhas.join("")}</ul></section>`;
}

VISTAS.host = () => {
  if (S.meta === undefined || S.estado === undefined) return espera();
  if (S.meta === null) return semSala();
  if (!souAnfitriao()) {
    return `<main class="centro"><div class="grinalda"></div><h1 class="titulo">Controlar a sala ${SALA}</h1>
      <form class="cartao" data-form="pin">
        <label for="pinh">PIN do anfitrião</label>
        <input id="pinh" class="campo-codigo" type="text" inputmode="numeric" maxlength="6" autocomplete="off" required>
        <p class="ajuda">O PIN aparece no topo do ecrã do dispositivo que criou o jogo.</p>
        ${S.ui.erroPin ? `<p class="erro" role="alert">${esc(S.ui.erroPin)}</p>` : ""}
        <button class="btn">Controlar este jogo</button>
      </form></main>`;
  }
  if (!S.estado || S.priv === undefined) return espera();
  if (!S.priv || !S.priv.deck) return mensagem("Faltam os dados do jogo", "Não foi possível recuperar as perguntas desta sala. Cria um jogo novo.", `<a class="btn" href="${esc(BASE)}?v=criar">Criar um jogo</a>`);
  const e = S.estado;
  const nEq = Object.keys(S.equipas || {}).length;
  const nTel = Object.values(S.equipas || {}).filter((t) => t.cap).length;
  const linkEquipas = `${BASE}?sala=${SALA}`;
  let corpo = "", botoes = "";

  if (e.phase === "lobby") {
    const textos = {
      livre: ["À espera das equipas", "As equipas entram pelo código QR que lá aparece, ou por este link:"],
      scan: ["À espera dos jogadores", "Cada jogador entra pelo código QR que lá aparece, ou por este link:"],
      lista: ["Preparar as equipas", "Depois do sorteio, um telemóvel por equipa entra pelo código QR que lá aparece, ou por este link:"],
    }[modo()];
    corpo = `<section class="cartao"><h1>${textos[0]}</h1>
      <p>Abre o ecrã principal na televisão ou no projetor. ${textos[1]}</p>
      <p class="link"><span>${esc(linkEquipas)}</span><button class="mini" data-act="copiar">Copiar o link</button></p></section>`;
    botoes = `<button class="btn" data-act="regras">Mostrar as regras</button>`;
  } else if (e.phase === "rules") {
    corpo = `<section class="cartao"><h1>Regras no ecrã</h1><p>Toda a gente está a ver isto. Lê em voz alta se quiseres.</p>${listaRegras(e.cfg)}</section>`;
    const falta = nEq - nTel;
    botoes = `<button class="btn" data-act="comecar" ${nTel ? "" : "disabled"}>Começar o jogo</button>${nTel ? (falta ? `<p class="nota">${plural(falta, "equipa ainda está", "equipas ainda estão")} sem telemóvel. Pode entrar mais tarde.</p>` : "") : `<p class="nota">Falta pelo menos uma equipa com telemóvel.</p>`}`;
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
    <header class="topo"><p class="sala">Sala <b>${SALA}</b>${S.priv.pin ? `<span class="pin">PIN ${esc(S.priv.pin)}</span>` : ""}</p><a class="btn sec peq" target="_blank" rel="noopener" href="${esc(BASE)}?sala=${SALA}&v=ecra">Abrir o ecrã principal</a></header>
    ${corpo}
    <div class="acoes">${botoes}</div>
    ${e.phase === "lobby" && modo() !== "livre" ? painelSorteio() : painelEquipas()}
    ${meio ? `<p class="nota"><button class="ligacao" data-act="terminar">Terminar o jogo agora</button></p>` : ""}
  </main>`;
};

function painelSorteio() {
  const eq = S.equipas || {};
  const ids = porOrdem(eq);
  const jog = S.jogadores || {};
  const erro = S.ui.erroSorteio ? `<p class="erro" role="alert">${esc(S.ui.erroSorteio)}</p>` : "";
  if (!ids.length) {
    const lista = Object.entries(jog).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    const entrada = modo() === "lista"
      ? `<label for="nomes">Nomes dos jogadores</label><textarea id="nomes" rows="6" placeholder="Um nome por linha, ou separados por vírgulas">${esc(lembra("nomes"))}</textarea>`
      : `<h2>${lista.length ? plural(lista.length, "jogador na sala", "jogadores na sala") : "Ainda ninguém entrou"}</h2>
         <ul class="lista-equipas">${lista.map(([u, p]) => `<li><span class="nome">${esc(p.nome)}</span><button class="mini" data-act="tirar" data-u="${esc(u)}">Remover</button></li>`).join("")}</ul>`;
    return `<form class="cartao" data-form="sortear">${entrada}
      <div><label for="neq">Número de equipas</label><input id="neq" type="number" min="1" max="12" value="4" inputmode="numeric"></div>
      ${erro}<button class="btn">Sortear as equipas</button></form>`;
  }
  const destinos = (menos) => ids.filter((x) => x !== menos).map((x) => `<option value="${esc(x)}">${esc(eq[x].nome)}</option>`).join("");
  const cartoes = ids.map((tid) => {
    const t = eq[tid];
    const linhas = membros(t).map((p, i) => {
      const papel = !p.u ? "" : t.cap === p.u ? `<span class="sinal ok">capitão</span>` : `<button class="mini" data-act="capitao" data-id="${esc(tid)}" data-u="${esc(p.u)}">Fazer capitão</button>`;
      return `<li><span class="nome">${esc(p.n)}</span>${papel}<select class="mini" data-mover data-id="${esc(tid)}" data-i="${i}" aria-label="Mover ${esc(p.n)}"><option value="">Mover para…</option>${destinos(tid)}<option value="__fora">Tirar do jogo</option></select></li>`;
    }).join("");
    return `<section class="cartao"><header class="eq-topo"><h2>${esc(t.nome)}</h2><button class="mini" data-act="renomear" data-id="${esc(tid)}">Mudar o nome</button></header>
      <p>${t.cap ? `<span class="sinal ok">telemóvel ligado</span> <button class="mini" data-act="libertar" data-id="${esc(tid)}">Trocar de telemóvel</button>` : `<span class="sinal mal">ainda sem telemóvel</span>`}</p>
      <ul class="lista-equipas">${linhas || `<li class="nota-escura">Sem jogadores.</li>`}</ul></section>`;
  }).join("");
  const dentro = new Set(ids.flatMap((tid) => membros(eq[tid]).map((p) => p.u).filter(Boolean)));
  const fora = Object.entries(jog).filter(([u]) => !dentro.has(u));
  const soltos = fora.length ? `<section class="cartao"><h2>Chegaram depois do sorteio</h2><ul class="lista-equipas">${fora.map(([u, p]) => `<li><span class="nome">${esc(p.nome)}</span><select class="mini" data-juntar data-u="${esc(u)}" aria-label="Juntar ${esc(p.nome)} a uma equipa"><option value="">Juntar a…</option>${destinos(null)}</select></li>`).join("")}</ul></section>` : "";
  return `${cartoes}${soltos}${erro}<p class="nota"><button class="ligacao" data-act="ressortear">Sortear outra vez</button></p>`;
}

FORMS.pin = async (form) => {
  const pin = form.querySelector("#pinh").value.replace(/\D/g, "");
  try {
    await net.put(caminho("hosts/" + S.uid), pin);
    S.ui.erroPin = "";
  } catch {
    S.ui.erroPin = "PIN errado. Confirma no dispositivo que criou o jogo.";
  }
  pintar();
};

FORMS.sortear = async (form) => {
  const m = modo();
  let pessoas;
  if (m === "lista") {
    const txt = form.querySelector("#nomes").value;
    guarda("nomes", txt);
    pessoas = L.lerNomes(txt).map((n) => ({ n }));
  } else {
    pessoas = Object.entries(S.jogadores || {}).map(([u, p]) => ({ n: p.nome, u }));
  }
  const k = limita(parseInt(form.querySelector("#neq").value, 10) || 2, 1, 12);
  if (pessoas.length < k) {
    S.ui.erroSorteio = pessoas.length ? `Com ${plural(pessoas.length, "jogador", "jogadores")} não dá para fazer ${plural(k, "equipa", "equipas")}.` : "Ainda não há jogadores para sortear.";
    return pintar();
  }
  S.ui.erroSorteio = "";
  const nomes = L.baralhar(L.NOMES_EQUIPA).slice(0, k);
  const equipas = {};
  L.sortear(pessoas, k).forEach((g, i) => {
    const t = { nome: nomes[i], ord: i, m: g };
    if (m === "scan") t.cap = g[Math.floor(Math.random() * g.length)].u;
    equipas["e" + (i + 1)] = t;
  });
  await net.put(caminho("teams"), equipas);
  await net.patch(caminho("state"), { sorteio: net.ts() });
};

ACOES.ressortear = async () => {
  if (!confirm("Desfazer estas equipas e sortear outra vez?")) return;
  await net.del(caminho("teams"));
};
ACOES.renomear = async ({ id }) => {
  const t = S.equipas && S.equipas[id];
  if (!t) return;
  const nome = (prompt("Novo nome da equipa:", t.nome) || "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!nome) return;
  await net.put(caminho(`teams/${id}/nome`), nome);
};
ACOES.libertar = async ({ id }) => {
  const t = S.equipas && S.equipas[id];
  if (!t || !confirm(`Desligar o telemóvel da equipa ${t.nome}? Depois, outro telemóvel pode entrar por ela.`)) return;
  await net.del(caminho(`teams/${id}/cap`));
};
ACOES.capitao = ({ id, u }) => net.put(caminho(`teams/${id}/cap`), u);
ACOES.tirar = ({ u }) => net.del(caminho("players/" + u));

async function mover(sel) {
  const { id, i } = sel.dataset;
  const para = sel.value;
  const eq = S.equipas || {};
  if (!para || !eq[id]) return;
  const de = membros(eq[id]).slice();
  const [p] = de.splice(Number(i), 1);
  if (!p) return;
  const mud = { [`${id}/m`]: de };
  if (p.u && eq[id].cap === p.u) { const outro = de.find((x) => x.u); mud[`${id}/cap`] = outro ? outro.u : null; }
  if (para !== "__fora" && eq[para]) {
    mud[`${para}/m`] = [...membros(eq[para]), p];
    if (p.u && !eq[para].cap && modo() === "scan") mud[`${para}/cap`] = p.u;
  }
  await net.patch(caminho("teams"), mud);
  if (para === "__fora" && p.u) await net.del(caminho("players/" + p.u));
}

async function juntar(sel) {
  const u = sel.dataset.u;
  const para = sel.value;
  const eq = S.equipas || {};
  const jog = S.jogadores && S.jogadores[u];
  if (!para || !eq[para] || !jog) return;
  const mud = { [`${para}/m`]: [...membros(eq[para]), { n: jog.nome, u }] };
  if (!eq[para].cap) mud[`${para}/cap`] = u;
  await net.patch(caminho("teams"), mud);
}

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
  const comTel = eq.filter((id) => S.equipas[id].cap);
  if (comTel.length && comTel.every((id) => S.respostas[id])) setTimeout(() => revelar().catch(falha), 700);
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
    const m = modo();
    const ids = porOrdem(eq);
    const morada = esc(link.replace(/^https?:\/\//, "").replace(/\?.*$/, ""));
    if (m !== "livre" && ids.length) {
      const total = ids.reduce((a, id) => a + membros(eq[id]).length, 0);
      const anim = e.sorteio && net.now() - e.sorteio < total * 200 + 1500;
      const falta = ids.some((id) => !eq[id].cap);
      const cartoes = ids.map((id, i) => {
        const t = eq[id];
        return `<section class="e-equipa cor${i % 5}"><h2>${esc(t.nome)}</h2>
          <ul>${membros(t).map((p, j) => `<li style="animation-delay:${((j * ids.length + i) * 0.2).toFixed(1)}s">${esc(p.n)}${p.u && t.cap === p.u ? ` <span class="cap">capitão</span>` : ""}</li>`).join("")}</ul>
          <p class="e-estado">${t.cap ? "telemóvel ligado" : "à espera do telemóvel"}</p></section>`;
      }).join("");
      const instr = m === "scan"
        ? "O capitão de cada equipa já tem a equipa no telemóvel. É nele que se responde."
        : "Um telemóvel por equipa: leiam o código e escolham a vossa equipa.";
      return `<div class="grinalda"></div><main class="e-sorteio ${anim ? "anim" : ""}">
        <header class="e-s-topo"><div><h1 class="titulo">Equipas</h1><p class="passo">${instr}</p></div>
          ${m === "lista" && falta ? `<div class="e-s-qr"><div class="qr">${qrSvg(link)}</div><p class="codigo">${SALA}</p></div>` : ""}</header>
        <div class="e-grelha">${cartoes}</div></main>`;
    }
    if (m === "lista") {
      return `<div class="grinalda"></div><main class="e-regras"><h1 class="logo">${esc(NOME_DO_JOGO)}</h1>
        <p class="passo largo">As equipas vão ser sorteadas daqui a nada. Fiquem de olho neste ecrã.</p></main>`;
    }
    const gente = m === "scan" ? Object.values(S.jogadores || {}) : Object.values(eq);
    const nomes = gente.sort((a, b) => (a.at || 0) - (b.at || 0));
    const n = nomes.length;
    const passo = m === "scan"
      ? "Cada jogador aponta a câmara do telemóvel ao código e escreve o nome."
      : "Aponta a câmara do telemóvel ao código. Só é preciso um telemóvel por equipa.";
    const conta = m === "scan"
      ? (n ? plural(n, "jogador na sala", "jogadores na sala") : "À espera do primeiro jogador")
      : (n ? plural(n, "equipa na sala", "equipas na sala") : "À espera da primeira equipa");
    return `<div class="grinalda"></div><main class="e-lobby">
      <div class="e-entrar">
        <h1 class="logo">${esc(NOME_DO_JOGO)}</h1>
        <p class="passo">${passo}</p>
        <p class="passo">Ou abre <b>${morada}</b> e escreve</p>
        <p class="codigo">${SALA}</p>
      </div>
      <div class="qr">${qrSvg(link)}</div>
      <section class="e-equipas"><h2>${conta}</h2>
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

function semEquipa(e) {
  const m = modo();
  const eq = S.equipas;
  const ids = porOrdem(eq);
  const erro = S.ui.erroNome ? `<p class="erro" role="alert">${esc(S.ui.erroNome)}</p>` : "";
  const acabou = () => mensagem("Este jogo já acabou", "Pede ao anfitrião o código do próximo jogo.");
  const ficha = (corpo) => `<main class="centro"><div class="grinalda"></div>${corpo}</main>`;
  if (m === "livre") {
    if (e.phase === "final") return acabou();
    return ficha(`<h1 class="logo peq">${esc(NOME_DO_JOGO)}</h1>
      <form class="cartao" data-form="juntar">
        <label for="nome">Nome da equipa</label>
        <input id="nome" maxlength="24" autocomplete="off" required placeholder="Os Imbatíveis">
        <p class="ajuda">Este telemóvel fica a ser o da equipa. É nele que se responde.</p>
        ${erro}<button class="btn">Entrar na sala ${SALA}</button>
      </form>`);
  }
  if (m === "scan") {
    if (S.jogadores === undefined) return espera();
    const eu = S.jogadores[S.uid];
    if (!eu) {
      if (e.phase === "final") return acabou();
      return ficha(`<h1 class="logo peq">${esc(NOME_DO_JOGO)}</h1>
        <form class="cartao" data-form="jogador">
          <label for="nome">O teu nome</label>
          <input id="nome" maxlength="24" autocomplete="off" required placeholder="Maria">
          <p class="ajuda">${ids.length ? "As equipas já foram sorteadas. O anfitrião junta-te a uma delas." : "As equipas são sorteadas quando toda a gente tiver entrado."}</p>
          ${erro}<button class="btn">Entrar na sala ${SALA}</button>
        </form>`);
    }
    if (!ids.length) return ficha(`<h1 class="titulo">Olá, ${esc(eu.nome)}!</h1><p class="nota">Já estás na lista. As equipas vão ser sorteadas no ecrã principal.</p>`);
    const minha = ids.find((id) => membros(eq[id]).some((p) => p.u === S.uid));
    if (!minha) return ficha(`<h1 class="titulo">Ainda sem equipa</h1><p class="nota">Pede ao anfitrião para te juntar a uma equipa.</p>`);
    const t = eq[minha];
    const cap = membros(t).find((p) => p.u === t.cap);
    return ficha(`<p class="nota">A tua equipa</p><h1 class="titulo">${esc(t.nome)}</h1><p>${membros(t).map((p) => esc(p.n)).join(", ")}</p>
      ${t.cap ? `<p class="nota">As respostas dão-se no telemóvel de ${cap ? esc(cap.n) : "outro jogador"}. Podes guardar o teu.</p>`
        : `<p class="nota">A equipa está sem telemóvel para responder.</p>${erro}<button class="btn" data-act="reclamar" data-id="${esc(minha)}">Responder com este telemóvel</button>`}`);
  }
  if (!ids.length) return ficha(`<h1 class="titulo">Falta o sorteio</h1><p class="nota">As equipas ainda não foram sorteadas. Este ecrã atualiza sozinho.</p>`);
  const livres = ids.some((id) => !eq[id].cap);
  const cartoes = ids.map((id) => {
    const t = eq[id];
    return `<section class="cartao"><h2>${esc(t.nome)}</h2><p>${membros(t).map((p) => esc(p.n)).join(", ")}</p>
      ${t.cap ? `<p class="nota-escura">Já tem telemóvel.</p>` : `<button class="btn" data-act="reclamar" data-id="${esc(id)}">Somos esta equipa</button>`}</section>`;
  }).join("");
  return `<main class="coluna"><h1 class="titulo">Qual é a vossa equipa?</h1>
    <p class="nota">${livres ? "Este telemóvel fica a ser o da equipa. É nele que se responde." : "Todas as equipas já têm telemóvel. Se o vosso deixou de funcionar, falem com o anfitrião."}</p>${erro}${cartoes}</main>`;
}

VISTAS.equipa = () => {
  if (S.meta === undefined || S.estado === undefined || S.equipas === undefined) return espera();
  if (S.meta === null || !S.estado) return semSala();
  const e = S.estado;
  const tid = minhaEquipa();
  const eu = tid && S.equipas[tid];
  if (!eu) return semEquipa(e);
  const meu = e.scores && e.scores[tid];
  const rodape = `<footer class="q-rodape"><span class="nome">${esc(eu.nome)}</span><span class="pts">${meu ? meu.pts : 0} pontos</span></footer>`;
  let corpo;

  if (e.phase === "lobby") {
    const gente = membros(eu).map((p) => p.n);
    corpo = `<h1 class="titulo">Estão dentro!</h1>${gente.length ? `<p class="grande">${esc(eu.nome)}</p><p>${gente.map(esc).join(", ")}</p>` : ""}
      <p class="nota">Este é o telemóvel da equipa. Juntem-se à volta dele: o jogo começa quando o anfitrião quiser.</p>`;
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
    const r = e.reveal && e.reveal.res && e.reveal.res[tid];
    const certa = e.reveal ? e.q.opcoes[e.reveal.correta] : "";
    if (!r) corpo = `<h1 class="titulo">Entraram a meio</h1><p class="nota">Contam a partir da próxima pergunta.</p>`;
    else if (r.ok) corpo = `<h1 class="titulo bom">Certo!</h1><p class="grande">+${r.g} pontos</p>`;
    else corpo = `<h1 class="titulo mau">${r.c >= 0 ? "Errado" : "Sem resposta"}</h1><p class="nota">A resposta certa era:</p><p class="grande">${esc(certa)}</p>`;
  } else if (e.phase === "scoreboard") {
    corpo = `<h1 class="titulo">${meu ? `${meu.pos}.º lugar` : "Classificação"}</h1>${listaPontos(e.scores, tid)}`;
  } else {
    corpo = `<h1 class="titulo">${meu ? `Ficaram em ${meu.pos}.º lugar` : "Fim do jogo"}</h1>${meu && meu.pos === 1 ? `<p class="grande">Parabéns, campeões!</p>` : ""}${listaPontos(e.scores, tid)}`;
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
    await net.put(caminho("teams/" + S.uid), { nome, cap: S.uid, at: net.ts() });
  } catch (e) {
    console.error(e);
    S.ui.erroNome = "Não deu para entrar. Verifica a ligação à internet e tenta outra vez.";
    pintar();
  }
};

FORMS.jogador = async (form) => {
  const nome = form.querySelector("#nome").value.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!nome) return;
  S.ui.erroNome = "";
  try {
    await net.put(caminho("players/" + S.uid), { nome, at: net.ts() });
  } catch (e) {
    console.error(e);
    S.ui.erroNome = "Não deu para entrar. Verifica a ligação à internet e tenta outra vez.";
    pintar();
  }
};

ACOES.reclamar = async ({ id }) => {
  S.ui.erroNome = "";
  try {
    await net.put(caminho(`teams/${id}/cap`), S.uid);
  } catch {
    S.ui.erroNome = "Outro telemóvel foi mais rápido. Escolham outra equipa ou falem com o anfitrião.";
    pintar();
  }
};

ACOES.responder = async ({ i }) => {
  const e = S.estado;
  const tid = minhaEquipa();
  if (!e || !tid || e.phase !== "question" || (S.minha && S.minha.key === e.qKey)) return;
  const k = e.qKey;
  S.minha = { key: k, c: Number(i), pendente: true };
  pintar();
  try {
    await net.put(caminho(`answers/${k}/${tid}`), { c: Number(i), at: net.ts() });
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
  const q = (e && e.phase !== "lobby" && e.phase !== "rules" && e.qKey) || null;
  if (VISTA === "host" && !souAnfitriao()) return;
  if (VISTA !== "host" && VISTA !== "equipa") return;
  const tid = VISTA === "equipa" ? minhaEquipa() : "";
  const k = q && (VISTA === "host" || tid) ? `${q}/${tid}` : null;
  if (k === chaveResp) return;
  if (cancelaResp) cancelaResp();
  cancelaResp = null;
  chaveResp = k;
  S.respostas = null; S.respKey = null; S.minha = null;
  if (!k) return;
  if (VISTA === "host") {
    cancelaResp = net.watch(caminho("answers/" + q), (v) => {
      if (chaveResp !== k) return;
      S.respostas = v || {}; S.respKey = q;
      aoResponder();
      pintar();
    });
  } else {
    cancelaResp = net.watch(caminho(`answers/${q}/${tid}`), (v) => {
      if (chaveResp !== k) return;
      if (v && typeof v.c === "number") S.minha = { key: q, c: v.c };
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
app.addEventListener("change", (ev) => {
  if (VISTA === "criar") atualizarDisponiveis();
  const t = ev.target;
  if (t.matches && t.matches("select[data-mover]")) mover(t).catch(falha);
  else if (t.matches && t.matches("select[data-juntar]")) juntar(t).catch(falha);
});
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
  const ligaPriv = () => {
    if (VISTA !== "host" || !souAnfitriao() || privLigado) return;
    privLigado = true;
    net.watch(caminho("private"), (p) => { S.priv = p; pintar(); });
  };
  net.watch(caminho("meta"), (v) => { S.meta = v; ligaPriv(); aoEstado(); pintar(); });
  if (VISTA === "host") net.watch(caminho("hosts/" + S.uid), (v) => { S.hostExtra = !!v; ligaPriv(); aoEstado(); pintar(); });
  net.watch(caminho("players"), (v) => { S.jogadores = v || {}; pintar(); });
  net.watch(caminho("state"), (v) => { S.estado = v; aoEstado(); pintar(); });
  net.watch(caminho("teams"), (v) => { S.equipas = v || {}; aoEstado(); if (VISTA === "host") aoResponder(); pintar(); });
  setInterval(tique, 200);
  manterAcordado();
}

arrancar();
